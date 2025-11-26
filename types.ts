export enum AppMode {
  Chat = 'chat',
  Canvas = 'canvas',
  Agent = 'agent',
  Image = 'image',
  Video = 'video'
}

export enum ModelId {
  GeminiFlash = 'gemini-2.5-flash',
  GeminiPro = 'gemini-3-pro-preview',
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export interface Attachment {
  id: string;
  type: 'image';
  data: string; // Base64
  mimeType: string;
}

export interface ArtifactFile {
  name: string;
  language: string;
  content: string;
}

export interface Artifact {
  id: string;
  type: 'code' | 'document';
  title: string;
  content: string; // Raw content from LLM
  files: ArtifactFile[]; // Parsed files
  status: 'streaming' | 'complete';
}

export interface GeneratedMedia {
  type: 'image' | 'video';
  url: string;
  mimeType?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  artifact?: Artifact;
  generatedMedia?: GeneratedMedia;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  modelId: ModelId;
}