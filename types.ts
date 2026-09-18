export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
  TOOL = 'function' // Added for tool handling
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  attachments?: FileAttachment[];
  isThinking?: boolean;
}

export interface FileAttachment {
  name: string;
  type: string;
  data: string; // Base64
}

export interface DocumentSection {
  title: string;
  content: string;
}

export interface MasterDocument {
  title: string;
  sections: DocumentSection[];
  lastUpdated: string;
}

// Live API Types
export interface LiveConfig {
  model: string;
  systemInstruction?: string;
}

export interface ToolCallData {
  name: string;
  args: any;
}
