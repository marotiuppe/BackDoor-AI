import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Headphones,
  KeyRound,
  Loader2,
  Mic,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Type,
  UploadCloud,
  User,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { StarStory } from '../types/chat';

interface UserProfileData {
  fullName: string;
  targetRole: string;
  bio: string;
  skills: string;
  projects: string;
  resumeText: string;
  customInstructions: string;
}

interface KnowledgeDocument {
  id: string;
  title: string;
  docType: string;
  content: string;
  createdAt: string;
}

type CredentialProvider = 'OPENAI' | 'GEMINI' | 'ANTHROPIC' | 'GROQ' | 'OLLAMA';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCredentialsUpdated?: () => void;
  onResetOnboarding?: () => void;
}

const AUDIO_STT_MODELS = [
  {
    id: 'whisper-large-v3-turbo',
    provider: 'GROQ',
    name: 'Groq Whisper Large v3 Turbo',
    badge: 'Ultra-Fast (Sub-100ms)',
    desc: 'Lightning speed transcription on Groq LPUs. Ideal for live interview calls.',
  },
  {
    id: 'whisper-large-v3',
    provider: 'GROQ',
    name: 'Groq Whisper Large v3',
    badge: 'Highest Accuracy',
    desc: 'State-of-the-art transcription fidelity across technical coding terms & accents.',
  },
  {
    id: 'distil-whisper-large-v3-en',
    provider: 'GROQ',
    name: 'Groq Distil-Whisper Large v3 EN',
    badge: 'English Optimized',
    desc: 'Distilled English-optimized speech recognition with minimal latency.',
  },
  {
    id: 'whisper-1',
    provider: 'OPENAI',
    name: 'OpenAI Whisper-1',
    badge: 'Official OpenAI',
    desc: 'Official cloud transcription model with multilingual support across 99+ languages.',
  },
];

const PROVIDER_MODELS: Record<CredentialProvider, { id: string; name: string; desc: string }[]> = {
  GEMINI: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Flagship fast multimodal reasoning (Recommended)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', desc: 'High speed multimodal assistance' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: 'Complex system design & long context' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Next-gen experimental flash model' },
  ],
  GROQ: [
    { id: 'llama3-70b-8192', name: 'LLaMA 3 70B (8k)', desc: 'Ultra-fast LPU inference (Recommended)' },
    { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B Versatile', desc: 'High accuracy versatile chat' },
    { id: 'llama3-8b-8192', name: 'LLaMA 3 8B (8k)', desc: 'Sub-100ms ultra-low latency' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (32k)', desc: 'Large context window fast analysis' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', desc: 'High-level reasoning & coding' },
  ],
  OPENAI: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', desc: 'Flagship multimodal vision & reasoning (Recommended)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Fast, lightweight and cost effective' },
    { id: 'o3-mini', name: 'o3-mini Reasoning', desc: 'Fast STEM & coding reasoning' },
  ],
  ANTHROPIC: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', desc: 'Precision code generation & writing (Recommended)' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', desc: 'Ultra-fast responsive assistance' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', desc: 'Frontier reasoning & complex coding' },
  ],
  OLLAMA: [
    { id: 'gemma4:31b-cloud', name: 'Gemma 4 31B Cloud', desc: 'Local Ollama cloud model (Recommended)' },
  ],
};

const STAR_TEMPLATES = [
  {
    title: 'Distributed Cache Stampede Outage Mitigation',
    targetCompany: 'Amazon / Meta / Cloud',
    leadershipPrinciple: 'Bias for Action & Dive Deep',
    situation: 'During peak Black Friday traffic, a Redis cluster node failure triggered a cache stampede, causing database CPU to spike to 99% and degrading checkout latency by 4x.',
    task: 'I needed to immediately restore service health and architect a permanent resilience mechanism without losing in-flight payment transactions.',
    action: 'Implemented probabilistic early cache expiration (XFetch algorithm) combined with single-flight mutex locking. Deployed hot-standby Redis read-replicas with automatic DNS failover.',
    result: 'Reduced database peak load by 85%, dropped P99 checkout latency from 3.2s to 120ms, and achieved 99.99% uptime with zero payment drops.',
    keyLearnings: 'Always protect downstream datastores with distributed circuit breakers and probabilistic cache refreshing rather than simple TTLs.',
  },
  {
    title: 'Cross-Team Event Architecture Alignment Dispute',
    targetCompany: 'Google / Stripe / FinTech',
    leadershipPrinciple: 'Have Backbone; Disagree & Commit',
    situation: 'Two engineering teams were deadlocked between choosing Apache Kafka vs RabbitMQ for our core financial transaction settlement pipeline.',
    task: 'As the Technical Lead, I had to resolve the architectural conflict, establish consensus, and deliver the settlement engine on schedule.',
    action: 'Created an objective benchmark matrix evaluating exactly-once semantics, partition rebalancing latency, and operational overhead. Built a working PoC showing Kafka transactional producers met our 50k TPS requirement with sub-10ms delivery.',
    result: 'Both teams aligned around the data-driven benchmark. Delivered the settlement service 2 weeks ahead of schedule with zero transaction reconciliations needed in year 1.',
    keyLearnings: 'Objective technical benchmarks and working PoCs remove emotional deadlocks faster than endless design doc reviews.',
  },
];

export function ProfileSettingsModal({ isOpen, onClose, onCredentialsUpdated, onResetOnboarding }: ProfileSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'api_keys' | 'profile' | 'star' | 'resume' | 'audio_screen' | 'guide'>('api_keys');
  const [defaultProvider, setDefaultProvider] = useState<CredentialProvider>(() => {
    return (localStorage.getItem('backdoor_default_provider') as CredentialProvider) || (localStorage.getItem('mypersonalai_default_provider') as CredentialProvider) || 'GEMINI';
  });
  const [selectedModels, setSelectedModels] = useState<Record<CredentialProvider, string>>(() => {
    return {
      GEMINI: localStorage.getItem('backdoor_model_GEMINI') || localStorage.getItem('mypersonalai_model_GEMINI') || 'gemini-2.5-flash',
      GROQ: localStorage.getItem('backdoor_model_GROQ') || localStorage.getItem('mypersonalai_model_GROQ') || 'llama3-70b-8192',
      OPENAI: localStorage.getItem('backdoor_model_OPENAI') || localStorage.getItem('mypersonalai_model_OPENAI') || 'gpt-4o',
      ANTHROPIC: localStorage.getItem('backdoor_model_ANTHROPIC') || localStorage.getItem('mypersonalai_model_ANTHROPIC') || 'claude-3-5-sonnet-20241022',
      OLLAMA: localStorage.getItem('backdoor_model_OLLAMA') || 'gemma4:31b-cloud',
    };
  });

  const [dynamicModels, setDynamicModels] = useState<Record<CredentialProvider, { id: string; name: string; desc: string }[]>>(() => {
    return PROVIDER_MODELS;
  });

  const [fetchingModels, setFetchingModels] = useState<Record<CredentialProvider, boolean>>({
    GEMINI: false,
    GROQ: false,
    OPENAI: false,
    ANTHROPIC: false,
    OLLAMA: false,
  });

  const [selectedSttModel, setSelectedSttModel] = useState<string>(() => {
    return localStorage.getItem('backdoor_stt_model') || localStorage.getItem('mypersonalai_stt_model') || 'whisper-large-v3-turbo';
  });

  const [isDragging, setIsDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfileData>({
    fullName: '',
    targetRole: '',
    bio: '',
    skills: '',
    projects: '',
    resumeText: '',
    customInstructions: '',
  });

  // STAR Stories State
  const [starStories, setStarStories] = useState<StarStory[]>([]);
  const [showAddStar, setShowAddStar] = useState(false);
  const [starTitle, setStarTitle] = useState('');
  const [starCompany, setStarCompany] = useState('');
  const [starPrinciple, setStarPrinciple] = useState('');
  const [starSituation, setStarSituation] = useState('');
  const [starTask, setStarTask] = useState('');
  const [starAction, setStarAction] = useState('');
  const [starResult, setStarResult] = useState('');
  const [starLearnings, setStarLearnings] = useState('');

  // Documents State
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState('project');
  const [newDocContent, setNewDocContent] = useState('');
  const [showAddDoc, setShowAddDoc] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio & HUD settings
  const [ocrInterval, setOcrInterval] = useState('3');
  const [hudFontSize, setHudFontSize] = useState<number>(() => {
    return parseInt(localStorage.getItem('backdoor_hud_font_size') || '13', 10);
  });

  const handleHudFontSizeChange = (size: number) => {
    setHudFontSize(size);
    localStorage.setItem('backdoor_hud_font_size', size.toString());
    window.dispatchEvent(new Event('backdoor_hud_font_size_changed'));
  };

  // API Credentials State
  const [credentialsStatus, setCredentialsStatus] = useState<Record<CredentialProvider, boolean>>({
    OPENAI: false,
    GEMINI: false,
    ANTHROPIC: false,
    GROQ: false,
    OLLAMA: false,
  });
  const [apiKeys, setApiKeys] = useState<Record<CredentialProvider, string>>({
    OPENAI: '',
    GEMINI: '',
    ANTHROPIC: '',
    GROQ: '',
    OLLAMA: '',
  });
  const [showKeys, setShowKeys] = useState<Record<CredentialProvider, boolean>>({
    OPENAI: false,
    GEMINI: false,
    ANTHROPIC: false,
    GROQ: false,
    OLLAMA: false,
  });
  const [savingKey, setSavingKey] = useState<CredentialProvider | null>(null);
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProfileAndDocs();
      loadStarStories();
      loadCredentialsStatus();
    }
  }, [isOpen]);

  const loadProfileAndDocs = async () => {
    try {
      const p = await invoke<UserProfileData>('get_user_profile');
      setProfile(p);
      const docs = await invoke<KnowledgeDocument[]>('list_knowledge_documents');
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load user profile or documents:', err);
    }
  };

  const loadStarStories = async () => {
    try {
      const stories = await invoke<StarStory[]>('list_star_stories');
      setStarStories(stories);
    } catch (err) {
      console.error('Failed to load STAR stories:', err);
    }
  };

  const loadCredentialsStatus = async () => {
    try {
      const providers: CredentialProvider[] = ['OPENAI', 'GEMINI', 'ANTHROPIC', 'GROQ', 'OLLAMA'];
      const results = await Promise.all(
        providers.map(async (p) => {
          const res = await invoke<{ configured: boolean }>('get_provider_credential_status', { provider: p });
          return [p, res.configured] as const;
        })
      );
      const statusMap = Object.fromEntries(results) as Record<CredentialProvider, boolean>;
      setCredentialsStatus(statusMap);

      // Auto-fetch models for configured providers and Ollama on load
      providers.forEach((p) => {
        if (p === 'OLLAMA' || statusMap[p]) {
          void handleFetchModels(p);
        }
      });
    } catch (err) {
      console.error('Failed to load credential statuses:', err);
    }
  };

  const handleFetchModels = async (provider: CredentialProvider) => {
    setFetchingModels((prev) => ({ ...prev, [provider]: true }));
    setError(null);
    try {
      const key = apiKeys[provider].trim() || undefined;
      const fetched = await invoke<{ id: string; name: string; description: string }[]>('fetch_provider_models', {
        provider,
        apiKey: key,
      });
      if (fetched && fetched.length > 0) {
        const formatted = fetched.map((m) => ({ id: m.id, name: m.name, desc: m.description }));
        setDynamicModels((prev) => ({ ...prev, [provider]: formatted }));
        if (!fetched.some((m) => m.id === selectedModels[provider])) {
          handleModelChange(provider, fetched[0].id);
        }
        setKeySavedMessage(`⚡ Live fetched ${fetched.length} models for ${provider}!`);
        setTimeout(() => setKeySavedMessage(null), 3500);
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : `Failed to fetch models from ${provider}: ${err?.message || err}`);
    } finally {
      setFetchingModels((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleSaveCredential = async (provider: CredentialProvider) => {
    const key = apiKeys[provider].trim();
    if (!key) return;

    setSavingKey(provider);
    setError(null);
    try {
      await invoke('save_provider_credential', { provider, apiKey: key });
      await loadCredentialsStatus();
      setApiKeys((prev) => ({ ...prev, [provider]: '' }));
      setKeySavedMessage(`${provider} API key securely saved! Fetching account models...`);
      setTimeout(() => setKeySavedMessage(null), 3000);
      if (onCredentialsUpdated) onCredentialsUpdated();

      // Automatically fetch models for this provider
      void handleFetchModels(provider);
    } catch (err) {
      setError(typeof err === 'string' ? err : `Failed to save ${provider} API key`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleModelChange = (provider: CredentialProvider, modelId: string) => {
    const next = { ...selectedModels, [provider]: modelId };
    setSelectedModels(next);
    localStorage.setItem(`backdoor_model_${provider}`, modelId);
  };

  const handleSttModelChange = (modelId: string) => {
    setSelectedSttModel(modelId);
    localStorage.setItem('backdoor_stt_model', modelId);
    const m = AUDIO_STT_MODELS.find((item) => item.id === modelId);
    if (m) {
      localStorage.setItem('backdoor_stt_provider', m.provider);
    }
  };

  const handleDefaultProviderChange = (provider: CredentialProvider) => {
    setDefaultProvider(provider);
    localStorage.setItem('backdoor_default_provider', provider);
    localStorage.setItem('backdoor_primary_provider', provider);
  };

  const parsePdfContent = async (file: File): Promise<string> => {
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const textDecoder = new TextDecoder('utf-8');
      const raw = textDecoder.decode(uint8);

      // Extract text chunks from PDF streams
      const textMatches: string[] = [];
      const parenRegex = /\(([^\)]+)\)/g;
      let match;
      while ((match = parenRegex.exec(raw)) !== null) {
        const cleaned = match[1].replace(/\\([()\\])/g, '$1').trim();
        if (cleaned.length > 1 && !cleaned.startsWith('/') && !cleaned.includes('Font') && !cleaned.includes('ProcSet')) {
          textMatches.push(cleaned);
        }
      }

      if (textMatches.length > 5) {
        return textMatches.join(' ');
      }

      // Fallback: strip binary byte sequences
      const printable = raw.replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
      return printable.length > 40 ? printable : `[Ingested Document: ${file.name}]`;
    } catch {
      return await file.text();
    }
  };

  const processUploadedFiles = async (files: File[]) => {
    try {
      let count = 0;
      for (const file of files) {
        const name = file.name.toLowerCase();
        const ext = name.split('.').pop() || 'document';
        const text = ext === 'pdf' ? await parsePdfContent(file) : await file.text();
        const doc: KnowledgeDocument = {
          id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: file.name,
          docType: ext,
          content: text,
          createdAt: new Date().toISOString(),
        };
        await invoke('create_knowledge_document', { doc });
        setDocuments((prev) => [doc, ...prev]);
        count++;
      }
      setUploadMessage(`✅ Successfully parsed & indexed ${count} file(s) into local RAG knowledge base!`);
      setTimeout(() => setUploadMessage(null), 4000);
    } catch (err: any) {
      setError(`Failed to read uploaded file: ${err?.message || err}`);
    }
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    await processUploadedFiles(files);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    await processUploadedFiles(files);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      await invoke('save_user_profile', { profile });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStarStory = async () => {
    if (!starTitle.trim() || !starSituation.trim() || !starAction.trim()) return;
    try {
      const story: StarStory = {
        id: `star_${Date.now()}`,
        title: starTitle.trim(),
        targetCompany: starCompany.trim(),
        leadershipPrinciple: starPrinciple.trim(),
        situation: starSituation.trim(),
        task: starTask.trim(),
        action: starAction.trim(),
        result: starResult.trim(),
        keyLearnings: starLearnings.trim(),
        createdAt: new Date().toISOString(),
      };
      await invoke('create_star_story', { story });
      setStarStories([story, ...starStories]);
      setStarTitle('');
      setStarCompany('');
      setStarPrinciple('');
      setStarSituation('');
      setStarTask('');
      setStarAction('');
      setStarResult('');
      setStarLearnings('');
      setShowAddStar(false);
    } catch (err) {
      console.error('Failed to create STAR story:', err);
    }
  };

  const handleDeleteStarStory = async (id: string) => {
    try {
      await invoke('delete_star_story', { id });
      setStarStories(starStories.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete STAR story:', err);
    }
  };

  const applyTemplate = (t: typeof STAR_TEMPLATES[0]) => {
    setStarTitle(t.title);
    setStarCompany(t.targetCompany);
    setStarPrinciple(t.leadershipPrinciple);
    setStarSituation(t.situation);
    setStarTask(t.task);
    setStarAction(t.action);
    setStarResult(t.result);
    setStarLearnings(t.keyLearnings);
    setShowAddStar(true);
  };

  const handleAddDocument = async () => {
    if (!newDocTitle.trim() || !newDocContent.trim()) return;
    try {
      const doc: KnowledgeDocument = {
        id: `doc_${Date.now()}`,
        title: newDocTitle.trim(),
        docType: newDocType,
        content: newDocContent.trim(),
        createdAt: new Date().toISOString(),
      };
      await invoke('create_knowledge_document', { doc });
      setDocuments([doc, ...documents]);
      setNewDocTitle('');
      setNewDocContent('');
      setShowAddDoc(false);
    } catch (err) {
      console.error('Failed to create knowledge document:', err);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await invoke('delete_knowledge_document', { id });
      setDocuments(documents.filter((d) => d.id !== id));
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  if (!isOpen) return null;  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="relative flex h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-[#282a32] bg-[#0c0d10] text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#282a32] bg-[#121418]/95 px-6 py-4.5 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Interview AI Settings & Candidate Profile</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Configure AI Providers, STAR Behavioral Matrix, RAG Knowledge & Voice Perception</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-all active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#22242a] bg-[#0c0d10] px-6 gap-1 overflow-x-auto scrollbar-none py-1.5 shrink-0">
          <button
            onClick={() => setActiveTab('api_keys')}
            className={`flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              activeTab === 'api_keys'
                ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_-2px_0_#3b82f6] text-white border border-blue-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            <KeyRound size={13.5} />
            <span>AI Models & API Keys</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              activeTab === 'profile'
                ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_-2px_0_#3b82f6] text-white border border-blue-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            <User size={13.5} />
            <span>Profile & Identity</span>
          </button>

          {/* ⭐ STAR Stories Tab */}
          <button
            onClick={() => setActiveTab('star')}
            className={`flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              activeTab === 'star'
                ? 'bg-amber-500/10 text-amber-400 shadow-[inset_0_-2px_0_#f59e0b] text-white border border-amber-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            <Award size={13.5} className="text-amber-400" />
            <span>⭐ STAR Experience Matrix</span>
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] text-amber-300 font-bold border border-amber-500/35 font-mono">
              {starStories.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('resume')}
            className={`flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              activeTab === 'resume'
                ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_-2px_0_#3b82f6] text-white border border-blue-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            <FileText size={13.5} />
            <span>Resume & Project RAG</span>
            <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] text-emerald-300 font-bold border border-emerald-500/35 font-mono">
              {documents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('audio_screen')}
            className={`flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              activeTab === 'audio_screen'
                ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_-2px_0_#3b82f6] text-white border border-blue-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            <Mic size={13.5} />
            <span>Audio, Vision & HUD Settings</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold rounded-lg transition-all duration-200 active:scale-95 ${
              activeTab === 'guide'
                ? 'bg-indigo-500/10 text-indigo-400 shadow-[inset_0_-2px_0_#6366f1] text-white border border-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border border-transparent'
            }`}
          >
            <BookOpen size={13.5} />
            <span>📖 Guide</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#0a0b0d]">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.08)]">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {keySavedMessage && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.08)]">
              <CheckCircle2 size={15} />
              <span>{keySavedMessage}</span>
            </div>
          )}
          {/* TAB 0: AI Models & API Keys */}
          {activeTab === 'api_keys' && (
            <div className="space-y-6">
              {/* SECTION 1: Chat & Reasoning AI Models */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#22242a] pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-500/10 p-1.5 text-blue-400 border border-blue-500/20">
                      <Bot size={16} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        1. Chat & System Design AI Engine (LLM)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Select which model powers live chat answers, STAR storytelling, and coding solutions.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-slate-400 font-medium">Default Chat Engine:</span>
                    <select
                      value={defaultProvider}
                      onChange={(e) => handleDefaultProviderChange(e.target.value as CredentialProvider)}
                      className="rounded-lg border border-[#2f3340] bg-[#121418] px-3 py-1.5 text-xs text-white outline-none cursor-pointer font-bold hover:border-slate-600 transition-colors"
                    >
                      <option value="GEMINI">Google Gemini</option>
                      <option value="GROQ">Groq Cloud</option>
                      <option value="OPENAI">OpenAI</option>
                      <option value="ANTHROPIC">Anthropic Claude</option>
                      <option value="OLLAMA">Local Ollama</option>
                    </select>
                  </div>
                </div>

                {/* Provider Key Configurations */}
                {(['GEMINI', 'GROQ', 'OPENAI', 'ANTHROPIC', 'OLLAMA'] as CredentialProvider[]).map((provider) => {
                  const isConfigured = credentialsStatus[provider];
                  const isSelectedDefault = defaultProvider === provider;
                  const models = dynamicModels[provider] || PROVIDER_MODELS[provider];
                  const isFetching = fetchingModels[provider];

                  return (
                    <div
                      key={provider}
                      className={`rounded-xl border p-4 transition-all duration-300 ${
                        isSelectedDefault
                          ? 'border-blue-500/40 bg-gradient-to-br from-blue-950/20 to-slate-900/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                          : isConfigured
                          ? 'border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-950/50 hover:border-slate-700'
                          : 'border-slate-950 bg-slate-950/30 opacity-75 hover:opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{provider}</span>
                          {isSelectedDefault && (
                            <span className="rounded-full bg-blue-500/10 border border-blue-500/35 px-2.5 py-0.5 text-[9px] font-bold text-blue-300 shadow-sm uppercase tracking-wide">
                              Active Chat Default
                            </span>
                          )}
                          {isConfigured ? (
                            <span className="flex items-center gap-1 text-[9px] text-emerald-300 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-bold uppercase tracking-wide">
                              <Check size={10} className="text-emerald-400" /> Securely Saved
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium italic">Not Configured</span>
                          )}
                        </div>

                        {/* Model Selector & Auto Fetch Button */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void handleFetchModels(provider)}
                            disabled={isFetching || (!isConfigured && !apiKeys[provider].trim())}
                            title="Query live API endpoint to fetch available account models"
                            className="flex items-center gap-1.5 rounded-lg border border-[#333744] bg-[#1a1c22] hover:bg-[#22252e] hover:border-slate-600 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition duration-200 disabled:opacity-40"
                          >
                            {isFetching ? <Loader2 size={11} className="animate-spin text-blue-400" /> : <RefreshCw size={11} className="text-blue-400" />}
                            <span>{isFetching ? 'Fetching…' : 'Fetch Models'}</span>
                          </button>

                          <select
                            value={selectedModels[provider]}
                            onChange={(e) => handleModelChange(provider, e.target.value)}
                            className="rounded-lg border border-[#2f3340] bg-[#0c0d10] px-2.5 py-1 text-xs text-white outline-none cursor-pointer max-w-xs font-medium hover:border-slate-650"
                          >
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* API Key Input */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={provider === 'OLLAMA' ? 'text' : (showKeys[provider] ? 'text' : 'password')}
                            value={apiKeys[provider]}
                            onChange={(e) => setApiKeys({ ...apiKeys, [provider]: e.target.value })}
                            placeholder={provider === 'OLLAMA' 
                              ? (isConfigured ? 'http://127.0.0.1:11434 (Saved Ollama Host)' : 'Enter Ollama Host URL (Default: http://127.0.0.1:11434)')
                              : (isConfigured ? '•••••••••••••••••••••••• (DPAPI Cryptography Active - Input new key to overwrite)' : `Paste ${provider} API Key`)
                            }
                            className="w-full rounded-lg border border-[#282a32] bg-[#0c0d10] px-3.5 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
                          />
                          {provider !== 'OLLAMA' && (
                            <button
                              type="button"
                              onClick={() => setShowKeys({ ...showKeys, [provider]: !showKeys[provider] })}
                              className="absolute right-3 top-2 text-slate-500 hover:text-white"
                            >
                              {showKeys[provider] ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => void handleSaveCredential(provider)}
                          disabled={savingKey === provider || (!apiKeys[provider].trim() && provider !== 'OLLAMA')}
                          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-40 shadow-[0_0_10px_rgba(59,130,246,0.2)] active:scale-95"
                        >
                          {savingKey === provider ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          <span>{provider === 'OLLAMA' ? 'Save Host' : 'Save Key'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SECTION 2: Audio Perception & Speech-to-Text (STT) Engine */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 border-b border-[#22242a] pb-2.5">
                  <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400 border border-emerald-500/20">
                    <Mic size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      2. Live Audio Perception & Speech-to-Text (STT) Engine
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Dedicated audio model for sub-second live interviewer speech transcription (separate from chat LLMs).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {AUDIO_STT_MODELS.map((item) => {
                    const isSelected = selectedSttModel === item.id;
                    const hasKey = credentialsStatus[item.provider as CredentialProvider];

                    return (
                      <label
                        key={item.id}
                        onClick={() => handleSttModelChange(item.id)}
                        className={`cursor-pointer flex flex-col justify-between rounded-xl border p-4 transition-all duration-300 ${
                          isSelected
                            ? 'border-emerald-500/55 bg-gradient-to-br from-emerald-950/20 to-slate-900/40 shadow-[0_4px_15px_rgba(16,185,129,0.15)] scale-[1.01]'
                            : 'border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-950/50 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{item.name}</span>
                            {isSelected && <Check size={14} className="text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 p-0.5 rounded-full shrink-0" />}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.2 text-[9px] font-bold text-emerald-300">
                              {item.badge}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold font-mono">[{item.provider}]</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">{item.desc}</p>
                        </div>

                        <div className="mt-3.5 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-medium">
                          <span className={hasKey ? 'text-emerald-300 font-bold uppercase text-[9px] tracking-wide' : 'text-amber-400'}>
                            {hasKey ? '✓ Key Ready' : `⚠️ Needs ${item.provider} Key`}
                          </span>
                          <span className="text-slate-500 font-mono text-[9px]">{item.id}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Profile & Identity */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-semibold">Your Full Name</label>
                  <input
                    type="text"
                    value={profile.fullName}
                    onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                    placeholder="e.g. Alex Zhang"
                    className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 px-3.5 py-2 text-xs text-white outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-semibold">Target Role & Level</label>
                  <input
                    type="text"
                    value={profile.targetRole}
                    onChange={(e) => setProfile({ ...profile, targetRole: e.target.value })}
                    placeholder="e.g. Staff Software Engineer (L6 / E6)"
                    className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 px-3.5 py-2 text-xs text-white outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold">Executive Bio & Background</label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={3}
                  placeholder="Summary of your years of experience, core domains (e.g. Distributed Systems, Cloud, AI), and standout achievements..."
                  className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 p-3 text-xs text-white outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-300 font-semibold">Key Technologies & Core Skills</label>
                  <textarea
                    value={profile.skills}
                    onChange={(e) => setProfile({ ...profile, skills: e.target.value })}
                    rows={3}
                    placeholder="e.g. Rust, Go, TypeScript, Distributed Consensus (Raft/Paxos), Kafka, Postgres, Kubernetes..."
                    className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 p-3 text-xs text-white outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-semibold">Featured Signature Projects</label>
                  <textarea
                    value={profile.projects}
                    onChange={(e) => setProfile({ ...profile, projects: e.target.value })}
                    rows={3}
                    placeholder="e.g. Real-Time Payment Settlement Engine (50k TPS, sub-10ms), Multi-Region Cache Synchronization..."
                    className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 p-3 text-xs text-white outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold">Custom Co-Pilot Instructions</label>
                <textarea
                  value={profile.customInstructions}
                  onChange={(e) => setProfile({ ...profile, customInstructions: e.target.value })}
                  rows={2}
                  placeholder="e.g. 'Answer like a Principal Engineer with trade-off matrices', 'Keep solutions in Python/Rust'..."
                  className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 p-3 text-xs text-white outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-6 py-2.5 text-xs font-bold text-white shadow-[0_4px_15px_rgba(59,130,246,0.25)] transition hover:bg-blue-500 disabled:opacity-50 active:scale-95"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{savedSuccess ? 'Profile Saved!' : 'Save Profile'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: ⭐ STAR Behavioral Experience Matrix */}
          {activeTab === 'star' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white">⭐ STAR Behavioral Experience Matrix</h3>
                  <p className="text-[11px] text-slate-400">
                    Pre-populate structured behavioral answers (Situation, Task, Action, Result) for Amazon LP & FAANG rounds.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddStar(!showAddStar)}
                  className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95 shadow-sm"
                >
                  <Plus size={13} />
                  <span>{showAddStar ? 'Cancel' : 'Add STAR Story'}</span>
                </button>
              </div>

              {/* Template Quick Loader */}
              <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-orange-500/5 p-4 space-y-2.5 shadow-sm">
                <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1">💡 1-Click Load Proven FAANG STAR Templates:</span>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {STAR_TEMPLATES.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => applyTemplate(t)}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/15 hover:border-amber-400 transition text-left hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      + {t.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add STAR Form */}
              {showAddStar && (
                <div className="rounded-xl border border-amber-500/30 bg-[#161410] p-4.5 space-y-3.5 shadow-lg shadow-amber-955/10 animate-in slide-in-from-top duration-200">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Story Title</label>
                      <input
                        type="text"
                        value={starTitle}
                        onChange={(e) => setStarTitle(e.target.value)}
                        placeholder="e.g. Distributed Outage Mitigation"
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 px-3 py-1.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Target Company</label>
                      <input
                        type="text"
                        value={starCompany}
                        onChange={(e) => setStarCompany(e.target.value)}
                        placeholder="e.g. Amazon / Meta"
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 px-3 py-1.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Leadership Principle</label>
                      <input
                        type="text"
                        value={starPrinciple}
                        onChange={(e) => setStarPrinciple(e.target.value)}
                        placeholder="e.g. Bias for Action, Dive Deep"
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 px-3 py-1.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Situation</label>
                      <textarea
                        value={starSituation}
                        onChange={(e) => setStarSituation(e.target.value)}
                        rows={2}
                        placeholder="What was the context and challenge?"
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 p-2.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Task</label>
                      <textarea
                        value={starTask}
                        onChange={(e) => setStarTask(e.target.value)}
                        rows={2}
                        placeholder="What was your specific responsibility?"
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 p-2.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold">Action (Technical & Leadership)</label>
                    <textarea
                      value={starAction}
                      onChange={(e) => setStarAction(e.target.value)}
                      rows={3}
                      placeholder="What exact steps, architectures, and algorithms did you implement?"
                      className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 p-2.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Result (Metrics & Impact)</label>
                      <textarea
                        value={starResult}
                        onChange={(e) => setStarResult(e.target.value)}
                        rows={2}
                        placeholder="Quantifiable numbers (e.g. 85% load reduction, 99.99% uptime)..."
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 p-2.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Key Learnings</label>
                      <textarea
                        value={starLearnings}
                        onChange={(e) => setStarLearnings(e.target.value)}
                        rows={2}
                        placeholder="What insights did you gain?"
                        className="mt-1.5 w-full rounded-lg border border-amber-500/20 bg-slate-950/50 hover:border-amber-500/35 focus:border-amber-500/60 focus:bg-slate-950/80 p-2.5 text-xs text-white outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleAddStarStory}
                      className="rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 font-bold px-4 py-2 shadow-[0_4px_10px_rgba(245,158,11,0.25)] text-xs text-white transition-all active:scale-95 cursor-pointer"
                    >
                      Save STAR Story
                    </button>
                  </div>
                </div>
              )}

              {/* Story List */}
              <div className="space-y-4">
                {starStories.length === 0 && !showAddStar && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-8 text-center text-xs text-slate-500">
                    No STAR stories yet. Click a quick-fill template above or &ldquo;Add STAR Story&rdquo; to structure your interview wins!
                  </div>
                )}
                {starStories.map((story) => (
                  <div key={story.id} className="rounded-xl border border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950/60 p-4 space-y-3 shadow-md hover:border-slate-700 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award size={15} className="text-amber-400" />
                        <span className="text-xs font-bold text-white">{story.title}</span>
                        {story.leadershipPrinciple && (
                          <span className="rounded-full bg-amber-500/10 border border-amber-500/35 px-2.5 py-0.5 text-[9px] font-bold text-amber-300">
                            {story.leadershipPrinciple}
                          </span>
                        )}
                        {story.targetCompany && (
                          <span className="text-[10px] text-slate-400 font-medium">· {story.targetCompany}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteStarStory(story.id)}
                        className="rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px] text-slate-300 pt-1">
                      <div className="rounded-lg bg-slate-950/40 p-2.5 border border-slate-900 leading-relaxed">
                        <strong className="text-slate-400">Situation:</strong> {story.situation}
                      </div>
                      <div className="rounded-lg bg-slate-950/40 p-2.5 border border-slate-900 leading-relaxed">
                        <strong className="text-slate-400">Task:</strong> {story.task}
                      </div>
                      <div className="rounded-lg bg-slate-950/40 p-2.5 border border-slate-900 col-span-2 leading-relaxed">
                        <strong className="text-slate-400">Action:</strong> {story.action}
                      </div>
                      <div className="rounded-lg bg-emerald-950/20 p-2.5 border border-emerald-900/40 col-span-2 text-emerald-200 leading-relaxed">
                        <strong className="text-emerald-400">Result:</strong> {story.result}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Resume & Document RAG */}
          {activeTab === 'resume' && (
            <div className="space-y-5">
              {uploadMessage && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 shadow-lg shadow-emerald-950/10">
                  <CheckCircle2 size={15} />
                  <span>{uploadMessage}</span>
                </div>
              )}

              {/* Drag & Drop File Upload Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => void handleFileDrop(e)}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-300 ${
                  isDragging
                    ? 'border-blue-500 bg-gradient-to-b from-blue-600/15 to-indigo-600/5 shadow-[0_0_20px_rgba(59,130,246,0.2)] scale-[1.01]'
                    : 'border-slate-700 bg-gradient-to-b from-slate-900/40 to-slate-950/40 hover:border-blue-500/45 hover:from-slate-900/60 hover:to-indigo-950/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]'
                }`}
              >
                <div className="rounded-2xl bg-blue-500/10 p-3.5 text-blue-400 border border-blue-500/20 mb-2 shadow-sm animate-pulse">
                  <UploadCloud size={26} />
                </div>
                <h4 className="text-xs font-bold text-white tracking-tight">Drag & Drop Resume, Notes, or Project Docs Here</h4>
                <p className="mt-1 text-[10px] text-slate-400 max-w-sm">
                  Preferred: <strong className="text-blue-300">.md</strong> or <strong className="text-blue-300">.txt</strong> files for best extraction. Also supports JSON & CSV. Avoid PDF — use Markdown for perfect results.
                </p>

                <label className="mt-3.5 cursor-pointer rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-1.5 px-4.5 rounded-lg text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/35 active:scale-95 transition-all cursor-pointer">
                  <span>Browse Files</span>
                  <input
                    type="file"
                    multiple
                    accept=".md,.txt,.json,.csv"
                    onChange={(e) => void handleFileInput(e)}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Raw Resume Text Input */}
              <div>
                <label className="text-xs text-slate-300 font-semibold">Or Paste Plain Resume Text</label>
                <p className="text-[10px] text-slate-500 mt-0.5">Paste your resume here. Use the button below to save it to your profile AND index it in the local vector store for semantic search.</p>
                <textarea
                  value={profile.resumeText}
                  onChange={(e) => setProfile({ ...profile, resumeText: e.target.value })}
                  rows={6}
                  placeholder="Paste your full resume text here..."
                  className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 p-3 text-xs text-white font-mono outline-none focus:border-blue-500/55 focus:bg-slate-950/80 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                />
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    disabled={!profile.resumeText.trim() || saving}
                    onClick={async () => {
                      if (!profile.resumeText.trim()) return;
                      try {
                        setSaving(true);
                        await handleSaveProfile();
                        const doc: KnowledgeDocument = {
                          id: `resume_${Date.now()}`,
                          title: `Resume — ${profile.fullName || 'Candidate'}`,
                          docType: 'resume',
                          content: profile.resumeText.trim(),
                          createdAt: new Date().toISOString(),
                        };
                        await invoke('create_knowledge_document', { doc });
                        setDocuments((prev) => [doc, ...prev]);
                        setUploadMessage('Resume saved to profile and indexed in vector store ✓');
                        setTimeout(() => setUploadMessage(null), 4000);
                      } catch (err) {
                        console.error('Failed to index resume:', err);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-1.5 text-xs font-bold text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    <span>Save Profile & Index to Vector Store</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-white">Ingested Knowledge Documents</h3>
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-500/30 font-mono shadow-sm">
                    {documents.length} Indexed
                  </span>
                </div>
                <button
                  onClick={() => setShowAddDoc(!showAddDoc)}
                  className="flex items-center gap-1 rounded-lg bg-[#1a1d24] border border-[#2f3340] hover:border-slate-600 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95 shadow-sm"
                >
                  <Plus size={13} className="text-blue-400" />
                  <span>{showAddDoc ? 'Cancel' : 'Manual Entry'}</span>
                </button>
              </div>

              {showAddDoc && (
                <div className="rounded-xl border border-blue-500/25 bg-[#12141c] p-4.5 space-y-3.5 shadow-lg shadow-blue-955/10 animate-in slide-in-from-top duration-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Document Title</label>
                      <input
                        type="text"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        placeholder="e.g. Distributed Consensus Design Doc"
                        className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500/55 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold">Type</label>
                      <select
                        value={newDocType}
                        onChange={(e) => setNewDocType(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-[#0c0d10] px-3 py-1.5 text-xs text-white outline-none cursor-pointer focus:border-blue-500/55 transition-all"
                      >
                        <option value="project">Project Deep Dive</option>
                        <option value="architecture">System Architecture Blueprint</option>
                        <option value="dsa">DSA & Algorithms Cheat Sheet</option>
                        <option value="resume">Resume / Work History</option>
                        <option value="notes">Study Notes</option>
                        <option value="whitepaper">Whitepaper / Article</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold">Content</label>
                    <textarea
                      value={newDocContent}
                      onChange={(e) => setNewDocContent(e.target.value)}
                      rows={4}
                      placeholder="Paste key technical highlights, trade-offs, and metrics..."
                      className="mt-1.5 w-full rounded-lg border border-[#2d313f] bg-slate-950/50 p-2.5 text-xs text-white outline-none focus:border-blue-500/55 transition-all"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleAddDocument}
                      className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold px-4 py-1.5 shadow-[0_4px_10px_rgba(59,130,246,0.25)] text-xs text-white transition-all active:scale-95 cursor-pointer"
                    >
                      Save Document
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900/50 to-slate-950/30 p-3.5 text-xs shadow-sm hover:border-slate-700 transition-all duration-200">
                    <div className="flex items-center gap-2.5">
                      <FileText size={14} className="text-blue-400" />
                      <span className="font-semibold text-white">{doc.title}</span>
                      <span className="rounded bg-slate-950 border border-white/5 px-2 py-0.5 text-[9px] font-semibold text-slate-400 font-mono">[{doc.docType}]</span>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Audio & Screen Capture Settings */}
          {activeTab === 'audio_screen' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-indigo-500/5 p-4 space-y-2.5 shadow-[0_0_12px_rgba(168,85,247,0.1)]">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300 uppercase tracking-wide">
                  <Headphones size={15} />
                  <span>Dual-Stream Interview Audio Perception Engine</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  • 🎧 <strong>Interviewer Voice (Speaker Loopback):</strong> Captures audio output from Zoom, Google Meet, Teams, CoderPad via Windows WASAPI Loopback.
                  <br />• 🎙️ <strong>Candidate Voice (Microphone):</strong> Captures your microphone speech.
                  <br />• 🏷️ <strong>Live Diarization:</strong> Chronologically tags speaker turns (`[Interviewer]` vs `[Candidate]`).
                </p>
              </div>

              {/* Speech-to-Text (STT) Model Selection */}
              <div className="rounded-xl border border-slate-800 bg-[#0f1013] p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wide">
                  <Mic size={15} className="text-emerald-450" />
                  <span>Speech-to-Text (STT) Whisper Model Selection</span>
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-0.5">
                  {AUDIO_STT_MODELS.map((item) => {
                    const isSelected = selectedSttModel === item.id;
                    const hasKey = credentialsStatus[item.provider as CredentialProvider];

                    return (
                      <label
                        key={item.id}
                        onClick={() => handleSttModelChange(item.id)}
                        className={`cursor-pointer flex flex-col justify-between rounded-xl border p-4 transition-all duration-300 ${
                          isSelected
                            ? 'border-emerald-500/55 bg-gradient-to-br from-emerald-950/20 to-slate-900/40 shadow-[0_4px_15px_rgba(16,185,129,0.15)] scale-[1.01]'
                            : 'border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-950/50 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{item.name}</span>
                            {isSelected && <Check size={14} className="text-emerald-400 bg-emerald-500/15 border border-emerald-500/35 p-0.5 rounded-full shrink-0" />}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.2 text-[9px] font-bold text-emerald-300">
                              {item.badge}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold font-mono">[{item.provider}]</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">{item.desc}</p>
                        </div>

                        <div className="mt-3.5 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-medium">
                          <span className={hasKey ? 'text-emerald-300 font-bold uppercase text-[9px] tracking-wide' : 'text-amber-400'}>
                            {hasKey ? '✓ Key Ready' : `⚠️ Needs ${item.provider} Key`}
                          </span>
                          <span className="text-slate-500 font-mono text-[9px]">{item.id}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-4 space-y-2.5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wide">
                  <Monitor size={15} className="text-sky-455" />
                  <span>Screen OCR & Vision Capture Settings</span>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs text-slate-300 font-medium">OCR Scan Interval:</label>
                  <select
                    value={ocrInterval}
                    onChange={(e) => setOcrInterval(e.target.value)}
                    className="rounded-lg border border-[#2d313f] bg-slate-950 px-3.5 py-1.5 text-xs text-slate-200 outline-none cursor-pointer focus:border-blue-500/55 font-semibold"
                  >
                    <option value="2">Every 2 seconds (Fastest)</option>
                    <option value="3">Every 3 seconds (Balanced - Recommended)</option>
                    <option value="5">Every 5 seconds (Low CPU)</option>
                  </select>
                </div>
              </div>

              {/* HUD Answer Font Size Control */}
              <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-950/50 p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wide">
                    <Type size={15} className="text-blue-400" />
                    <span>Stealth HUD Answer Font Size</span>
                  </div>
                  <span className="rounded-full bg-blue-500/10 border border-blue-500/35 px-3 py-0.5 text-xs font-mono font-bold text-blue-300 shadow-sm">
                    {hudFontSize}px
                  </span>
                </div>

                <p className="text-[11px] text-slate-400">
                  Increase or decrease the font size of generated answers inside the HUD overlay to optimize readability during live calls.
                </p>

                {/* Preset Buttons */}
                <div className="grid grid-cols-4 gap-2.5 pt-0.5">
                  {[
                    { label: 'Small', size: 11, desc: 'Compact' },
                    { label: 'Medium', size: 13, desc: 'Default' },
                    { label: 'Large', size: 15, desc: 'High Legibility' },
                    { label: 'Extra Large', size: 18, desc: 'Ultra Clear' },
                  ].map((p) => {
                    const isSelected = hudFontSize === p.size;
                    return (
                      <button
                        key={p.size}
                        type="button"
                        onClick={() => handleHudFontSizeChange(p.size)}
                        className={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 transition-all duration-200 active:scale-95 ${
                          isSelected
                            ? 'border-blue-500/50 bg-gradient-to-r from-blue-600/20 to-indigo-600/10 text-white shadow-[0_0_10px_rgba(59,130,246,0.2)] font-semibold'
                            : 'border-slate-850 bg-slate-950/60 text-slate-450 hover:border-slate-650 hover:text-slate-200 hover:bg-slate-955/80'
                        }`}
                      >
                        <span className="text-xs font-bold">{p.label}</span>
                        <span className="text-[9px] opacity-75 font-mono font-semibold mt-0.5">{p.size}px</span>
                      </button>
                    );
                  })}
                </div>

                {/* Slider for fine adjustment */}
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-[11px] text-slate-500 font-mono font-semibold">10px</span>
                  <input
                    type="range"
                    min="10"
                    max="22"
                    step="1"
                    value={hudFontSize}
                    onChange={(e) => handleHudFontSizeChange(parseInt(e.target.value, 10))}
                    className="flex-1 accent-blue-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer hover:bg-slate-900 transition-colors"
                  />
                  <span className="text-[11px] text-slate-500 font-mono font-semibold">22px</span>
                </div>

                {/* Live Preview Box */}
                <div className="mt-3 rounded-xl border border-white/10 bg-slate-955/80 p-4.5 space-y-1.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">HUD Answer Preview:</span>
                  <div
                    className="text-slate-100 font-normal leading-relaxed select-none"
                    style={{ fontSize: `${hudFontSize}px` }}
                  >
                    “Basically, `@RequestParam` reads values directly from the query string and binds them to controller parameters. By default it is required, but I make it optional with `required = false`.”
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Help & Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-slate-350 leading-relaxed">
              <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-550/10 to-purple-550/5 p-4.5 space-y-2.5 shadow-[0_0_12px_rgba(99,102,241,0.1)]">
                <h3 className="font-bold text-white text-sm tracking-tight">Ace Your Technical & Behavioral Interviews</h3>
                <p className="text-[11px] text-slate-300">
                  BackDoor AI runs invisibly as a stealth HUD overlay over Zoom, Google Meet, Microsoft Teams, CoderPad, or LeetCode.
                </p>
              </div>

              <div className="space-y-3.5">
                <div className="rounded-xl border border-slate-800 bg-[#0f1013] p-4 space-y-1.5 hover:border-slate-700 transition-colors">
                  <span className="font-bold text-white text-[11px] uppercase tracking-wide text-indigo-400">1. Global Shortcut & Stealth Mode</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Press <strong>Alt+Shift+I</strong> or <strong>Alt+I</strong> anywhere to toggle the HUD. Stealth Mode uses Windows capture exclusion so screen shares never see the assistant.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0f1013] p-4 space-y-1.5 hover:border-slate-700 transition-colors">
                  <span className="font-bold text-white text-[11px] uppercase tracking-wide text-indigo-400">2. Dual-Stream Audio & Auto-Assist</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Turn ON Interviewer Audio and Auto-Assist. As soon as the interviewer finishes speaking, speculative answers automatically stream onto your screen.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#0f1013] p-4 space-y-1.5 hover:border-slate-700 transition-colors">
                  <span className="font-bold text-white text-[11px] uppercase tracking-wide text-indigo-400">3. Multimodal Screen Vision</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Click <strong>Solve Code</strong> or <strong>Vision</strong> in the HUD. The AI ingests the exact code editor, diagram, or whiteboard on your screen.
                  </p>
                </div>

                {onResetOnboarding && (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-[#0f1013]/40 p-4.5 space-y-2 flex flex-col items-center justify-between text-center mt-2.5">
                    <div className="space-y-0.5">
                      <span className="font-bold text-white text-[11px] tracking-wide uppercase text-blue-400">Reset & Reconfigure</span>
                      <p className="text-[10px] text-slate-500 leading-relaxed max-w-sm mt-1">
                        Need a clean start? Run the step-by-step setup wizard again to reset your API keys, re-parse your resume, and check audio configurations.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        localStorage.removeItem('backdoor_onboarding_completed');
                        onResetOnboarding();
                        onClose();
                      }}
                      className="mt-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold py-1.5 px-4 transition-all cursor-pointer shadow-md active:scale-95 hover:scale-[1.01]"
                    >
                      Run Setup Wizard
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
