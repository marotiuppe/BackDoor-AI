import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Headphones,
  Loader2,
  MessageSquarePlus,
  Mic,
  Monitor,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BackendApi, BackendApiError } from './services/backendApi';
import type { ConversationDto, MessageDto } from './types/chat';
import { OverlayView } from './components/OverlayView';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import { MockInterviewStudio } from './components/MockInterviewStudio';
import { OnboardingWizard } from './components/OnboardingWizard';

const isTauriAvailable = () => typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function readableError(error: unknown) {
  if (error instanceof BackendApiError) return error.message;
  return 'Unable to communicate with the local assistant. Please try again.';
}

export default function App() {
  const isOverlayMode = typeof window !== 'undefined' && window.location.hash.includes('overlay');
  const apiRef = useRef<BackendApi | null>(null);
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDto | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mainView, setMainView] = useState<'chat' | 'mock_studio'>('chat');
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => {
    if ((import.meta as any).env?.DEV) {
      localStorage.removeItem('backdoor_onboarding_completed');
      localStorage.removeItem('backdoor_tour_completed');
      localStorage.setItem('backdoor_primary_provider', 'OLLAMA');
      localStorage.setItem('backdoor_default_provider', 'OLLAMA');
      localStorage.setItem('backdoor_model_OLLAMA', 'gemma4:31b-cloud');
      return false;
    }
    const completed = localStorage.getItem('backdoor_onboarding_completed');
    if (completed === null) {
      localStorage.setItem('backdoor_primary_provider', 'OLLAMA');
      localStorage.setItem('backdoor_default_provider', 'OLLAMA');
      localStorage.setItem('backdoor_model_OLLAMA', 'gemma4:31b-cloud');
      return false; // Show onboarding by default on first launch
    }
    return completed === 'true';
  });
  const [onboardingStartingStep, setOnboardingStartingStep] = useState<number>(1);
  const [tourStep, setTourStep] = useState<number | null>(null);

  // Secure Master PIN Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if ((import.meta as any).env?.DEV) return true; // auto-auth in dev mode
    return false;
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isPinSetup, setIsPinSetup] = useState<boolean>(() => {
    return localStorage.getItem('backdoor_master_pin_setup') !== 'true';
  });
  const [confirmPinInput, setConfirmPinInput] = useState('');

  const handlePinAction = () => {
    setPinError(null);
    if (isPinSetup) {
      if (pinInput.length < 4) {
        setPinError('Access PIN must be at least 4 digits.');
        return;
      }
      if (pinInput !== confirmPinInput) {
        setPinError('PINs do not match. Please verify.');
        return;
      }
      localStorage.setItem('backdoor_master_pin_hash', pinInput); // stored locally
      localStorage.setItem('backdoor_master_pin_setup', 'true');
      setIsPinSetup(false);
      setIsAuthenticated(true);
      setPinInput('');
      setConfirmPinInput('');
    } else {
      const savedPin = localStorage.getItem('backdoor_master_pin_hash');
      if (pinInput === savedPin) {
        setIsAuthenticated(true);
        setPinInput('');
      } else {
        setPinError('Invalid Access PIN. Please try again.');
        setPinInput('');
      }
    }
  };

  useEffect(() => {
    if (onboardingCompleted) {
      const tourCompleted = localStorage.getItem('backdoor_tour_completed');
      if (tourCompleted !== 'true') {
        const timer = setTimeout(() => {
          setTourStep(1);
        }, 1000); // 1s delay so UI is completely settled
        return () => clearTimeout(timer);
      }
    }
  }, [onboardingCompleted]);

  const handleTourNext = () => {
    if (tourStep !== null) {
      if (tourStep < 5) {
        setTourStep(tourStep + 1);
      } else {
        localStorage.setItem('backdoor_tour_completed', 'true');
        setTourStep(null);
      }
    }
  };

  const handleTourSkip = () => {
    localStorage.setItem('backdoor_tour_completed', 'true');
    setTourStep(null);
  };

  const [hudActive, setHudActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [loopbackActive, setLoopbackActive] = useState(false);

  const [screenStatus, setScreenStatus] = useState<string>('OFF');
  const [micStatus, setMicStatus] = useState<string>('OFF');
  const [loopbackStatus, setLoopbackStatus] = useState<string>('OFF');

  const [screenError, setScreenError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [loopbackError, setLoopbackError] = useState<string | null>(null);

  const [latestTranscript, setLatestTranscript] = useState<string>('');
  const [latestLoopbackTranscript, setLatestLoopbackTranscript] = useState<string>('');
  const [latestOcrText, setLatestOcrText] = useState<string>('');

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      if (!isTauriAvailable()) return;
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{ visible: boolean }>('overlay-status-changed', (event) => {
        setHudActive(Boolean(event.payload?.visible));
      });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = (await invoke('get_overlay_status')) as { visible: boolean };
        setHudActive(Boolean(status?.visible));
      } catch {
        // ignore
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const toggleHud = async () => {
    if (!isTauriAvailable()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = (await invoke('toggle_overlay')) as boolean;
      setHudActive(res);
    } catch (e) {
      console.error('Failed to toggle HUD:', e);
    }
  };

  useEffect(() => {
    if (!screenActive) return;
    const interval = setInterval(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = (await invoke('get_screen_capture_status')) as { active: boolean; lastText?: string };
        if (status.lastText) {
          setLatestOcrText(status.lastText);
        }
      } catch (e) {
        console.error('[Screen] Status poll error:', e);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [screenActive]);

  useEffect(() => {
    if (!micActive && !loopbackActive) return;
    const interval = setInterval(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = (await invoke('get_audio_capture_status')) as {
          active: boolean;
          micActive: boolean;
          loopbackActive: boolean;
          lastMicTranscript?: string;
          lastLoopbackTranscript?: string;
          lastTranscript?: string;
        };
        if (status.lastMicTranscript) {
          setLatestTranscript(status.lastMicTranscript);
        }
        if (status.lastLoopbackTranscript) {
          setLatestLoopbackTranscript(status.lastLoopbackTranscript);
        }
      } catch (e) {
        console.error('[Audio] Status poll error:', e);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [micActive, loopbackActive]);

  const toggleScreenCapture = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nextState = !screenActive;
      const res = (await invoke('toggle_screen_capture', { enabled: nextState })) as { active: boolean; error?: string };
      setScreenActive(res.active);
      setScreenStatus(res.active ? 'ACTIVE' : 'OFF');
      setScreenError(res.error || null);
    } catch (e: any) {
      setScreenError(e?.message || 'Failed to toggle screen capture');
    }
  };

  const toggleMicCapture = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nextState = !micActive;
      const res = (await invoke('toggle_audio_capture', { enabled: nextState })) as { micActive: boolean; error?: string };
      setMicActive(res.micActive);
      setMicStatus(res.micActive ? 'ACTIVE' : 'OFF');
      setMicError(res.error || null);
    } catch (e: any) {
      setMicError(e?.message || 'Failed to toggle microphone capture');
    }
  };

  const toggleLoopbackCapture = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nextState = !loopbackActive;
      const res = (await invoke('toggle_loopback_capture', { enabled: nextState })) as { loopbackActive: boolean; error?: string };
      setLoopbackActive(res.loopbackActive);
      setLoopbackStatus(res.loopbackActive ? 'ACTIVE' : 'OFF');
      setLoopbackError(res.error || null);
    } catch (e: any) {
      setLoopbackError(e?.message || 'Failed to toggle speaker loopback capture');
    }
  };

  const selectConversation = async (conversationId: string) => {
    const api = apiRef.current;
    if (!api) return;
    setLoadingConversation(true);
    setError(null);
    try {
      const detail = await api.getConversation(conversationId);
      setSelectedConversation(detail);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setLoadingConversation(false);
    }
  };

  const initializeWorkspace = async (api: BackendApi) => {
    setLoadingWorkspace(true);
    setError(null);
    try {
      const initialConversations = await api.getConversations();
      setConversations(initialConversations);

      if (initialConversations.length > 0) {
        await selectConversation(initialConversations[0].id);
      } else {
        setSelectedConversation(null);
      }
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('backdoor_model_OLLAMA', 'gemma4:31b-cloud');
    localStorage.removeItem('mypersonalai_model_OLLAMA');

    const api = new BackendApi();
    apiRef.current = api;
    setReady(true);
    void initializeWorkspace(api);

    // Run user profile verification check
    void (async () => {
      if (!isTauriAvailable()) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        
        if ((import.meta as any).env?.DEV) {
          await invoke('save_user_profile', {
            profile: {
              fullName: '',
              targetRole: '',
              bio: '',
              skills: '',
              projects: '',
              resumeText: '',
              customInstructions: ''
            }
          });
          setOnboardingStartingStep(1);
          setOnboardingCompleted(false);
          return;
        }

        const profile = await invoke<{ fullName: string; targetRole: string }>('get_user_profile');
        if (!profile || !profile.fullName.trim() || !profile.targetRole.trim()) {
          // Force onboarding Step 4 if profile is empty/incomplete
          setOnboardingStartingStep(4);
          setOnboardingCompleted(false);
        }
      } catch (err) {
        console.error('Failed to query user profile on startup:', err);
      }
    })();

    let unlistenChunk: (() => void) | undefined;
    void (async () => {
      if (!isTauriAvailable()) return;
      const { listen } = await import('@tauri-apps/api/event');
      unlistenChunk = await listen<string>('ai-stream-chunk', (event) => {
        setSelectedConversation((current) => {
          if (!current) return current;
          const nextMessages = [...(current.messages ?? [])];
          const lastIndex = nextMessages.length - 1;
          if (lastIndex >= 0 && nextMessages[lastIndex].role === 'assistant') {
            nextMessages[lastIndex] = {
              ...nextMessages[lastIndex],
              content: nextMessages[lastIndex].content + event.payload,
            };
          }
          return { ...current, messages: nextMessages };
        });
      });
    })();

    return () => {
      if (unlistenChunk) unlistenChunk();
    };
  }, []);

  const handleQuickCreateConversation = async () => {
    const api = apiRef.current;
    if (!api) return;
    setError(null);
    try {
      const activeProvider = localStorage.getItem('backdoor_primary_provider') || 'OLLAMA';
      const activeModel = localStorage.getItem(`backdoor_model_${activeProvider}`) || localStorage.getItem(`mypersonalai_model_${activeProvider}`) || (activeProvider === 'GEMINI' ? 'gemini-3.7-flash' : activeProvider === 'GROQ' ? 'llama-3.3-70b-versatile' : activeProvider === 'ANTHROPIC' ? 'claude-sonnet-4.6' : activeProvider === 'OLLAMA' ? 'gemma4:31b-cloud' : 'gpt-5.4');
      const created = await api.createConversation({
        title: 'New conversation',
        provider: activeProvider,
        model: activeModel,
      });
      setConversations((current) => [created, ...current]);
      setSelectedConversation(created);
    } catch (caught) {
      setError(readableError(caught));
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!isTauriAvailable()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_conversation', { id });
      setConversations((current) => current.filter((c) => c.id !== id));
      if (selectedConversation?.id === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          void selectConversation(remaining[0].id);
        } else {
          setSelectedConversation(null);
        }
      }
    } catch {
      setError('Unable to delete conversation.');
    }
  };

  const sendMessage = async () => {
    const api = apiRef.current;
    const trimmed = composer.trim();
    if (!api || !selectedConversation || !trimmed || sending) return;

    const conversationId = selectedConversation.id;
    const optimisticUserMessage: MessageDto = {
      id: `tmp-user-${Date.now()}`,
      conversationId,
      role: 'user',
      content: trimmed,
      tokenCount: 0,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistantMessage: MessageDto = {
      id: `tmp-assistant-${Date.now()}`,
      conversationId,
      role: 'assistant',
      content: '',
      tokenCount: 0,
      createdAt: new Date().toISOString(),
    };

    setSelectedConversation((current) => {
      if (!current || current.id !== conversationId) return current;
      return {
        ...current,
        messages: [...(current.messages ?? []), optimisticUserMessage, optimisticAssistantMessage],
      };
    });

    setComposer('');
    setSending(true);
    setError(null);

    try {
      await api.sendMessage(conversationId, trimmed, selectedConversation.model);

      const updated = await api.getConversation(conversationId);
      setSelectedConversation(updated);
      setConversations((current) =>
        current.map((item) => (item.id === conversationId ? { ...item, updatedAt: updated.updatedAt, title: updated.title } : item))
      );
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (isOverlayMode) {
    const activeProvider = localStorage.getItem('backdoor_primary_provider') || 'OLLAMA';
    return <OverlayView provider={activeProvider} />;
  }

  // Render Secure Login Gate
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#07080b] font-sans text-slate-100 relative overflow-hidden select-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/5 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111214]/80 p-6 shadow-2xl backdrop-blur-md space-y-5 relative">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400 border border-blue-500/20 mb-1">
              <Zap size={24} className="animate-pulse text-blue-400" />
            </div>
            <h2 className="text-base font-bold text-white tracking-tight">
              {isPinSetup ? 'Create Master Access PIN' : 'Unlock BackDoor AI'}
            </h2>
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-[280px]">
              {isPinSetup 
                ? 'Set a secure, local 4+ digit PIN to encrypt and protect your candidate profile, API credentials, and interview history.'
                : 'Enter your local master access PIN to securely decrypt credential stores and log in.'
              }
            </p>
          </div>

          <div className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Access PIN</label>
              <input
                type="password"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-center text-sm tracking-widest text-white placeholder:text-slate-500 outline-none focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePinAction();
                  }
                }}
                autoFocus
              />
            </div>

            {isPinSetup && (
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Confirm PIN</label>
                <input
                  type="password"
                  maxLength={8}
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-center text-sm tracking-widest text-white placeholder:text-slate-500 outline-none focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handlePinAction();
                    }
                  }}
                />
              </div>
            )}

            {pinError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[10px] text-rose-300 text-center flex items-center justify-center gap-1.5">
                <AlertCircle size={12} className="shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              onClick={handlePinAction}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 text-xs shadow-lg shadow-blue-600/15 active:scale-[0.98] transition-all cursor-pointer"
            >
              {isPinSetup ? 'Set PIN & Authenticate' : 'Unlock Workspace'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!onboardingCompleted) {
    return <OnboardingWizard startingStep={onboardingStartingStep} onComplete={() => setOnboardingCompleted(true)} />;
  }

  return (
    <div className="h-screen overflow-hidden bg-[#111214] text-slate-100 select-none flex flex-col" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Antigravity Style Header Bar */}
      <header className="flex h-14 items-center justify-between border-b border-[#22242a] bg-[#16171a] px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/10 p-2 text-blue-400 border border-blue-500/20">
            <Bot size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white tracking-tight">BackDoor AI</h1>
              <span className="text-[10px] text-slate-500 font-mono">/ Local Desktop Co-pilot</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-xl bg-[#121316] p-1 border border-[#282a32]">
            <button
              onClick={() => setMainView('chat')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                mainView === 'chat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bot size={13} />
              <span>Co-Pilot & Chat</span>
            </button>
            <button
              id="tour-mock-studio"
              onClick={() => setMainView('mock_studio')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                mainView === 'mock_studio'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity size={13} className="text-amber-400" />
              <span>Mock Interview Studio</span>
            </button>
          </div>

          {/* Stealth HUD Toggle Button */}
          <button
            id="tour-hud-toggle"
            onClick={() => void toggleHud()}
            title={hudActive ? 'HUD Active (Alt+I). Click to hide overlay.' : 'Start HUD (Alt+I). Click to launch stealth overlay.'}
            className={`group flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all shadow-sm cursor-pointer ${
              hudActive
                ? 'border border-emerald-500/50 bg-gradient-to-r from-emerald-950/60 to-emerald-900/40 text-emerald-200 shadow-emerald-950/50 hover:border-rose-500/50 hover:bg-rose-950/40 hover:text-rose-200'
                : 'border border-purple-500/35 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 text-purple-200 hover:border-purple-400/60 hover:bg-purple-900/50 hover:text-white shadow-purple-950/30 hover:shadow-purple-500/10'
            }`}
          >
            {hudActive ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 group-hover:bg-rose-500"></span>
                </span>
                <span className="group-hover:hidden flex items-center gap-1.5">
                  <Eye size={13} className="text-emerald-400" />
                  <span>HUD Active</span>
                </span>
                <span className="hidden group-hover:flex items-center gap-1.5">
                  <EyeOff size={13} className="text-rose-400" />
                  <span>Hide HUD</span>
                </span>
                <span className="rounded bg-emerald-500/20 group-hover:bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300 group-hover:text-rose-300 transition-colors">
                  Alt+I
                </span>
              </>
            ) : (
              <>
                <Zap size={13} className="text-purple-400 group-hover:text-purple-300 transition-transform group-hover:scale-110" />
                <span>Start HUD</span>
                <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-mono text-purple-300">
                  Alt+I
                </span>
              </>
            )}
          </button>

          <span className="hidden items-center gap-1.5 text-emerald-400 font-medium sm:flex bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[11px]">
            <CheckCircle2 size={13} />
            {ready ? 'Native Engine Active' : 'Initializing…'}
          </span>
          <button
            id="tour-settings"
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#333742] bg-[#20232a] hover:bg-[#282c35] px-3 py-1.5 text-slate-200 text-xs font-medium transition-colors shadow-sm cursor-pointer"
          >
            <Settings2 size={14} className="text-blue-400" />
            <span>Settings & AI Keys</span>
          </button>
        </div>
      </header>

      {/* Main Grid View */}
      {mainView === 'mock_studio' ? (
        <MockInterviewStudio onClose={() => setMainView('chat')} />
      ) : (
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Antigravity Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-[#22242a] bg-[#16171a]">
          {/* New Chat Button */}
          <div className="p-3 border-b border-[#22242a]">
            <button
              id="tour-new-chat"
              onClick={() => void handleQuickCreateConversation()}
              disabled={!ready}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#333742] bg-[#20232a] hover:bg-[#282c35] px-3.5 py-2 text-xs font-medium text-white transition-colors shadow-sm disabled:opacity-50"
            >
              <Plus size={14} className="text-blue-400" />
              <span>New Conversation</span>
            </button>
          </div>

          {/* Conversation History List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400">Conversations</div>
            {loadingWorkspace && (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-400">
                <Loader2 className="animate-spin" size={14} /> Loading chats…
              </div>
            )}
            {!loadingWorkspace && conversations.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                <MessageSquarePlus className="mx-auto mb-2 text-slate-600" size={20} />
                <p>No conversations yet.</p>
              </div>
            )}
            {conversations.map((conversation) => (
              <div key={conversation.id} className="group relative">
                <button
                  onClick={() => void selectConversation(conversation.id)}
                  className={`w-full rounded-lg p-2.5 pr-8 text-left transition ${
                    selectedConversation?.id === conversation.id
                      ? 'bg-[#22252c] text-white border border-blue-500/40 shadow-sm'
                      : 'text-slate-300 hover:bg-[#1c1e23] hover:text-white border border-transparent'
                  }`}
                >
                  <div className="truncate text-xs font-medium">{conversation.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-400">
                    <span className="truncate">{conversation.provider} · {conversation.model}</span>
                    <span className="shrink-0">{formatDate(conversation.updatedAt)}</span>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteConversation(conversation.id);
                  }}
                  title="Delete conversation"
                  className="absolute right-1.5 top-2.5 rounded p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Context Capture (Stealth HUD, Speaker Loopback, Microphone & Screen OCR) */}
          <div id="tour-capture-panel">
            <CapturePanel
              hudActive={hudActive}
              screenActive={screenActive}
              micActive={micActive}
              loopbackActive={loopbackActive}
              screenStatus={screenStatus}
              micStatus={micStatus}
              loopbackStatus={loopbackStatus}
              screenError={screenError}
              micError={micError}
              loopbackError={loopbackError}
              latestTranscript={latestTranscript}
              latestLoopbackTranscript={latestLoopbackTranscript}
              latestOcrText={latestOcrText}
              onToggleHud={() => void toggleHud()}
              onToggleScreen={() => void toggleScreenCapture()}
              onToggleMic={() => void toggleMicCapture()}
              onToggleLoopback={() => void toggleLoopbackCapture()}
            />
          </div>
        </aside>

        {/* Profile & Settings Modal */}
        <ProfileSettingsModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onCredentialsUpdated={() => {
            if (apiRef.current) void initializeWorkspace(apiRef.current);
          }}
          onResetOnboarding={() => setOnboardingCompleted(false)}
        />

        {/* Chat Area */}
        <section className="flex min-w-0 flex-1 flex-col bg-[#111214]">
          {error && (
            <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 shrink-0" size={15} />
              <span>{error}</span>
            </div>
          )}
          {!selectedConversation && !loadingConversation && (
            <EmptyChat onCreate={() => void handleQuickCreateConversation()} disabled={!ready} />
          )}
          {loadingConversation && (
            <div className="flex flex-1 items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="animate-spin" size={16} /> Loading conversation…
            </div>
          )}
          {selectedConversation && !loadingConversation && (
            <ChatPanel
              conversation={selectedConversation}
              composer={composer}
              sending={sending}
              onComposerChange={setComposer}
              onComposerKeyDown={handleComposerKeyDown}
              onSend={() => void sendMessage()}
            />
          )}
        </section>
      </main>
      )}
      {tourStep !== null && (
        <TourTooltip
          stepIndex={tourStep}
          onNext={handleTourNext}
          onSkip={handleTourSkip}
        />
      )}
    </div>
  );
}

interface TourStepConfig {
  targetId: string;
  title: string;
  description: string;
  placement: 'bottom' | 'right' | 'left' | 'top';
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    targetId: 'tour-hud-toggle',
    title: 'Stealth HUD Overlay (Alt+I)',
    description: 'Launch the transparent overlay. It runs at the Win32 API level and is completely excluded from screen-sharing tools like Zoom, Teams, and Google Meet.',
    placement: 'bottom'
  },
  {
    targetId: 'tour-mock-studio',
    title: 'Mock Interview Studio',
    description: 'Practice mock interviews under realistic pressure. Select a track, role, and difficulty, and get real-time audio transcript analysis.',
    placement: 'bottom'
  },
  {
    targetId: 'tour-settings',
    title: 'Settings & API Keys',
    description: 'Manage your candidate bio, upload documents to the local RAG search index, or update your secure DPAPI-encrypted API keys.',
    placement: 'bottom'
  },
  {
    targetId: 'tour-new-chat',
    title: 'New Conversations',
    description: 'Create new chat threads to interact directly with your assistant. All conversation history is stored locally in SQLite.',
    placement: 'right'
  },
  {
    targetId: 'tour-capture-panel',
    title: 'Real-Time Context Capture',
    description: 'Toggle Screen OCR polling, Microphone input, or Speaker loopback capture to stream live context directly to the AI.',
    placement: 'right'
  }
];

function TourTooltip({
  stepIndex,
  onNext,
  onSkip,
}: {
  stepIndex: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const step = TOUR_STEPS[stepIndex - 1];
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const updateRect = () => {
      const el = document.getElementById(step.targetId);
      if (el) {
        setRect(el.getBoundingClientRect());
      }
    };
    updateRect();
    const timer = setTimeout(updateRect, 100);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      clearTimeout(timer);
    };
  }, [step]);

  if (!rect) return null;

  let tooltipStyle: React.CSSProperties = {};
  if (step.placement === 'right') {
    const rawLeft = rect.right + 16;
    const rawTop = rect.top + rect.height / 2 - 80;
    const constrainedLeft = Math.max(16, Math.min(rawLeft, window.innerWidth - 320 - 16));
    const constrainedTop = Math.max(16, Math.min(rawTop, window.innerHeight - 220 - 16));
    tooltipStyle = {
      top: constrainedTop,
      left: constrainedLeft,
    };
  } else if (step.placement === 'bottom') {
    const rawLeft = rect.left + rect.width / 2 - 160;
    const rawTop = rect.bottom + 16;
    const constrainedLeft = Math.max(16, Math.min(rawLeft, window.innerWidth - 320 - 16));
    const constrainedTop = Math.max(16, Math.min(rawTop, window.innerHeight - 220 - 16));
    tooltipStyle = {
      top: constrainedTop,
      left: constrainedLeft,
    };
  }

  const isLast = stepIndex === TOUR_STEPS.length;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none">
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={onSkip} />
      <div
        className="absolute border-2 border-blue-500 rounded-xl bg-transparent transition-all duration-300 pointer-events-none shadow-[0_0_20px_rgba(59,130,246,0.6)]"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        className="absolute w-80 rounded-2xl border border-slate-850 bg-[#16181d]/95 p-4 shadow-2xl pointer-events-auto flex flex-col gap-3 animate-in zoom-in-95 duration-200"
        style={tooltipStyle}
      >
        <div className="space-y-1">
          <h3 className="font-bold text-white text-xs tracking-tight flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 font-mono text-[10px] border border-blue-500/25">
              {stepIndex}
            </span>
            {step.title}
          </h3>
          <p className="text-slate-400 text-[11px] leading-relaxed select-text">{step.description}</p>
        </div>
        <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5 text-[11px]">
          <button onClick={onSkip} className="text-slate-500 hover:text-slate-350 font-semibold transition-colors cursor-pointer">
            Skip Tour
          </button>
          <button
            onClick={onNext}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3.5 py-1.5 font-bold text-white shadow-md active:scale-95 transition-all cursor-pointer"
          >
            {isLast ? 'Finish Tour' : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyChat({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 text-blue-400">
        <Sparkles size={28} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-white">Start a local conversation</h2>
      <p className="mt-1.5 max-w-sm text-xs text-slate-400">
        All conversation history, knowledge RAG context, and API keys are stored locally on your machine.
      </p>
      <button
        onClick={onCreate}
        disabled={disabled}
        className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
      >
        <Plus size={15} />
        <span>New conversation</span>
      </button>
    </div>
  );
}

function ChatPanel({
  conversation,
  composer,
  sending,
  onComposerChange,
  onComposerKeyDown,
  onSend,
}: {
  conversation: ConversationDto;
  composer: string;
  sending: boolean;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  const messages = conversation.messages ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 80;
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (sending) {
      userScrolledUpRef.current = false;
      container.scrollTop = container.scrollHeight;
    } else if (!userScrolledUpRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, sending]);

  return (
    <>
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-[#22242a] bg-[#141518] px-6 py-3 shrink-0">
        <div>
          <h2 className="text-xs font-semibold text-white">{conversation.title}</h2>
          <p className="mt-0.5 text-[11px] text-slate-400 font-mono">
            {conversation.provider} · {conversation.model}
          </p>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
          <Clock3 size={13} /> Local SQLite
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
            <Bot size={24} className="mb-2 text-slate-600" />
            <p className="text-xs">No messages yet.</p>
            <p className="mt-0.5 text-[11px]">Ask your question below.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-blue-400 py-2">
                <Loader2 className="animate-spin" size={14} />
                <span>Thinking & streaming response…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Antigravity Style Floating Bottom Input */}
      <div className="p-4 bg-[#111214] shrink-0">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[#282a32] bg-[#16171a] p-2 focus-within:border-blue-500/50 shadow-xl transition-all">
          <textarea
            value={composer}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            disabled={sending}
            rows={2}
            placeholder="Message your assistant… (Enter to send, Shift+Enter for a new line)"
            className="w-full resize-none bg-transparent px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 disabled:opacity-60 font-sans leading-relaxed"
          />
          <div className="flex items-center justify-between pt-1 px-2 border-t border-[#22242a]">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#20232a] border border-[#2d313a] px-2.5 py-0.5 text-[10px] text-slate-400 font-mono">
                {conversation.provider} · {conversation.model}
              </span>
            </div>
            <button
              onClick={onSend}
              disabled={sending || !composer.trim()}
              className="rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 p-2 text-white shadow-md shadow-blue-600/30 transition-all flex items-center justify-center cursor-pointer"
              aria-label="Send message"
            >
              {sending ? <Loader2 className="animate-spin" size={13} /> : <Send size={13} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: MessageDto }) {
  const user = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy message content:', e);
    }
  };

  return (
    <div className={`flex gap-3 ${user ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed select-text ${
          user
            ? 'bg-[#1e2330] border border-blue-500/30 text-white'
            : 'border border-[#22242a] bg-[#16171a] text-slate-200'
        }`}
      >
        <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed select-text font-normal">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-white/5 pt-1.5">
          <p className={`text-[10px] ${user ? 'text-blue-300/80' : 'text-slate-400'}`}>
            {user ? 'You' : 'Assistant'} · {formatDate(message.createdAt)}
          </p>
          {!user && (
            <button
              onClick={() => void handleCopy()}
              className="flex items-center gap-1 rounded bg-[#20232a] px-2 py-0.5 text-[10px] text-slate-300 hover:bg-[#282c35] hover:text-white transition border border-[#2d313a]"
              title="Copy response text"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={11} className="text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CapturePanel({
  hudActive,
  screenActive,
  micActive,
  loopbackActive,
  screenStatus,
  micStatus,
  loopbackStatus,
  screenError,
  micError,
  loopbackError,
  latestTranscript,
  latestLoopbackTranscript,
  latestOcrText,
  onToggleHud,
  onToggleScreen,
  onToggleMic,
  onToggleLoopback,
}: {
  hudActive: boolean;
  screenActive: boolean;
  micActive: boolean;
  loopbackActive: boolean;
  screenStatus: string;
  micStatus: string;
  loopbackStatus: string;
  screenError: string | null;
  micError: string | null;
  loopbackError: string | null;
  latestTranscript: string;
  latestLoopbackTranscript: string;
  latestOcrText: string;
  onToggleHud: () => void;
  onToggleScreen: () => void;
  onToggleMic: () => void;
  onToggleLoopback: () => void;
}) {
  return (
    <div className="border-t border-[#22242a] bg-[#141518] p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Interview Capture & HUD</div>

      {/* Stealth HUD Overlay Card */}
      <div className={`rounded-xl border p-2.5 text-xs transition-all ${
        hudActive
          ? 'border-emerald-500/40 bg-emerald-950/20 shadow-sm'
          : 'border-[#22242a] bg-[#181a1f]'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <Eye size={14} className={hudActive ? 'text-emerald-400 animate-pulse' : 'text-purple-400'} />
            <div className="flex flex-col">
              <span className="leading-tight">Stealth HUD</span>
              <span className="text-[9px] text-slate-500 font-mono">Alt+I</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-medium ${
                hudActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {hudActive ? 'ACTIVE' : 'OFF'}
            </span>
            <button
              onClick={onToggleHud}
              className={`rounded px-2.5 py-0.5 text-[10px] font-semibold transition-all cursor-pointer shadow-sm ${
                hudActive
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 shadow-purple-600/20'
              }`}
            >
              {hudActive ? 'Hide' : 'Start'}
            </button>
          </div>
        </div>
      </div>

      {/* Speaker Loopback (Interviewer Audio) */}
      <div className="rounded-xl border border-[#22242a] bg-[#181a1f] p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <Headphones size={14} className={loopbackActive ? 'text-purple-400 animate-pulse' : 'text-slate-500'} />
            <span>Interviewer (Speaker)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-medium ${
                loopbackActive ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {loopbackStatus}
            </span>
            <button
              onClick={onToggleLoopback}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                loopbackActive
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
              }`}
            >
              {loopbackActive ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
        {loopbackError && <p className="mt-1 text-[10px] text-rose-400">{loopbackError}</p>}
        {loopbackActive && latestLoopbackTranscript && (
          <div className="mt-2 rounded bg-[#111214] p-1.5 text-[10px] text-purple-200 max-h-12 overflow-y-auto border border-purple-500/20">
            &ldquo;{latestLoopbackTranscript}&rdquo;
          </div>
        )}
      </div>

      {/* Microphone (Candidate Audio) */}
      <div className="rounded-xl border border-[#22242a] bg-[#181a1f] p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <Mic size={14} className={micActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
            <span>Candidate (Mic)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-medium ${
                micActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {micStatus}
            </span>
            <button
              onClick={onToggleMic}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                micActive
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {micActive ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
        {micError && <p className="mt-1 text-[10px] text-rose-400">{micError}</p>}
        {micActive && latestTranscript && (
          <div className="mt-2 rounded bg-[#111214] p-1.5 text-[10px] text-emerald-200 max-h-12 overflow-y-auto border border-emerald-500/20">
            &ldquo;{latestTranscript}&rdquo;
          </div>
        )}
      </div>

      {/* Screen OCR Capture Card */}
      <div className="rounded-xl border border-[#22242a] bg-[#181a1f] p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <Monitor size={14} className={screenActive ? 'text-sky-400' : 'text-slate-500'} />
            <span>Screen OCR</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-medium ${
                screenActive ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {screenStatus}
            </span>
            <button
              onClick={onToggleScreen}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                screenActive
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                  : 'bg-sky-600 text-white hover:bg-sky-500'
              }`}
            >
              {screenActive ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
        {screenError && <p className="mt-1 text-[10px] text-rose-400">{screenError}</p>}
        {screenActive && latestOcrText && (
          <div className="mt-2 rounded bg-[#111214] p-1.5 text-[10px] text-slate-400 max-h-12 overflow-y-auto border border-[#22242a] font-mono">
            {latestOcrText.slice(0, 100)}...
          </div>
        )}
      </div>
    </div>
  );
}
