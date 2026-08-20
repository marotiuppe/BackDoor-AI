export interface MessageDto {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount: number;
  createdAt: string;
}

export interface ConversationDto {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages?: MessageDto[];
}

export interface ModelDescriptor {
  modelId: string;
  displayName: string;
  defaultModel: boolean;
  contextWindow: number;
}

export interface ProviderMetadata {
  providerName: string;
  configured: boolean;
  healthy: boolean;
  statusMessage: string;
  capabilities: string[];
  supportedModels: ModelDescriptor[];
  defaultModel: string;
}

export interface ChatResponseDto {
  userMessage: MessageDto;
  assistantMessage: MessageDto;
}

export interface SidecarInfo {
  qdrantPort: number;
  backendReady: boolean;
}

export interface CredentialStatus {
  provider: string;
  configured: boolean;
}

export interface DialogueTurn {
  speaker: 'Interviewer' | 'Candidate';
  text: string;
  timestampMs: number;
}

export interface AudioCaptureStatus {
  active: boolean;
  micActive: boolean;
  loopbackActive: boolean;
  sttSupported: boolean;
  deviceName: string;
  micDeviceName: string;
  loopbackDeviceName: string;
  sampleRate: number;
  vadThreshold: number;
  bufferSamples: number;
  lastSpeechTimestampMs: number;
  lastTranscript: string;
  lastMicTranscript: string;
  lastLoopbackTranscript: string;
  formattedDialogue: string;
  dialogueTurns: DialogueTurn[];
  autoAssistEnabled: boolean;
  errorMessage?: string | null;
}

export interface StarStory {
  id: string;
  title: string;
  targetCompany: string;
  leadershipPrinciple: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  keyLearnings: string;
  createdAt: string;
}

export interface VisionSnapshotResult {
  imageBase64: string;
  ocrText: string;
  width: number;
  height: number;
  error?: string | null;
}

export interface MockInterviewSession {
  id: string;
  title: string;
  targetRole: string;
  track: string;
  difficulty: string;
  overallScore: number;
  technicalDepthScore: number;
  communicationScore: number;
  structureScore: number;
  tradeoffsScore: number;
  strengths: string;
  blindspots: string;
  recommendations: string;
  transcriptJson: string;
  createdAt: string;
}

export interface OverlayHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface HudConversationItem {
  id: string;
  question: string;
  answer: string;
  mode?: string;
  timestamp?: number;
  isStreaming?: boolean;
  error?: string | null;
}

