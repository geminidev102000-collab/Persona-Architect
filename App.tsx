import React, { useState, useRef } from 'react';
import ChatInterface, { ChatInterfaceRef } from './components/ChatInterface';
import DocumentViewer from './components/DocumentViewer';
import LiveSession from './components/LiveSession';
import { Mic, Layout, Terminal } from 'lucide-react';

const App: React.FC = () => {
  const [documentContent, setDocumentContent] = useState<string>('');
  const [isLiveOpen, setIsLiveOpen] = useState(false);
  const chatRef = useRef<ChatInterfaceRef>(null);

  // Replaced heuristic with direct set from Function Call
  const handleUpdateDocument = (newContent: string) => {
    setDocumentContent(newContent);
  };

  const handleLiveSessionClose = (transcript?: string) => {
    setIsLiveOpen(false);
    if (transcript && transcript.trim().length > 0 && chatRef.current) {
      // Feed transcript into chat
      const message = `[SYSTEM: The user just finished a Live Audio Interview. Here is the transcript. Please analyze it and update the Master Document if new traits were discovered.]\n\nTRANSCRIPT:\n${transcript}`;
      chatRef.current.injectMessage(message);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* App Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-6 shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
             <Terminal size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight">Persona Architect</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Gemini 3.1 Pro + Live Audio</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <button 
             onClick={() => setIsLiveOpen(true)}
             className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-full text-sm font-medium shadow-lg shadow-red-500/20 transition-all hover:scale-105"
           >
             <Mic size={16} />
             <span>Start Live Interview</span>
           </button>
        </div>
      </header>

      {/* Main Content Split */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="w-1/2 min-w-[400px] border-r border-slate-800">
          <ChatInterface ref={chatRef} onUpdateDocument={handleUpdateDocument} />
        </div>

        {/* Right: Document */}
        <div className="w-1/2 min-w-[400px] bg-slate-950">
          <DocumentViewer content={documentContent} />
        </div>
      </main>

      {/* Live Session Overlay */}
      <LiveSession isOpen={isLiveOpen} onClose={handleLiveSessionClose} />
    </div>
  );
};

export default App;
