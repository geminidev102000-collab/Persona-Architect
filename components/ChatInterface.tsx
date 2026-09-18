import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, Paperclip, Image as ImageIcon, Loader2, Bot, User, BrainCircuit, FileJson, HardDrive, HelpCircle, X, MessageSquare, Mic, AlertCircle } from 'lucide-react';
import { ChatMessage, MessageRole, FileAttachment } from '../types';
import { Chat } from '@google/genai';
import { createChatSession, sendMessageToChat, sendToolResponseToChat } from '../services/geminiService';
import { initDriveApi, openPicker, downloadDriveFiles, DriveDownloadResult } from '../services/driveService';

interface ChatInterfaceProps {
  onUpdateDocument: (content: string) => void;
}

export interface ChatInterfaceRef {
  injectMessage: (text: string) => void;
}

// Utility for retrying async operations with backoff
async function retryOperation<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryOperation(fn, retries - 1, delay * 2);
  }
}

const getDriveErrorMessage = (error: any): string => {
  const msg = error?.message || error?.error?.message || (typeof error === 'string' ? error : 'Unknown error');
  
  if (msg.includes("popup_closed_by_user")) return "Sign-in cancelled by user.";
  if (msg.includes("access_denied")) return "Access denied. Please grant permission to view Drive files.";
  if (msg.includes("popup_blocked_by_browser")) return "Pop-up blocked. Please allow pop-ups for this site.";
  if (msg.includes("origin_mismatch")) return "Configuration Error: Origin mismatch.";
  if (msg.includes("Rate Limit Exceeded") || msg.includes("429")) return "Drive API rate limit exceeded. Please try again in a moment.";
  if (msg.includes("403")) return "Access Forbidden. You may not have permission to access these files.";
  if (msg.includes("401")) return "Authentication expired. Please reload the page.";
  if (msg.includes("network")) return "Network connection error. Please check your internet.";
  
  return "Drive Error: " + (msg.length > 100 ? msg.substring(0, 100) + '...' : msg);
};

const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(({ onUpdateDocument }, ref) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isFileProcessing, setIsFileProcessing] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [showGuide, setShowGuide] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initialize Chat
    const initChat = async () => {
      const session = await createChatSession();
      setChatSession(session);
      
      const initialMsg: ChatMessage = {
        id: 'init',
        role: MessageRole.MODEL,
        text: "Greetings. I am your Personal Architecture Agent. I'm here to help you construct your Master Reference Document.\n\nPlease upload relevant files (Trading Logs, Journal Entries, Drive Exports) or simply speak with me to begin analyzing your traits and history.",
        timestamp: Date.now()
      };
      setMessages([initialMsg]);
    };
    initChat();

    // Initialize Drive API
    let interval: any;
    if (typeof window !== 'undefined') {
       interval = setInterval(() => {
         const w = window as any;
         if (w.google && w.google.accounts && w.google.accounts.oauth2 && w.gapi) {
            try {
              initDriveApi({
                onAuthChange: (inited) => console.log("Drive API Initialized:", inited)
              });
            } catch (err) {
              console.error("Failed to initialize Drive API", err);
            }
            clearInterval(interval);
         }
       }, 500);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useImperativeHandle(ref, () => ({
    injectMessage: (text: string) => {
      setInputValue(text);
    }
  }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsFileProcessing(true);
      try {
        const filePromises = Array.from(files).map((file: File) => 
          new Promise<FileAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (entry) => {
              const base64 = (entry.target?.result as string).split(',')[1];
              resolve({
                name: file.name,
                type: file.type,
                data: base64
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        );
        
        const newAttachments = await Promise.all(filePromises);
        setAttachments(prev => [...prev, ...newAttachments]);
      } catch (error) {
        console.error("Error processing files", error);
        // Optionally inject a system message here about failure
      } finally {
        setIsFileProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleDriveClick = async () => {
    try {
      setIsDriveLoading(true);
      
      // Step 1: Open Picker (User Interaction - No Retry)
      const pickedDocs = await openPicker();
      
      if (pickedDocs && pickedDocs.length > 0) {
        setMessages(prev => [...prev, {
          id: 'drive-loading-' + Date.now(),
          role: MessageRole.SYSTEM,
          text: `Processing ${pickedDocs.length} items from Google Drive...`,
          timestamp: Date.now()
        }]);

        // Step 2: Download Files (Network Operation - With Retry)
        const { attachments: driveAttachments, failed }: DriveDownloadResult = await retryOperation(
          () => downloadDriveFiles(pickedDocs)
        );

        setAttachments(prev => [...prev, ...driveAttachments]);
        
        let successText = `Successfully attached ${driveAttachments.length} files from Drive.`;
        
        if (failed.length > 0) {
          const errorList = failed.map(f => `• ${f.name}: ${f.error}`).join('\n');
          successText += `\n\n⚠️ Failed to import ${failed.length} files:\n${errorList}`;
        }
        
        setMessages(prev => [...prev, {
          id: 'drive-done-' + Date.now(),
          role: MessageRole.SYSTEM,
          text: successText,
          timestamp: Date.now()
        }]);
      }
    } catch (error: any) {
      console.error("Drive Error", error);
      const friendlyError = getDriveErrorMessage(error);
      
      setMessages(prev => [...prev, {
        id: 'drive-err-' + Date.now(),
        role: MessageRole.SYSTEM,
        text: `Error accessing Google Drive: ${friendlyError}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsDriveLoading(false);
    }
  };

  const processResponse = async (responseText: string, toolCalls?: any[]) => {
    if (responseText) {
      const modelMsg: ChatMessage = {
        id: Date.now().toString(),
        role: MessageRole.MODEL,
        text: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, modelMsg]);
    }

    if (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (call.name === 'updateMasterDocument') {
          setMessages(prev => [...prev, {
            id: 'tool-' + Date.now(),
            role: MessageRole.SYSTEM,
            text: "Updating Master Document...",
            timestamp: Date.now()
          }]);
          
          onUpdateDocument(call.args.content);

          if (chatSession) {
             await sendToolResponseToChat(chatSession, call.name, { success: true });
          }
        }
      }
    }
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && attachments.length === 0) || !chatSession || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: MessageRole.USER,
      text: inputValue,
      timestamp: Date.now(),
      attachments: [...attachments]
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setAttachments([]);
    setIsLoading(true);

    try {
      setMessages(prev => [...prev, { id: 'thinking', role: MessageRole.MODEL, text: '', timestamp: Date.now(), isThinking: true }]);
      
      const response = await sendMessageToChat(chatSession, userMsg.text, userMsg.attachments);
      
      setMessages(prev => prev.filter(m => m.id !== 'thinking'));
      await processResponse(response.text, response.toolCalls);

    } catch (error) {
      console.error("Chat error", error);
      setMessages(prev => prev.filter(m => m.id !== 'thinking'));
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: MessageRole.MODEL,
        text: "I encountered an error processing that request. Please try again.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700 relative">
      {/* Help Button */}
      <button 
        onClick={() => setShowGuide(true)}
        className="absolute top-4 right-4 z-10 p-2 text-slate-500 hover:text-indigo-400 transition-colors rounded-full hover:bg-slate-800"
        title="Help & Guide"
      >
        <HelpCircle size={20} />
      </button>

      {/* Onboarding Guide Overlay */}
      {showGuide && (
        <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-6 fade-in">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-2xl w-full shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button 
                  onClick={() => setShowGuide(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">Persona Architect Quick Start</h2>
                  <p className="text-slate-400">Build your Master Reference Document in 3 simple steps.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Step 1 */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 hover:border-indigo-500/30 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-3">
                            <HardDrive size={20} className="text-indigo-400" />
                        </div>
                        <h3 className="text-white font-medium mb-1">1. Import Data</h3>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Click the <strong>Drive icon</strong> to securely import your Trading Journals, Logs, or History. The agent analyzes these to infer your risk profile.
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 hover:border-red-500/30 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center mb-3">
                            <Mic size={20} className="text-red-400" />
                        </div>
                        <h3 className="text-white font-medium mb-1">2. Live Interview</h3>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Click <strong>"Start Live Interview"</strong> (top right) to have a voice conversation. The agent will ask deep questions to uncover hidden traits.
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 hover:border-green-500/30 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center mb-3">
                            <FileJson size={20} className="text-green-400" />
                        </div>
                        <h3 className="text-white font-medium mb-1">3. Review & Export</h3>
                        <p className="text-slate-400 text-xs leading-relaxed">
                            Watch the <strong>Master Document</strong> (right panel) evolve in real-time. Use the chat to refine sections, then export the final Markdown file.
                        </p>
                    </div>
                </div>

                <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-lg p-4 flex gap-3 mb-8">
                    <HelpCircle className="text-indigo-400 shrink-0 mt-0.5" size={18} />
                    <p className="text-indigo-200 text-xs">
                        <strong>Pro Tip:</strong> You can upload PDFs or text files directly using the paperclip icon if they aren't on Drive.
                    </p>
                </div>

                <button 
                  onClick={() => setShowGuide(false)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
                >
                    Start Building
                </button>
            </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pt-12">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${
              msg.role === MessageRole.USER 
                ? 'bg-indigo-600 text-white rounded-br-none' 
                : msg.role === MessageRole.SYSTEM 
                  ? 'bg-slate-800/50 text-slate-400 text-xs text-center w-full border border-dashed border-slate-700'
                  : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
            }`}>
              {/* Header */}
              {msg.role !== MessageRole.SYSTEM && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                  {msg.role === MessageRole.USER ? <User size={14} /> : <Bot size={14} />}
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {msg.role === MessageRole.USER ? 'You' : 'Architect Agent'}
                  </span>
                  <span className="text-[10px] text-slate-400 opacity-75 ml-auto">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              
              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 bg-black/20 rounded px-2 py-1 text-xs">
                      <FileJson size={12} />
                      <span className="truncate max-w-[150px]">{att.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Text Content */}
              {msg.isThinking ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="relative flex items-center justify-center w-6 h-6">
                    <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-25"></div>
                    <BrainCircuit size={20} className="text-indigo-400 relative z-10" />
                  </div>
                  <span className="text-sm font-medium text-indigo-300 animate-pulse">Architect is thinking...</span>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        {/* Attachment Preview */}
        {(attachments.length > 0 || isFileProcessing) && (
           <div className="flex flex-wrap gap-2 mb-2">
             {attachments.map((att, i) => (
               <div key={i} className="relative group bg-slate-800 border border-slate-700 rounded px-3 py-1 text-xs flex items-center gap-2">
                 <span className="truncate max-w-[200px] text-slate-300">{att.name}</span>
                 <button 
                   onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                   className="text-slate-500 hover:text-red-400"
                 >
                   <X size={12} />
                 </button>
               </div>
             ))}
             {isFileProcessing && (
                <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded px-3 py-1 text-xs text-slate-400 animate-pulse">
                   <Loader2 size={12} className="animate-spin" />
                   <span>Processing...</span>
                </div>
             )}
           </div>
        )}

        <div className="relative flex items-end gap-2 bg-slate-800 p-2 rounded-xl border border-slate-700 focus-within:border-indigo-500/50 transition-colors">
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            multiple 
            onChange={handleFileUpload}
          />
          
          <div className="flex flex-col gap-1 pb-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors"
              title="Upload File"
            >
              <Paperclip size={20} />
            </button>
            <button 
              onClick={handleDriveClick}
              disabled={isDriveLoading}
              className={`p-2 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded-lg transition-colors ${isDriveLoading ? 'animate-spin' : ''}`}
              title="Add from Google Drive"
            >
              {isDriveLoading ? <Loader2 size={20} /> : <HardDrive size={20} />}
            </button>
          </div>

          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe yourself, paste content, or ask questions..."
            className="flex-1 bg-transparent border-0 focus:ring-0 text-sm text-slate-200 placeholder:text-slate-500 min-h-[44px] max-h-32 resize-none py-3"
            rows={1}
          />

          <button
            onClick={handleSend}
            disabled={isLoading || (!inputValue.trim() && attachments.length === 0)}
            className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg transition-all shadow-lg shadow-indigo-500/20 mb-1"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <div className="text-center mt-2">
            <p className="text-[10px] text-slate-600">
                Gemini 3.1 Pro can make mistakes. Review generated documents.
            </p>
        </div>
      </div>
    </div>
  );
});

export default ChatInterface;