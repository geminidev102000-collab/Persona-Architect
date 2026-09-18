import { GoogleGenAI, GenerateContentResponse, Chat, Modality, LiveServerMessage, FunctionDeclaration, Type, Tool, ThinkingLevel } from "@google/genai";
import { FileAttachment, ToolCallData } from "../types";
import { arrayBufferToBase64, decodeAudioData, float32ToInt16, base64ToUint8Array } from "./audioUtils";

// Safely access API Key
const apiKey = (typeof process !== 'undefined' && process.env && process.env.API_KEY) ? process.env.API_KEY : '';
const ai = new GoogleGenAI({ apiKey: apiKey });

// System instruction for the Architect
const ARCHITECT_SYSTEM_PROMPT = `You are a high-level Personal Architecture Agent. 
Your goal is to interview the user and analyze their documents to build a "Master Document Personal Information Agent Reference File".
This file will be used by other autonomous agents to understand the user's traits, preferences, history, and goals.

INPUT SOURCES:
- The user may upload text files, PDFs, or images.
- The user may paste content from Google Drive or Gmail exports.
- You may receive transcripts from Live Audio interviews.

OUTPUT:
- You must maintain a comprehensive Markdown document.
- Whenever you gather new significant information, call the "updateMasterDocument" function to save the latest version of the file.
- Do not just print the markdown in the chat; YOU MUST USE THE TOOL to save it.

BEHAVIOR:
- Be proactive. If information is missing (e.g., "What is your risk tolerance for trading?"), ask for it.
- If the user mentions a file (e.g., "Check my trading journal"), ask them to upload it or paste the content.
- Use your advanced reasoning capabilities to infer deeper traits from the conversation.`;

// --- Tool Definitions ---

const updateDocumentTool: FunctionDeclaration = {
  name: "updateMasterDocument",
  description: "Updates the content of the Master Reference Document. Call this whenever you have gathered enough information to create or refine the document sections.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      content: {
        type: Type.STRING,
        description: "The full, updated markdown content of the master document.",
      },
    },
    required: ["content"],
  },
};

const tools: Tool[] = [{ functionDeclarations: [updateDocumentTool] }];

// --- Standard Chat (Gemini 3.1 Pro) ---

export const createChatSession = async (): Promise<Chat> => {
  return ai.chats.create({
    model: 'gemini-3.1-pro-preview',
    config: {
      systemInstruction: ARCHITECT_SYSTEM_PROMPT,
      tools: tools,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    },
  });
};

export interface ChatResponse {
  text: string;
  toolCalls?: ToolCallData[];
}

export const sendMessageToChat = async (
  chat: Chat,
  message: string,
  attachments: FileAttachment[] = []
): Promise<ChatResponse> => {
  
  // Format contents
  const parts: any[] = [];
  
  attachments.forEach(att => {
    parts.push({
      inlineData: {
        mimeType: att.type,
        data: att.data
      }
    });
  });

  parts.push({ text: message });

  const result: GenerateContentResponse = await chat.sendMessage({
    content: { parts }
  });

  const response: ChatResponse = {
    text: result.text || "",
    toolCalls: []
  };

  // Check for function calls
  if (result.functionCalls && result.functionCalls.length > 0) {
    response.toolCalls = result.functionCalls.map(fc => ({
      name: fc.name,
      args: fc.args
    }));
  }

  return response;
};

// Send tool response back to model to maintain context
export const sendToolResponseToChat = async (
  chat: Chat,
  toolName: string,
  result: any
): Promise<string> => {
  const response = await chat.sendMessage({
    content: [{
      parts: [
        {
          functionResponse: {
            name: toolName,
            response: { result: result }
          }
        }
      ]
    }]
  });
  return response.text || "";
};

// --- Live API (Gemini 3.1 Flash Live) ---

export class LiveClient {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private volumeInterval: any = null;
  private currentInputTranscription = '';

  constructor(
    private onOutput: (text: string) => void, // For logging
    private onTranscript: (text: string) => void, // For collecting transcript
    private onStatus: (status: string) => void,
    private onVolume: (level: number) => void = () => {} // Callback for audio level
  ) {}

  getFrequencies(dataArray: Uint8Array) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(dataArray);
    }
  }

  async connect() {
    this.onStatus("connecting");
    
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const outputNode = this.outputAudioContext.createGain();
    outputNode.connect(this.outputAudioContext.destination);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Analyser for visualization
      this.analyser = this.inputAudioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.volumeInterval = setInterval(() => {
        if (this.analyser) {
          this.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for(let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          // Normalize roughly for visualization
          this.onVolume(Math.min(100, (average / 100) * 100));
        }
      }, 100);

      this.sessionPromise = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        callbacks: {
          onopen: () => {
            console.log("Live Session Opened");
            this.onStatus("connected");

            if (!this.stream || !this.inputAudioContext) return;

            const source = this.inputAudioContext.createMediaStreamSource(this.stream);
            this.inputSource = source;
            
            // Connect to analyser
            if (this.analyser) {
              source.connect(this.analyser);
            }

            // Connect to processor
            const processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
            this.processor = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              // Convert Float32 to Int16 PCM
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmData = base64EncodeUint8Array(new Uint8Array(int16.buffer));

              this.sessionPromise?.then((session) => {
                session.sendRealtimeInput({
                  audio: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: pcmData
                  }
                });
              });
            };

            source.connect(processor);
            processor.connect(this.inputAudioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
               try {
                this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
                const audioBuffer = await decodeAudioData(
                  base64ToUint8Array(base64Audio),
                  this.outputAudioContext,
                  24000,
                  1
                );
                
                const source = this.outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                source.start(this.nextStartTime);
                this.nextStartTime += audioBuffer.duration;
                this.sources.add(source);
                source.onended = () => this.sources.delete(source);
               } catch (e) {
                 console.error("Audio decode error", e);
               }
            }

            // Handle Transcripts
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
               // Model Text (not common in audio-only mode but possible)
               console.log("Model Text:", message.serverContent.modelTurn.parts[0].text);
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              this.onTranscript("Agent: " + text + "\n");
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              this.currentInputTranscription += text;
            }

            if (message.serverContent?.turnComplete) {
              if (this.currentInputTranscription) {
                this.onTranscript("User: " + this.currentInputTranscription + "\n");
                this.currentInputTranscription = '';
              }
            }
          },
          onclose: () => {
            console.log("Live Session Closed");
            this.onStatus("disconnected");
          },
          onerror: (err) => {
            console.error("Live Session Error", err);
            this.onStatus("error");
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: "You are an interviewer. Ask the user questions to understand their personality, trading style, and goals. Keep questions short and conversational."
        }
      });

    } catch (err) {
      console.error("Connection Failed", err);
      this.onStatus("error");
    }
  }

  disconnect() {
    this.onStatus("disconnected");
    
    if (this.volumeInterval) clearInterval(this.volumeInterval);

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.analyser) {
        this.analyser.disconnect();
        this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    
    this.sources.forEach(s => s.stop());
    this.sources.clear();
  }
}

// Helper for live client
function base64EncodeUint8Array(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}