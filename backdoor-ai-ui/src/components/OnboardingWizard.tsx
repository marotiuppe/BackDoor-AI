import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  KeyRound,
  FileText,
  Monitor,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  UploadCloud,
  Check,
  Zap,
  Play,
  ShieldCheck,
  Cpu,
  Bookmark,
  Info,
  Download
} from 'lucide-react';
// Tauri invoke will be imported dynamically

interface UserProfileData {
  fullName: string;
  targetRole: string;
  bio: string;
  skills: string;
  projects: string;
  resumeText: string;
  customInstructions: string;
}

type CredentialProvider = 'GEMINI' | 'GROQ' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA';

interface OnboardingWizardProps {
  onComplete: () => void;
  startingStep?: number;
}

const PROVIDER_METADATA = {
  GEMINI: { name: 'Google Gemini Studio', defaultModel: 'gemini-2.5-flash', badge: 'Recommended for Vision', freeLink: 'https://aistudio.google.com/apikey' },
  GROQ: { name: 'Groq Cloud LPUs', defaultModel: 'llama-3.3-70b-versatile', badge: 'Ultra-Fast (Whisper STT)', freeLink: 'https://console.groq.com/keys' },
  OPENAI: { name: 'OpenAI Developer Platform', defaultModel: 'gpt-4o', badge: 'Industry Standard', freeLink: 'https://platform.openai.com/api-keys' },
  ANTHROPIC: { name: 'Anthropic Claude Console', defaultModel: 'claude-3-5-sonnet-20241022', badge: 'Exceptional Coding', freeLink: 'https://console.anthropic.com/' },
  OLLAMA: { name: 'Local Ollama Server', defaultModel: 'gemma4:31b-cloud', badge: '100% Local & Free', freeLink: 'https://ollama.com' },
};

export function OnboardingWizard({ onComplete, startingStep = 1 }: OnboardingWizardProps) {
  const safeInvoke = async <T = any>(cmd: string, args?: any): Promise<T> => {
    let tauriInvoke;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      tauriInvoke = invoke;
    } catch (e: any) {
      throw new Error('Tauri engine is not ready: ' + (e?.message || e));
    }
    return await tauriInvoke<T>(cmd, args);
  };

  const [step, setStep] = useState<number>(startingStep);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: Credentials
  const [provider, setProvider] = useState<CredentialProvider>('OLLAMA');
  const [apiKey, setApiKey] = useState<string>('');
  const [keyVerified, setKeyVerified] = useState<boolean>(false);
  const [verifyingKey, setVerifyingKey] = useState<boolean>(false);
  const [modelsCount, setModelsCount] = useState<number>(0);
  const [ollamaUpCheck, setOllamaUpCheck] = useState<'checking' | 'running' | 'failed'>('checking');
  const skipOllamaButtonRef = useRef<HTMLButtonElement | null>(null);

  const checkOllamaStatusBg = async () => {
    setOllamaUpCheck('checking');
    try {
      const hostUrl = 'http://127.0.0.1:11434';
      const models = await safeInvoke<{ id: string; name: string }[]>('fetch_provider_models', {
        provider: 'OLLAMA',
        apiKey: hostUrl,
      });
      if (models && models.length > 0) {
        setOllamaUpCheck('running');
      } else {
        setOllamaUpCheck('failed');
      }
    } catch (err) {
      setOllamaUpCheck('failed');
    }
  };

  useEffect(() => {
    if (step === 2) {
      void checkOllamaStatusBg();
    }
  }, [step]);

  useEffect(() => {
    if (step === 2 && ollamaUpCheck === 'running') {
      const timer = setTimeout(() => {
        skipOllamaButtonRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step, ollamaUpCheck]);

  // Step 3 Local Check states
  const [qdrantOk, setQdrantOk] = useState<boolean | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [modelOk, setModelOk] = useState<boolean | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [screenOk, setScreenOk] = useState<boolean | null>(null);
  const [pullingModel, setPullingModel] = useState<boolean>(false);
  const [pullProgress, setPullProgress] = useState<number>(0);
  const [pullStatus, setPullStatus] = useState<string>('');
  const [installingOllama, setInstallingOllama] = useState<boolean>(false);
  const [installProgress, setInstallProgress] = useState<number>(0);
  const [installStatus, setInstallStatus] = useState<string>('');
  const [setupRunning, setSetupRunning] = useState<boolean>(false);
  const [currentSetupTask, setCurrentSetupTask] = useState<'qdrant' | 'ollama' | 'model' | 'hardware' | null>(null);

  // Step 4: Resume (Shifted from Step 3)
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsingResume, setParsingResume] = useState<boolean>(false);
  const [manualProfileEntry, setManualProfileEntry] = useState<boolean>(false);
  const [profile, setProfile] = useState<UserProfileData>({
    fullName: '',
    targetRole: '',
    bio: '',
    skills: '',
    projects: '',
    resumeText: '',
    customInstructions: '',
  });

  // Step 4: System verification
  const [testMic, setTestMic] = useState<boolean>(false);
  const [testSpeaker, setTestSpeaker] = useState<boolean>(false);
  const [overlayActive, setOverlayActive] = useState<boolean>(false);



  // Test Key connection
  const handleVerifyKey = async () => {
    if (!apiKey.trim() && provider !== 'OLLAMA') {
      setError('Please input your API key first.');
      return;
    }
    setVerifyingKey(true);
    setError(null);
    try {
      const urlToSend = provider === 'OLLAMA' ? (apiKey.trim() || 'http://127.0.0.1:11434') : apiKey.trim();
      // First save the credential in DPAPI key ring
      await safeInvoke('save_provider_credential', { provider, apiKey: urlToSend });
      
      // Then fetch models to verify it works
      const models = await safeInvoke<{ id: string; name: string }[]>('fetch_provider_models', {
        provider,
        apiKey: urlToSend,
      });

      if (models && models.length > 0) {
        setModelsCount(models.length);
        setKeyVerified(true);
        localStorage.setItem('backdoor_default_provider', provider);
        localStorage.setItem('backdoor_primary_provider', provider);
        // Save the first model as default
        localStorage.setItem(`backdoor_model_${provider}`, models[0].id);
      } else {
        throw new Error('Key accepted but no models were returned.');
      }
    } catch (err: any) {
      setKeyVerified(false);
      setError(typeof err === 'string' ? err : `Verification failed: ${err?.message || err}`);
    } finally {
      setVerifyingKey(false);
    }
  };

  const runLocalChecks = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Check Qdrant
      try {
        const sidecar = await safeInvoke<{ qdrantPort: number; backendReady: boolean }>('get_sidecar_info');
        setQdrantOk(sidecar.backendReady && sidecar.qdrantPort > 0);
      } catch (err) {
        setQdrantOk(false);
      }

      // 2. Check Ollama & Model (always check it, so we display status in Step 3)
      const hostUrl = 'http://127.0.0.1:11434';
      try {
        const models = await safeInvoke<{ id: string; name: string }[]>('fetch_provider_models', {
          provider: 'OLLAMA',
          apiKey: hostUrl,
        });
        setOllamaOk(true);
        const targetModel = 'gemma4:31b-cloud';
        const hasModel = models.some(m => m.id === targetModel || m.id.startsWith('gemma4') || m.id.startsWith('gemma'));
        setModelOk(hasModel);
      } catch (err) {
        setOllamaOk(false);
        setModelOk(false);
      }

      // 3. Check Microphone (WASAPI Input device availability)
      try {
        const micResult = await safeInvoke<any>('test_microphone_capture');
        setMicOk(!micResult.error);
      } catch (err) {
        setMicOk(false);
      }

      // 4. Check Screen Capture / OCR Engine status
      try {
        const screenResult = await safeInvoke<any>('capture_screen_test');
        setScreenOk(screenResult.ocrSucceeded);
      } catch (err) {
        setScreenOk(false);
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Error running local dependency checks.');
    } finally {
      setLoading(false);
    }
  };

  const handlePullModel = async () => {
    setPullingModel(true);
    setPullProgress(0);
    setPullStatus('Connecting to Ollama...');
    setError(null);

    let unlisten: (() => void) | undefined;
    try {
      const { listen: tauriListen } = await import('@tauri-apps/api/event');
      unlisten = await tauriListen<{ status: string; completed?: number; total?: number }>(
        'ollama-pull-progress',
        (event) => {
          const payload = event.payload;
          if (payload.status) {
            setPullStatus(payload.status);
          }
          if (payload.completed && payload.total) {
            const pct = Math.round((payload.completed / payload.total) * 100);
            setPullProgress(pct);
          }
        }
      );

      // Call pull command on backend
      await safeInvoke('pull_ollama_model', { model: 'gemma4:31b-cloud' });
      
      setPullProgress(100);
      setPullStatus('Download complete!');
      await runLocalChecks();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to download model.');
    } finally {
      setPullingModel(false);
      if (unlisten) {
        unlisten();
      }
    }
  };

  const handleInstallOllama = async () => {
    setInstallingOllama(true);
    setInstallProgress(0);
    setInstallStatus('Initializing download...');
    setError(null);

    let unlisten: (() => void) | undefined;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{ status: string; progress: number }>(
        'ollama-install-progress',
        (event) => {
          const payload = event.payload;
          if (payload.status) {
            setInstallStatus(payload.status);
          }
          if (payload.progress !== undefined) {
            setInstallProgress(payload.progress);
          }
        }
      );

      await safeInvoke('install_ollama');

      setInstallProgress(100);
      setInstallStatus('Ollama installed successfully!');
      await runLocalChecks();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to install Ollama.');
    } finally {
      setInstallingOllama(false);
      if (unlisten) {
        unlisten();
      }
    }
  };

  const runAutomatedSetup = async () => {
    setSetupRunning(true);
    setCurrentSetupTask('qdrant');
    setError(null);
    try {
      // 1. Verify Qdrant
      await runLocalChecks();
      if (!qdrantOk) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await runLocalChecks();
      }

      // 2. Verify Ollama
      setCurrentSetupTask('ollama');
      if (!ollamaOk) {
        setInstallingOllama(true);
        setInstallProgress(0);
        setInstallStatus('Downloading Ollama installer...');
        let unlisten: (() => void) | undefined;
        try {
          const { listen: tauriListen } = await import('@tauri-apps/api/event');
          unlisten = await tauriListen<{ status: string; progress: number }>(
            'ollama-install-progress',
            (event) => {
              const payload = event.payload;
              if (payload.status) setInstallStatus(payload.status);
              if (payload.progress !== undefined) setInstallProgress(payload.progress);
            }
          );
          await safeInvoke('install_ollama');
        } finally {
          setInstallingOllama(false);
          if (unlisten) unlisten();
        }
      }

      // Re-check Ollama status
      await runLocalChecks();

      // 3. Verify Model Library
      setCurrentSetupTask('model');
      if (!modelOk) {
        setPullingModel(true);
        setPullProgress(0);
        setPullStatus('Connecting to Ollama...');
        let unlisten: (() => void) | undefined;
        try {
          const { listen: tauriListen } = await import('@tauri-apps/api/event');
          unlisten = await tauriListen<{ status: string; completed?: number; total?: number }>(
            'ollama-pull-progress',
            (event) => {
              const payload = event.payload;
              if (payload.status) setPullStatus(payload.status);
              if (payload.completed && payload.total) {
                const pct = Math.round((payload.completed / payload.total) * 100);
                setPullProgress(pct);
              }
            }
          );
          await safeInvoke('pull_ollama_model', { model: 'gemma4:31b-cloud' });
        } finally {
          setPullingModel(false);
          if (unlisten) unlisten();
        }
      }

      // 4. Verify Hardware
      setCurrentSetupTask('hardware');
      await runLocalChecks();

      setCurrentSetupTask(null);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Error running automated dependency setup.');
    } finally {
      setSetupRunning(false);
    }
  };

  // Run checks automatically on entering Step 3
  useEffect(() => {
    if (step === 3) {
      void runLocalChecks();
    }
  }, [step, provider]);

    // PDF Content Parser
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
      const printable = raw.replace(/[^\x20-\x7E\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
      return printable.length > 40 ? printable : `[Resume PDF: ${file.name}]`;
    } catch {
      return await file.text();
    }
  };

  // Process Resume upload
  const handleResumeFile = async (file: File) => {
    setResumeFile(file);
    setParsingResume(true);
    setError(null);
    try {
      const text = file.name.toLowerCase().endsWith('.pdf') ? await parsePdfContent(file) : await file.text();
      
      // Save original resume text to profile state
      setProfile(prev => ({ ...prev, resumeText: text }));

      // Call AI to extract structured profile in "raw" JSON mode
      const parsePrompt = `You are a resume parsing assistant. Parse the following resume text and extract the candidate profile in JSON format.
Your output must be a valid JSON object matching this schema exactly:
{
  "fullName": "...",
  "targetRole": "...",
  "bio": "...",
  "skills": "...",
  "projects": "..."
}
Output ONLY the valid JSON block, no markdown, no other text. Do NOT wrap it in \`\`\`json blocks. Just output raw clean text starting with { and ending with }.

Resume text:
${text.substring(0, 8000)}`;

      const activeModel = localStorage.getItem(`backdoor_model_${provider}`) || PROVIDER_METADATA[provider].defaultModel;

      const llmResult = await safeInvoke<string>('ask_overlay_assist', {
        input: {
          prompt: parsePrompt,
          mode: 'raw',
          provider,
          model: activeModel,
          includeScreenImage: false,
          history: [],
        },
      });

      const cleanedJson = llmResult.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedProfile = JSON.parse(cleanedJson);

      setProfile(prev => ({
        ...prev,
        fullName: parsedProfile.fullName || '',
        targetRole: parsedProfile.targetRole || '',
        bio: parsedProfile.bio || '',
        skills: parsedProfile.skills || '',
        projects: parsedProfile.projects || '',
        customInstructions: 'Answer like a senior engineer with trade-off analyses.',
      }));

      // Index in SQLite RAG
      const doc = {
        id: `resume_${Date.now()}`,
        title: file.name,
        docType: 'resume_pdf',
        content: text,
        createdAt: new Date().toISOString(),
      };
      await safeInvoke('create_knowledge_document', { doc });

    } catch (err: any) {
      console.error('Extraction error:', err);
      // Fail gracefully: let user fill profile manually
      setError('AI could not parse the resume automatically. You can fill out your profile details manually in the next screen.');
      setProfile(prev => ({
        ...prev,
        fullName: file.name.split('.')[0] || '',
        targetRole: 'Software Engineer',
      }));
    } finally {
      setParsingResume(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === 'dragover') setIsDragging(true);
    else setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const name = file.name.toLowerCase();
      if (!name.endsWith('.md') && !name.endsWith('.txt') && !name.endsWith('.pdf')) {
        setError('Please drop a .pdf, .md, or .txt file.');
        return;
      }
      await handleResumeFile(file);
    }
  };

  // Step 4 toggles
  const handleToggleOverlay = async () => {
    try {
      const active = await safeInvoke<boolean>('toggle_overlay');
      setOverlayActive(active);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleMic = async () => {
    try {
      const status = await safeInvoke<{ micActive: boolean }>('toggle_audio_capture', { enabled: !testMic });
      setTestMic(status.micActive);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSpeaker = async () => {
    try {
      const status = await safeInvoke<{ loopbackActive: boolean }>('toggle_loopback_capture', { enabled: !testSpeaker });
      setTestSpeaker(status.loopbackActive);
    } catch (err) {
      console.error(err);
    }
  };

  // Save profile and finish
  const handleFinish = async () => {
    setLoading(true);
    setError(null);
    try {
      let finalProfile = { ...profile };
      if (!finalProfile.fullName.trim()) {
        finalProfile.fullName = "Software Engineer Candidate";
      }
      if (!finalProfile.targetRole.trim()) {
        finalProfile.targetRole = "Software Engineer";
      }
      if (!finalProfile.customInstructions.trim()) {
        finalProfile.customInstructions = "Answer like a senior engineer with trade-off analyses.";
      }

      // Save profile to SQLite
      await safeInvoke('save_user_profile', { profile: finalProfile });
      
      // Save completion flag in local storage
      localStorage.setItem('backdoor_onboarding_completed', 'true');
      onComplete();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : `Failed to save setup: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Listen for overlay toggle from backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen: tauriListen } = await import('@tauri-apps/api/event');
        unlisten = await tauriListen<{ visible: boolean }>('overlay-status-changed', (event) => {
          setOverlayActive(event.payload.visible);
        });
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080b] p-4 font-sans select-none overflow-hidden text-slate-100">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-2xl bg-[#0e1015]/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[640px] max-h-[90vh]">
        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-900 shrink-0 flex">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300" style={{ width: `${(step / 6) * 100}%` }} />
        </div>

        {/* Wizard Header */}
        <header className="px-8 pt-8 pb-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 p-2.5 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Bot size={22} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Setup Assistant</h1>
              <p className="text-[10px] text-slate-400 tracking-wider uppercase mt-0.5">Step {step} of 6</p>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">BackDoor AI v0.1.0</span>
        </header>

        {/* Wizard Main Content */}
        <main className="flex-1 overflow-y-auto px-8 py-2">
          {error && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              <Info size={14} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Welcome Screen */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  Welcome to BackDoor AI <Sparkles className="text-blue-400" size={18} />
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your privacy-first, ultra-low-latency desktop interview co-pilot. We run entirely local processes on your computer to intercept screen context and interview dialogue, delivering stealth visual prompts.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="text-xs font-bold text-slate-200">100% Secure & Stealth</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Credentials are saved in Windows DPAPI Keyring. HUD Overlay window is excluded from Zoom, Teams, and screenshot captures.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                    <Cpu size={18} />
                  </div>
                  <h3 className="text-xs font-bold text-slate-200">Local Vector DB (RAG)</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Ingested resumes and whitepapers are chunk-split and searchable in an offline local Qdrant Vector database.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex items-start gap-3">
                <Bookmark size={20} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-300">Quick Prep Checklist:</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Over the next steps, we will verify your LLM provider key, drag-and-drop your resume PDF, and perform a quick hardware test of loopback audio capturing. Let&apos;s begin!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Credentials */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  <KeyRound size={16} className="text-blue-400" /> Save API Credentials
                </h2>
                <p className="text-xs text-slate-400">
                  Select your primary LLM provider and input your API key. Free tiers are fully supported.
                </p>
                {ollamaUpCheck === 'running' && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300 mt-2">
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                    <span>Ollama Local Server detected and active! You can skip entering external API keys and use Ollama locally.</span>
                  </div>
                )}
              </div>

              {/* Provider Grid */}
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(PROVIDER_METADATA) as CredentialProvider[]).map((p) => {
                  const meta = PROVIDER_METADATA[p];
                  const isSelected = provider === p;
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        setProvider(p);
                        setApiKey('');
                        setKeyVerified(false);
                        setModelsCount(0);
                      }}
                      className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                        p === 'OLLAMA' ? 'col-span-2' : ''
                      } ${
                        isSelected
                          ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                          : 'border-slate-850 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">{p}</span>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-blue-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1">{meta.name}</span>
                      <span className="rounded bg-slate-950 px-1.5 py-0.2 text-[8px] font-semibold text-blue-300 border border-white/5 mt-2">
                        {meta.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Key Input */}
              <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-350">
                    {provider === 'OLLAMA' ? 'Ollama Host URL' : `${provider} API Key`}
                  </span>
                  <a
                    href={PROVIDER_METADATA[provider].freeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    {provider === 'OLLAMA' ? 'Ollama Website' : 'Get Free Key'}
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type={provider === 'OLLAMA' ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider === 'OLLAMA' ? 'http://127.0.0.1:11434 (Leave blank for default)' : `Paste your ${provider} API Key`}
                    className="flex-1 rounded-xl border border-slate-800 bg-[#0c0d10] px-3.5 py-2 text-xs text-white outline-none focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
                  />
                  <button
                    onClick={() => void handleVerifyKey()}
                    disabled={verifyingKey || (provider !== 'OLLAMA' && !apiKey.trim())}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2 text-xs font-bold text-white transition active:scale-95 shrink-0 shadow-md"
                  >
                    {verifyingKey ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    <span>Verify</span>
                  </button>
                </div>

                {keyVerified && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                    <Check size={14} />
                    <span>Connection successful! Active default defaults verified. ({modelsCount} models ready)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Local Environment & Models Installer */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-300 font-sans select-none">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  <Cpu size={16} className="text-blue-400" /> Local Environment & Dependencies Check
                </h2>
                <p className="text-xs text-slate-400">
                  Verify local search engines and local LLM configurations required to run BackDoor AI.
                </p>
              </div>

              {/* Automated Setup Banner */}
              <div className="rounded-xl border border-blue-500/30 bg-[#0e1014] p-4 flex flex-col gap-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white">One-Click Auto-Setup</span>
                    <p className="text-[11px] text-slate-400">
                      Let us automatically download, install, and configure Qdrant, Ollama, and the required Gemma model for you.
                    </p>
                  </div>
                  <button
                    onClick={() => void runAutomatedSetup()}
                    disabled={setupRunning}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2 px-4 text-xs transition shadow-md active:scale-95 cursor-pointer shrink-0"
                  >
                    {setupRunning ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Running Setup...</span>
                      </>
                    ) : (
                      <>
                        <Play size={13} className="fill-white" />
                        <span>Start Auto-Setup</span>
                      </>
                    )}
                  </button>
                </div>
                
                {setupRunning && (
                  <div className="mt-1 p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-blue-300 font-bold uppercase tracking-wider text-[9px]">
                        Active Task: {currentSetupTask === 'qdrant' ? 'Checking Vector Database...' : currentSetupTask === 'ollama' ? 'Installing Ollama...' : currentSetupTask === 'model' ? 'Downloading Model Library...' : 'Verifying hardware devices...'}
                      </span>
                    </div>
                    {currentSetupTask === 'ollama' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                          <span>{installStatus}</span>
                          <span>{installProgress}%</span>
                        </div>
                        <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${installProgress}%` }} />
                        </div>
                      </div>
                    )}
                    {currentSetupTask === 'model' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                          <span>{pullStatus}</span>
                          <span>{pullProgress}%</span>
                        </div>
                        <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${pullProgress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {/* 1. Qdrant Sidecar Card */}
                <div className="rounded-xl border border-slate-800 bg-[#0c0d10] p-4 flex items-center justify-between shadow-sm">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      Qdrant Vector Database Sidecar (Required)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Handles context extraction and local knowledge indexing.
                    </p>
                  </div>
                  <div>
                    {qdrantOk === true ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25 font-bold">
                        <Check size={11} /> Running
                      </span>
                    ) : qdrantOk === false ? (
                      <span className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/25 font-bold">
                        Failed to Bind Port
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/30 px-2.5 py-1 rounded-full font-bold">
                        <Loader2 size={11} className="animate-spin" /> Checking
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Ollama Connection (Always show check status) */}
                <div className="rounded-xl border border-slate-800 bg-[#0c0d10] p-4 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-white">Local Ollama Service</span>
                      <p className="text-[11px] text-slate-400">
                        Runs offline LLM inference (runs on http://127.0.0.1:11434).
                      </p>
                    </div>
                    <div>
                      {ollamaOk === true ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25 font-bold">
                          <Check size={11} /> Connected
                        </span>
                      ) : ollamaOk === false ? (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25 font-bold">
                          Not Running
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/30 px-2.5 py-1 rounded-full font-bold">
                          <Loader2 size={11} className="animate-spin" /> Checking
                        </span>
                      )}
                    </div>
                  </div>

                  {ollamaOk === false && provider === 'OLLAMA' && (
                    <div className="mt-1 p-3.5 bg-slate-950/80 rounded-xl border border-slate-850 space-y-3 animate-in fade-in duration-200">
                      <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
                        We couldn&apos;t detect Ollama running. You can manually download it, or let us automatically download and run the installer for you.
                      </p>
                      
                      {!installingOllama && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => void handleInstallOllama()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3.5 text-xs transition shadow-md active:scale-95 cursor-pointer border border-emerald-500/20"
                          >
                            <Download size={13} />
                            <span>Auto-Install Ollama</span>
                          </button>
                          <a
                            href="https://ollama.com/download/OllamaSetup.exe"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-700 hover:border-slate-550 bg-[#121418] hover:bg-[#1c1e24] text-slate-300 font-bold py-1.5 px-3.5 text-xs transition active:scale-95 cursor-pointer"
                          >
                            Download Manually
                          </a>
                          <button
                            onClick={() => void runLocalChecks()}
                            className="rounded-lg border border-slate-700 hover:border-slate-550 bg-[#121418] hover:bg-[#1c1e24] text-slate-300 font-bold py-1.5 px-3.5 text-xs transition active:scale-95 cursor-pointer"
                          >
                            Retry Check
                          </button>
                        </div>
                      )}

                      {installingOllama && (
                        <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                            <span>Status: {installProgress > 0 ? `${installProgress}%` : ''} - {installStatus}</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${installProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. Ollama model check / puller */}
                {ollamaOk === true && (
                  <div className="rounded-xl border border-slate-800 bg-[#0c0d10] p-4 flex flex-col gap-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-white">Default Gemma 4 Model (31B Cloud)</span>
                        <p className="text-[11px] text-slate-400">
                          Verifies if gemma4:31b-cloud is downloaded.
                        </p>
                      </div>
                      <div>
                        {modelOk === true ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25 font-bold">
                            <Check size={11} /> Installed
                          </span>
                        ) : modelOk === false ? (
                          <span className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/25 font-bold">
                            Missing
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/30 px-2.5 py-1 rounded-full font-bold">
                            <Loader2 size={11} className="animate-spin" /> Checking
                          </span>
                        )}
                      </div>
                    </div>

                    {modelOk === false && provider === 'OLLAMA' && (
                      <div className="mt-1 p-3.5 bg-slate-950/80 rounded-xl border border-slate-850 space-y-3">
                        <p className="text-[11px] text-slate-355 leading-relaxed">
                          The required Gemma 4 (31B Cloud) model is not found in your local Ollama library. We can download it automatically now.
                        </p>
                        <button
                          onClick={() => void handlePullModel()}
                          disabled={pullingModel}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3.5 text-xs transition shadow-md active:scale-95 disabled:opacity-40 cursor-pointer"
                        >
                          {pullingModel ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                          <span>Download Model (~4.7 GB)</span>
                        </button>
                      </div>
                    )}

                    {pullingModel && (
                      <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>Status: {pullProgress > 0 ? `${pullProgress}%` : ''} - {pullStatus}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${pullProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Microphone Check */}
                <div className="rounded-xl border border-slate-800 bg-[#0c0d10] p-4 flex items-center justify-between shadow-sm">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      System Microphone (WASAPI Input)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Captures candidate voice answers for interview tracking.
                    </p>
                  </div>
                  <div>
                    {micOk === true ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25 font-bold font-sans">
                        <Check size={11} /> Ready
                      </span>
                    ) : micOk === false ? (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/25 font-bold font-sans">
                        No default microphone
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/30 px-2.5 py-1 rounded-full font-bold">
                        <Loader2 size={11} className="animate-spin" /> Checking
                      </span>
                    )}
                  </div>
                </div>

                {/* 5. Screen OCR Capability Check */}
                <div className="rounded-xl border border-slate-800 bg-[#0c0d10] p-4 flex items-center justify-between shadow-sm">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      Screen Capture & OCR Engine
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Captures current screen code and interview prompts.
                    </p>
                  </div>
                  <div>
                    {screenOk === true ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/25 font-bold font-sans">
                        <Check size={11} /> Active
                      </span>
                    ) : screenOk === false ? (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/25 font-bold font-sans">
                        OCR engine warning
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/30 px-2.5 py-1 rounded-full font-bold">
                        <Loader2 size={11} className="animate-spin" /> Checking
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Resume Upload & Auto-Profile (Shifted from 3) */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  <FileText size={16} className="text-blue-400" /> Resume & Profile Auto-Generation
                </h2>
                <p className="text-xs text-slate-400">
                  Drop your resume as a <strong className="text-blue-300">.pdf</strong>, <strong className="text-blue-300">.md</strong>, or <strong className="text-blue-300">.txt</strong> file. The AI will parse it and automatically generate your technical candidate profile.
                </p>
              </div>

              {/* Upload Zone */}
              {!resumeFile && !manualProfileEntry && !parsingResume && (
                <div
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-[1.01]'
                      : 'border-slate-800 bg-slate-950/30 hover:border-slate-700 hover:bg-slate-900/10'
                  }`}
                >
                  <div className="rounded-2xl bg-blue-500/10 p-3.5 text-blue-400 border border-blue-500/20 mb-2.5 animate-pulse">
                    <UploadCloud size={26} />
                  </div>
                  <h4 className="text-xs font-bold text-white">Drag & Drop Resume (.pdf, .md, or .txt) here</h4>
                  <p className="text-[10px] text-slate-500 mt-1">PDF, Markdown & plain-text files supported</p>
                  
                  <div className="flex items-center gap-3 mt-4">
                    <label className="cursor-pointer rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-1.5 px-4 rounded-lg text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all">
                      <span>Browse Files</span>
                      <input
                        type="file"
                        accept=".pdf,.md,.txt"
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            await handleResumeFile(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setManualProfileEntry(true)}
                      className="rounded-lg border border-[#333742] bg-[#20232a] hover:bg-[#282c35] text-slate-200 font-bold py-1.5 px-4 text-xs transition active:scale-95 cursor-pointer"
                    >
                      Enter Manually
                    </button>
                  </div>
                </div>
              )}

              {/* Parsing Progress Loader */}
              {parsingResume && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/50 p-12 text-center">
                  <Loader2 size={32} className="animate-spin text-blue-400 mb-4" />
                  <h4 className="text-xs font-bold text-white">Extracting Resume & Generating Candidate Profile...</h4>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-sm leading-relaxed">
                    This will take a few seconds. We are securely parsing your work history, signature projects, tech stacks, and compiling your co-pilot directives.
                  </p>
                </div>
              )}

              {/* Profile Preview Card */}
              {(resumeFile || manualProfileEntry) && !parsingResume && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[320px] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-xs font-bold text-blue-400">
                      {resumeFile ? '✨ Generated Candidate Profile' : '👤 Candidate Profile Information'}
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full uppercase">Ready</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Full Name</label>
                      <input
                        type="text"
                        value={profile.fullName}
                        onChange={(e) => setProfile(prev => ({ ...prev, fullName: e.target.value }))}
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Target Role</label>
                      <input
                        type="text"
                        value={profile.targetRole}
                        onChange={(e) => setProfile(prev => ({ ...prev, targetRole: e.target.value }))}
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Candidate Bio</label>
                    <textarea
                      value={profile.bio}
                      onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded bg-slate-900 border border-slate-800 p-2 text-xs text-white outline-none focus:border-blue-500/50 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Tech Stacks & Skills</label>
                    <input
                      type="text"
                      value={profile.skills}
                      onChange={(e) => setProfile(prev => ({ ...prev, skills: e.target.value }))}
                      className="mt-1 w-full rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Signature Projects</label>
                    <textarea
                      value={profile.projects}
                      onChange={(e) => setProfile(prev => ({ ...prev, projects: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded bg-slate-900 border border-slate-800 p-2 text-xs text-white outline-none focus:border-blue-500/50 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                    <span>{resumeFile ? `File parsed: ${resumeFile.name}` : 'Manual Profile Mode'}</span>
                    <button
                      onClick={() => {
                        setResumeFile(null);
                        setManualProfileEntry(false);
                        setProfile({
                          fullName: '',
                          targetRole: '',
                          bio: '',
                          skills: '',
                          projects: '',
                          resumeText: '',
                          customInstructions: '',
                        });
                      }}
                      className="text-rose-400 hover:underline"
                    >
                      Reset & Upload New
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Perception checks (Shifted from 4) */}
          {step === 5 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  <Monitor size={16} className="text-blue-400" /> System Perception & Commands Check
                </h2>
                <p className="text-xs text-slate-400">
                  Verify desktop capturing overlays and check loopback voice capture. Try them below.
                </p>
              </div>

              {/* Hotkeys */}
              <div className="rounded-xl border border-slate-800 bg-[#0c0d11] p-3 text-xs space-y-2">
                <span className="font-bold text-white">⌨️ Critical Shortcuts Matrix:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-white/5">
                    <span className="text-slate-400">Toggle HUD Overlay</span>
                    <kbd className="bg-slate-950 border border-white/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[9px] font-bold">Alt + I</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-white/5">
                    <span className="text-slate-400">Answer Audio Dialogue</span>
                    <kbd className="bg-slate-950 border border-white/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[9px] font-bold">Alt + Q</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-white/5">
                    <span className="text-slate-400">Solve Screen Code (OCR)</span>
                    <kbd className="bg-slate-950 border border-white/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[9px] font-bold">Alt + S</kbd>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-white/5">
                    <span className="text-slate-400">Cycle Opacity / Ghost</span>
                    <kbd className="bg-slate-950 border border-white/10 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[9px] font-bold">Alt + H</kbd>
                  </div>
                </div>
              </div>

              {/* Verification Toggles */}
              <div className="space-y-2.5">
                {/* HUD Test */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/30 text-xs">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-slate-200">1. Test Floating HUD Overlay</h3>
                    <p className="text-[10px] text-slate-400">Toggle the stealth overlay. Position it below your webcam.</p>
                  </div>
                  <button
                    onClick={() => void handleToggleOverlay()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                      overlayActive
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-350'
                        : 'bg-white/5 border-white/10 text-slate-350 hover:bg-white/10'
                    }`}
                  >
                    {overlayActive ? 'Overlay Active' : 'Toggle Overlay'}
                  </button>
                </div>

                {/* Speaker Loopback Test */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/30 text-xs">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-slate-200">2. Speaker Loopback Capture</h3>
                    <p className="text-[10px] text-slate-400">Capture voice output from Zoom/Teams. Muted by default.</p>
                  </div>
                  <button
                    onClick={() => void handleToggleSpeaker()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                      testSpeaker
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 animate-pulse'
                        : 'bg-white/5 border-white/10 text-slate-350 hover:bg-white/10'
                    }`}
                  >
                    {testSpeaker ? 'Listening' : 'Start Speaker'}
                  </button>
                </div>

                {/* Mic Test */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-900/30 text-xs">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-slate-200">3. Microphone Voice Capture</h3>
                    <p className="text-[10px] text-slate-400">Test voice capturing of candidate answers. Muted by default.</p>
                  </div>
                  <button
                    onClick={() => void handleToggleMic()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                      testMic
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 animate-pulse'
                        : 'bg-white/5 border-white/10 text-slate-350 hover:bg-white/10'
                    }`}
                  >
                    {testMic ? 'Listening' : 'Start Mic'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Finalization (Shifted from 5) */}
          {step === 6 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="space-y-2 text-center py-6">
                <div className="mx-auto rounded-full bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 p-4 h-16 w-16 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-bounce">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-xl font-extrabold text-white tracking-tight">Configuration Completed!</h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  BackDoor AI is configured and ready. Plaintext API keys have been securely encrypted via DPAPI and stored inside Windows Credential Manager.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200 border-b border-white/5 pb-2">
                  <span>Configuration Summary</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs leading-relaxed text-slate-300">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Active AI Engine</span>
                    <span className="font-semibold text-white">{provider} ({localStorage.getItem(`backdoor_model_${provider}`)?.substring(0, 20) || 'default'})</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Candidate Profile</span>
                    <span className="font-semibold text-white">{profile.fullName || 'Alex Zhang'} ({profile.targetRole || 'Software Engineer'})</span>
                  </div>
                  <div className="flex flex-col col-span-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Local RAG Knowledge</span>
                    <span className="font-semibold text-white">SQLite Chunks & Cosine Vector database activated</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <span>You can edit these configurations or upload more documents anytime by opening the <strong>Settings & AI Keys</strong> panel in the top-right header of the workspace window.</span>
              </div>
            </div>
          )}
        </main>

        {/* Wizard Footer Controls */}
        <footer className="px-8 py-6 border-t border-[#22242a] bg-[#121418] shrink-0 flex items-center justify-between">
          <button
            onClick={() => setStep(prev => Math.max(1, prev - 1))}
            disabled={step === 1 || loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#333742] bg-[#1a1c22] hover:bg-[#22252e] hover:border-slate-600 px-4 py-2 text-xs font-bold text-slate-300 transition-all disabled:opacity-30 active:scale-95"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                ref={skipOllamaButtonRef}
                onClick={() => {
                  setProvider('OLLAMA');
                  setApiKey('');
                  setKeyVerified(false);
                  localStorage.setItem('backdoor_default_provider', 'OLLAMA');
                  localStorage.setItem('backdoor_primary_provider', 'OLLAMA');
                  localStorage.setItem('backdoor_model_OLLAMA', 'gemma4:31b-cloud');
                  setStep(3);
                }}
                className="rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/30 hover:bg-slate-900/60 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition-all mr-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:text-white"
              >
                Skip Key Setup (Use Ollama)
              </button>
            )}

            {step < 6 ? (
              <button
                onClick={() => setStep(prev => Math.min(6, prev + 1))}
                disabled={
                  (step === 2 && !keyVerified && provider !== 'OLLAMA') ||
                  (step === 3 && !qdrantOk)
                }
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => void handleFinish()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-6 py-2.5 text-xs font-extrabold text-white shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.01] active:scale-95 cursor-pointer"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Launch Workspace</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
