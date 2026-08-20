import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  Camera,
  Check,
  Copy,
  Eye,
  Headphones,
  HelpCircle,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  VolumeX,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import type { AudioCaptureStatus, HudConversationItem, OverlayHistoryMessage } from '../types/chat';

interface OverlayViewProps {
  provider?: string;
  onClose?: () => void;
}

export function OverlayView({ provider: initialProvider, onClose }: OverlayViewProps) {
  const [provider, setProvider] = useState(() => {
    return initialProvider || localStorage.getItem('backdoor_default_provider') || localStorage.getItem('mypersonalai_default_provider') || 'GEMINI';
  });
  const [promptText, setPromptText] = useState('');
  const [conversation, setConversation] = useState<HudConversationItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLatest, setCopiedLatest] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<string>('what_to_say');
  const [stealthMode, setStealthMode] = useState(true);
  const [autoAssist, setAutoAssist] = useState(false);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [showNamingModal, setShowNamingModal] = useState<boolean>(true);
  const [tempTitle, setTempTitle] = useState<string>('');

  const currentStreamingIdRef = useRef<string | null>(null);
  const conversationRef = useRef<HudConversationItem[]>([]);
  conversationRef.current = conversation;

  const handleStartSession = async (skip = false) => {
    let title = tempTitle.trim();
    if (skip || !title) {
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
      title = `Overlay Session (${dateStr} ${timeStr})`;
    }
    setSessionTitle(title);
    setShowNamingModal(false);

    try {
      const activeProvider = provider || localStorage.getItem('backdoor_default_provider') || 'GEMINI';
      const savedModel = localStorage.getItem(`backdoor_model_${activeProvider}`) || (activeProvider === 'GEMINI' ? 'gemini-3.7-flash' : activeProvider === 'GROQ' ? 'llama-3.3-70b-versatile' : activeProvider === 'ANTHROPIC' ? 'claude-sonnet-4.6' : activeProvider === 'OLLAMA' ? 'gemma4:31b-cloud' : 'gpt-5.4');

      const conv = await invoke<{ id: string }>('create_conversation', {
        input: {
          title,
          provider: activeProvider,
          model: savedModel,
        },
      });
      setCurrentConversationId(conv.id);
    } catch (err) {
      console.error('[OverlayView] Error starting persistent session:', err);
    }
  };

  const triggerSyncRag = async (convId: string, title: string, listToSync: HudConversationItem[]) => {
    if (listToSync.length === 0) return;

    let transcript = `# Interview Transcript: ${title}\n`;
    transcript += `Date: ${new Date().toLocaleString()}\n\n`;

    listToSync.forEach((item, index) => {
      const mLabel = modeLabels[item.mode || ''] || 'Smart Assist';
      transcript += `## Turn ${index + 1} (${mLabel})\n`;
      transcript += `**Question / Captured Prompt**:\n${item.question}\n\n`;
      if (item.answer) {
        transcript += `**Co-pilot Talking Points**:\n${item.answer}\n\n`;
      } else if (item.error) {
        transcript += `**Error**:\n${item.error}\n\n`;
      }
      transcript += `---\n\n`;
    });

    try {
      await invoke('sync_overlay_session_rag', {
        conversationId: convId,
        title,
        content: transcript,
      });
    } catch (e) {
      console.error('[OverlayView] Failed to sync session RAG:', e);
    }
  };

  // HUD Answer Font Size (10px to 22px)
  const [hudFontSize, setHudFontSize] = useState<number>(() => {
    return parseInt(localStorage.getItem('backdoor_hud_font_size') || '13', 10);
  });

  const changeHudFontSize = (delta: number) => {
    setHudFontSize((prev) => {
      const next = Math.max(10, Math.min(22, prev + delta));
      localStorage.setItem('backdoor_hud_font_size', next.toString());
      window.dispatchEvent(new Event('backdoor_hud_font_size_changed'));
      return next;
    });
  };

  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem('backdoor_hud_font_size');
      if (saved) {
        setHudFontSize(parseInt(saved, 10));
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('backdoor_hud_font_size_changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('backdoor_hud_font_size_changed', handleStorage);
    };
  }, []);

  // Transparency Modes: 0 = Normal Solid (100%), 1 = Transparent Glass (78%), 2 = Ghost (35%)
  const [opacityMode, setOpacityMode] = useState<number>(0);
  const opacityLevels = [
    { label: 'Normal Mode', shortLabel: 'Normal', bg: 'bg-[#111214]', blur: 'backdrop-blur-none', border: 'border-[#282a32]' },
    { label: 'Transparent Glass', shortLabel: 'Transparent', bg: 'bg-[#111214]/78', blur: 'backdrop-blur-2xl', border: 'border-white/15' },
    { label: 'Ghost Mode', shortLabel: 'Ghost', bg: 'bg-[#111214]/35', blur: 'backdrop-blur-md', border: 'border-white/10' },
  ];

  // Context status
  const [micActive, setMicActive] = useState(false);
  const [loopbackActive, setLoopbackActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);

  const [interviewerText, setInterviewerText] = useState<string>('');
  const [screenText, setScreenText] = useState<string>('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastInterviewerRef = useRef<string>('');

  const toggleStealthMode = async () => {
    const nextVal = !stealthMode;
    setStealthMode(nextVal);
    try {
      await invoke('set_overlay_capture_exclusion', { enabled: nextVal });
    } catch (err) {
      console.error('Error toggling capture exclusion:', err);
    }
  };

  const toggleMic = async () => {
    try {
      const status = await invoke<AudioCaptureStatus>('toggle_audio_capture', { enabled: !micActive });
      setMicActive(status.micActive);
    } catch (err) {
      console.error('Error toggling microphone capture:', err);
    }
  };

  const toggleLoopback = async () => {
    try {
      const status = await invoke<AudioCaptureStatus>('toggle_loopback_capture', { enabled: !loopbackActive });
      setLoopbackActive(status.loopbackActive);
    } catch (err) {
      console.error('Error toggling loopback capture:', err);
    }
  };

  const toggleScreen = async () => {
    try {
      const status = await invoke<{ active: boolean }>('toggle_screen_capture', { enabled: !screenActive });
      setScreenActive(status.active);
    } catch (err) {
      console.error('Error toggling screen capture:', err);
    }
  };

  const toggleAutoAssist = async () => {
    const next = !autoAssist;
    setAutoAssist(next);
    try {
      await invoke('set_auto_assist', { enabled: next });
    } catch (err) {
      console.error('Error toggling auto assist:', err);
    }
  };

  const cycleOpacity = () => {
    setOpacityMode((prev) => (prev + 1) % opacityLevels.length);
  };

  // Auto-scroll to bottom during streaming or when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, streaming]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sync stealth mode state with backend on mount
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ capture_exclusion_active: boolean }>('overlay-status-changed', (event) => {
          if (event.payload) {
            setStealthMode(Boolean(event.payload.capture_exclusion_active));
          }
        });
        const status = await invoke<{ capture_exclusion_active: boolean }>('get_overlay_status');
        if (status) {
          setStealthMode(Boolean(status.capture_exclusion_active));
        }
      } catch (err) {
        console.error('[OverlayView] Error syncing overlay status:', err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Listen for Tauri live streaming chunks (Targeting only the currently active conversation item)
  useEffect(() => {
    let unlistenChunk: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;

    void (async () => {
      unlistenChunk = await listen<string>('overlay-stream-chunk', (event) => {
        const targetId = currentStreamingIdRef.current;
        if (!targetId) return;
        setConversation((prev) =>
          prev.map((item) =>
            item.id === targetId
              ? { ...item, answer: item.answer + event.payload }
              : item
          )
        );
      });

      unlistenDone = await listen<unknown>('overlay-stream-done', () => {
        const targetId = currentStreamingIdRef.current;
        if (targetId) {
          setConversation((prev) =>
            prev.map((item) =>
              item.id === targetId ? { ...item, isStreaming: false } : item
            )
          );
        }
        currentStreamingIdRef.current = null;
        setStreaming(false);
      });
    })();

    return () => {
      if (unlistenChunk) unlistenChunk();
      if (unlistenDone) unlistenDone();
    };
  }, []);

  // Poll for dual audio and screen OCR context
  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const audioStatus = await invoke<AudioCaptureStatus>('get_audio_capture_status');
        setMicActive(audioStatus.micActive);
        setLoopbackActive(audioStatus.loopbackActive);

        if (audioStatus.lastLoopbackTranscript && audioStatus.lastLoopbackTranscript.trim()) {
          const q = audioStatus.lastLoopbackTranscript.trim();
          setInterviewerText(q);

          // Auto-trigger assist only when speech has concluded (at least 2.5s silence)
          const nowMs = Date.now();
          const silenceDuration = nowMs - (audioStatus.lastSpeechTimestampMs || 0);
          if (autoAssist && !streaming && q.length > 20 && silenceDuration >= 2500 && q !== lastInterviewerRef.current) {
            lastInterviewerRef.current = q;
            void executeAssist('what_to_say', q);
          }
        }

        const screenStatus = await invoke<{ active: boolean; lastText?: string }>('get_screen_capture_status');
        setScreenActive(screenStatus.active);
        if (screenStatus.lastText) {
          setScreenText(screenStatus.lastText);
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [autoAssist, streaming]);

  // Global Overlay Keyboard Shortcuts (Alt+Q = Quick Answer, Alt+S = Solve Code, Alt+H = Ghost Mode, Alt+C = Clear History)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showNamingModal) return;
      if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        void executeAssist('what_to_say');
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void executeAssist('solve_code', undefined, true);
      } else if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        cycleOpacity();
      } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [streaming, promptText, interviewerText, opacityMode]);

  const clearQuestion = async () => {
    try {
      await invoke('clear_audio_transcript');
      await invoke('clear_screen_text');
      setInterviewerText('');
      setScreenText('');
      setPromptText('');
      lastInterviewerRef.current = '';
    } catch (err) {
      console.error('Error clearing question:', err);
    }
  };

  const handlePasteContextToInput = (text: string) => {
    setPromptText(text);
    inputRef.current?.focus();
  };

  const executeAssist = async (mode: string = 'what_to_say', customQuery?: string, includeVision?: boolean) => {
    // If currently streaming another item, cleanly mark it as finalized without losing its streamed content
    if (currentStreamingIdRef.current) {
      const prevId = currentStreamingIdRef.current;
      setConversation((prev) =>
        prev.map((item) =>
          item.id === prevId ? { ...item, isStreaming: false } : item
        )
      );
      currentStreamingIdRef.current = null;
    }

    const rawQuery = customQuery !== undefined ? customQuery : (promptText || interviewerText);
    const query = rawQuery.trim();

    // Determine the question title to display on the conversation card
    const displayQuestion =
      query ||
      (interviewerText.trim()
        ? interviewerText.trim()
        : screenText.trim()
        ? `Screen OCR: ${screenText.trim().substring(0, 80)}...`
        : 'Smart Assist');

    // Clear prompt input box but keep transcribed question visible in HUD!
    setPromptText('');
    setActiveMode(mode);
    setError(null);

    if (currentConversationId) {
      try {
        await invoke('save_overlay_message', {
          conversationId: currentConversationId,
          role: 'user',
          content: displayQuestion,
        });
      } catch (e) {
        console.error('Failed to log user turn:', e);
      }
    }

    // Prepare complete conversation history of previous completed turns for backend LLM context
    const historyPayload: OverlayHistoryMessage[] = conversationRef.current
      .filter((item) => item.answer.trim().length > 0 && !item.error)
      .flatMap((item) => [
        { role: 'user', content: item.question },
        { role: 'assistant', content: item.answer },
      ]);

    const itemId = `hud-turn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newItem: HudConversationItem = {
      id: itemId,
      question: displayQuestion,
      answer: '',
      mode,
      timestamp: Date.now(),
      isStreaming: true,
    };

    // Append new item to conversation list (preserving all previous answers!)
    setConversation((prev) => [...prev, newItem]);
    currentStreamingIdRef.current = itemId;
    setStreaming(true);

    const activeProvider = provider || localStorage.getItem('backdoor_default_provider') || localStorage.getItem('mypersonalai_default_provider') || 'GEMINI';
    const savedModel = localStorage.getItem(`backdoor_model_${activeProvider}`) || localStorage.getItem(`mypersonalai_model_${activeProvider}`) || (activeProvider === 'GEMINI' ? 'gemini-3.7-flash' : activeProvider === 'GROQ' ? 'llama-3.3-70b-versatile' : activeProvider === 'ANTHROPIC' ? 'claude-sonnet-4.6' : activeProvider === 'OLLAMA' ? 'gemma4:31b-cloud' : 'gpt-5.4');

    try {
      const finalResult = await invoke<string>('ask_overlay_assist', {
        input: {
          prompt: query,
          mode,
          provider: activeProvider,
          model: savedModel,
          includeScreenImage: includeVision || mode === 'solve_code' || mode === 'vision',
          history: historyPayload,
        },
      });

      if (finalResult && finalResult.trim()) {
        const answerText = finalResult.trim();
        setConversation((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, answer: answerText, isStreaming: false }
              : item
          )
        );

        if (currentConversationId) {
          try {
            await invoke('save_overlay_message', {
              conversationId: currentConversationId,
              role: 'assistant',
              content: answerText,
            });
            const latestList = conversationRef.current.map((item) =>
              item.id === itemId ? { ...item, answer: answerText, isStreaming: false } : item
            );
            void triggerSyncRag(currentConversationId, sessionTitle, latestList);
          } catch (e) {
            console.error('Failed to log assistant turn:', e);
          }
        }
      } else {
        setConversation((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, isStreaming: false } : item
          )
        );
      }
    } catch (err) {
      const errMsg = typeof err === 'string' ? err : 'Failed to connect to AI Provider.';
      // Mark ONLY the current conversation item as failed and preserve all previous answers intact
      setConversation((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, isStreaming: false, error: errMsg }
            : item
        )
      );
      setError(errMsg);
    } finally {
      if (currentStreamingIdRef.current === itemId) {
        currentStreamingIdRef.current = null;
        setStreaming(false);
      }
    }
  };

  const handleStop = () => {
    const activeId = currentStreamingIdRef.current;
    if (activeId) {
      setConversation((prev) =>
        prev.map((item) =>
          item.id === activeId ? { ...item, isStreaming: false } : item
        )
      );
    }
    currentStreamingIdRef.current = null;
    setStreaming(false);
  };

  const handleClear = () => {
    setConversation([]);
    currentStreamingIdRef.current = null;
    setStreaming(false);
    setError(null);
    setPromptText('');
  };

  const handleCopyItem = (id: string, text: string) => {
    if (text) {
      void navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const handleCopyLatest = () => {
    const lastItem = conversation[conversation.length - 1];
    if (lastItem && lastItem.answer) {
      void navigator.clipboard.writeText(lastItem.answer);
      setCopiedLatest(true);
      setTimeout(() => setCopiedLatest(false), 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void executeAssist(activeMode);
    } else if (e.key === 'Escape') {
      handleClear();
    }
  };

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [role="button"]')) {
      return;
    }
    try {
      void getCurrentWindow().startDragging();
    } catch (err) {
      console.error('[Overlay] Error dragging window:', err);
    }
  };

  const currentOpacity = opacityLevels[opacityMode];

  const modeLabels: Record<string, string> = {
    assist: 'Smart Assist',
    what_to_say: 'What should I say?',
    solve_code: 'Solve Code',
    vision: 'Snap & Solve',
    follow_ups: 'Follow-ups',
    recap: 'Recap',
  };

  return (
    <div
      className={`flex h-screen w-screen flex-col ${currentOpacity.bg} text-slate-100 ${currentOpacity.blur} shadow-2xl rounded-2xl border ${currentOpacity.border} overflow-hidden select-none cursor-default transition-all duration-300`}
      style={{
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.15)',
        cursor: 'default',
      }}
    >
      {/* 1. Ultra-Compact Controls Header Bar (Height ~28px - Drag anywhere on header to move HUD) */}
      <header
        data-tauri-drag-region
        onMouseDown={handleHeaderMouseDown}
        className="flex h-8 items-center justify-between px-3 bg-black/60 backdrop-blur-md border-b border-white/10 cursor-grab active:cursor-grabbing shrink-0 gap-2 overflow-x-auto scrollbar-none"
        title="Click and drag anywhere on this header bar to move HUD"
      >
        {/* Left Toggles: Stealth, Loopback, Mic, Screen, Auto */}
        <div data-tauri-drag-region className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleStealthMode}
            title={stealthMode ? 'Stealth ON (Invisible to screen shares). Click to toggle.' : 'Stealth OFF (Visible). Click to toggle.'}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 border text-[9px] font-semibold transition-all duration-200 active:scale-95 ${
              stealthMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)] hover:border-emerald-400 hover:text-white'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.2)] hover:border-rose-400 hover:text-white'
            }`}
          >
            {stealthMode ? <ShieldCheck size={10} className="text-emerald-400" /> : <Eye size={10} className="text-rose-400" />}
            <span>{stealthMode ? 'Stealth' : 'Visible'}</span>
          </button>

          {/* Interviewer Speaker Loopback Capture */}
          <button
            onClick={toggleLoopback}
            title={loopbackActive ? 'Interviewer Speaker Loopback Active. Click to Mute.' : 'Interviewer Loopback Muted. Click to Start.'}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 border text-[9px] font-semibold transition-all duration-200 active:scale-95 ${
              loopbackActive
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.25)] hover:border-purple-400 hover:text-white'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            {loopbackActive ? <Headphones size={9} className="animate-pulse text-purple-400" /> : <VolumeX size={9} />}
            <span>{loopbackActive ? 'Interviewer ON' : 'Speaker OFF'}</span>
          </button>

          {/* Candidate Microphone Capture */}
          <button
            onClick={toggleMic}
            title={micActive ? 'Your Mic Listening. Click to Mute.' : 'Mic Muted. Click to Start.'}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 border text-[9px] font-semibold transition-all duration-200 active:scale-95 ${
              micActive
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.2)] hover:border-emerald-400 hover:text-white'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            {micActive ? <Mic size={9} className="animate-pulse text-emerald-400" /> : <MicOff size={9} />}
            <span>{micActive ? 'Mic ON' : 'Muted'}</span>
          </button>

          {/* Screen OCR Capture */}
          <button
            onClick={toggleScreen}
            title={screenActive ? 'Screen OCR Active. Click to Stop.' : 'Screen OCR Idle. Click to Start.'}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 border text-[9px] font-semibold transition-all duration-200 active:scale-95 ${
              screenActive
                ? 'bg-sky-500/15 border-sky-500/35 text-sky-300 shadow-[0_0_8px_rgba(14,165,233,0.2)] hover:border-sky-400 hover:text-white'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            {screenActive ? <Monitor size={9} className="text-sky-400" /> : <MonitorOff size={9} />}
            <span>{screenActive ? 'OCR' : 'OCR Off'}</span>
          </button>

          {/* Auto-Assist Toggle */}
          <button
            onClick={toggleAutoAssist}
            title={autoAssist ? 'Auto-Assist ON (Auto-triggers answer when interviewer finishes speaking). Click to toggle.' : 'Auto-Assist OFF. Click to enable.'}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 border text-[9px] font-semibold transition-all duration-200 active:scale-95 ${
              autoAssist
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)] hover:border-amber-400 hover:text-white'
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            <Zap size={9} className={autoAssist ? 'text-amber-400' : 'text-slate-500'} />
            <span>{autoAssist ? 'Auto ON' : 'Auto OFF'}</span>
          </button>

          <button
            onClick={cycleOpacity}
            title={`HUD Background: ${currentOpacity.label}. Click to cycle transparency.`}
            className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 border text-[9px] font-semibold transition-all duration-200 active:scale-95 ${
              opacityMode === 0
                ? 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                : 'border-blue-500/30 bg-blue-500/15 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.15)] hover:border-blue-400 hover:text-white'
            }`}
          >
            <Layers size={9} className={opacityMode === 0 ? 'text-slate-400' : 'text-blue-400'} />
            <span>{currentOpacity.shortLabel}</span>
          </button>
        </div>

        {/* Right Controls: Model select & Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          {sessionTitle && (
            <div className="max-w-[120px] truncate bg-white/10 text-slate-200 border border-white/10 text-[9px] font-semibold px-2.5 py-0.5 rounded-full" title={sessionTitle}>
              📁 {sessionTitle}
            </div>
          )}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.25)] border border-blue-400/20">
            {modeLabels[activeMode] || 'Assistant'}
          </div>

          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              localStorage.setItem('backdoor_default_provider', e.target.value);
            }}
            className="rounded bg-black/60 px-2 py-0.5 text-[9px] font-semibold text-slate-200 border border-white/10 outline-none hover:bg-slate-800 hover:border-white/20 cursor-pointer"
          >
            <option value="GEMINI">Gemini</option>
            <option value="GROQ">Groq</option>
            <option value="OPENAI">OpenAI</option>
            <option value="ANTHROPIC">Claude</option>
            <option value="OLLAMA">Ollama</option>
          </select>

          <button
            onClick={async () => {
              if (onClose) {
                onClose();
              } else {
                try {
                  await invoke('hide_overlay');
                } catch (e) {
                  console.error('Failed to hide overlay:', e);
                }
              }
            }}
            title="Close HUD (Alt+I)"
            className="rounded p-0.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      </header>

      {/* 2. Live Interviewer Question Bar (Multi-line Full Sentence Rendering with Paste, Answer, Clear) */}
      <div className="flex items-start justify-between px-3 py-2 bg-black/50 border-b border-white/10 text-[10px] text-slate-300 gap-2.5 shrink-0 max-h-28 overflow-y-auto">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {interviewerText ? (
            <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/5 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.12)] px-2.5 py-1.5 rounded-lg text-purple-100 font-medium flex items-start gap-2 w-full">
              <span className="shrink-0 text-purple-300 font-bold bg-purple-500/15 border border-purple-500/30 rounded px-1.5 py-0.2 text-[8px] tracking-wider uppercase">🎧 Question</span>
              <p className="break-words leading-relaxed select-text text-purple-100 flex-1 whitespace-pre-wrap">{interviewerText}</p>
            </div>
          ) : screenText ? (
            <div className="bg-gradient-to-r from-sky-500/10 to-blue-500/5 border border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.12)] px-2.5 py-1.5 rounded-lg text-sky-200 text-[9px] flex items-start gap-2 w-full">
              <span className="shrink-0 text-sky-300 font-bold bg-sky-500/15 border border-sky-500/30 rounded px-1.5 py-0.2 text-[8px] tracking-wider uppercase">🖥️ Screen OCR</span>
              <p className="break-words leading-relaxed select-text flex-1 whitespace-pre-wrap">{screenText}</p>
            </div>
          ) : (
            <span className="text-slate-400 text-[10px] italic flex items-center gap-2 px-1.5 py-1 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Listening... waiting for interviewer question or active screen code
            </span>
          )}
        </div>

        {(interviewerText || screenText) && (
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            <button
              onClick={() => handlePasteContextToInput(interviewerText || screenText)}
              disabled={streaming}
              title="Paste question into prompt input"
              className="text-[9px] font-semibold text-sky-300 hover:text-white bg-sky-500/15 hover:bg-sky-500/25 px-2 py-0.5 rounded-md border border-sky-500/30 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer shadow-sm"
            >
              Paste
            </button>
            <button
              onClick={() => void executeAssist('what_to_say', interviewerText || screenText)}
              disabled={streaming}
              title="Generate answer"
              className="text-[9px] font-bold text-blue-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/30 px-2 py-0.5 rounded-md border border-blue-500/30 shadow-sm transition-all hover:scale-[1.03] hover:shadow-[0_0_8px_rgba(59,130,246,0.2)] active:scale-95 cursor-pointer"
            >
              ⚡ Answer
            </button>
            <button
              onClick={() => void clearQuestion()}
              title="Clear question & reset context pipeline"
              className="text-[9px] font-semibold text-slate-400 hover:text-rose-300 bg-white/5 hover:bg-rose-500/15 px-2 py-0.5 rounded-md border border-white/10 hover:border-rose-500/35 transition-all hover:scale-[1.03] active:scale-95 cursor-pointer shadow-sm"
            >
              ✕ Clear
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Continuous Conversation History Viewport */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 min-h-0 select-text space-y-4">
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 shadow-lg shadow-rose-950/20">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {conversation.length === 0 && !streaming && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 py-12 select-none">
            <Sparkles size={24} className="text-slate-600 mb-2.5 animate-pulse" />
            <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase">HUD Ready</p>
            <p className="text-[10px] text-slate-500 mt-1 max-w-[300px] leading-relaxed">
              Interviewer voice transcriptions, active screen OCR codes, or custom typed prompts will automatically stream structured talking points here.
            </p>
          </div>
        )}

        {conversation.map((item, idx) => {
          const isLatest = idx === conversation.length - 1;
          return (
            <div
              key={item.id}
              className={`rounded-xl p-3.5 border transition-all duration-300 ${
                isLatest
                  ? 'bg-gradient-to-b from-white/[0.06] to-white/[0.02] border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md'
                  : 'bg-black/35 border-white/[0.08] opacity-80 hover:opacity-100 hover:bg-black/40'
              }`}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between gap-2 pb-2 mb-2 border-b border-white/10 text-[10px]">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="font-bold text-sky-300 shrink-0 bg-gradient-to-r from-sky-500/20 to-blue-500/20 border border-sky-500/40 px-2 py-0.2 rounded-md text-[9px] shadow-sm">
                    Q{idx + 1}
                  </span>
                  <span className="text-slate-200 font-semibold break-words select-text leading-tight" title={item.question}>
                    {item.question}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  {item.mode && modeLabels[item.mode] && (
                    <span className="text-[8px] px-2 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25 font-bold tracking-wide uppercase">
                      {modeLabels[item.mode]}
                    </span>
                  )}
                  {item.answer && !item.isStreaming && (
                    <button
                      onClick={() => handleCopyItem(item.id, item.answer)}
                      title="Copy answer"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-pointer"
                    >
                      {copiedId === item.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Answer / Error Content */}
              {item.error ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-[10px] text-rose-300">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{item.error}</span>
                </div>
              ) : item.answer ? (
                <div
                  className="prose prose-invert prose-sm max-w-none leading-relaxed text-slate-100 font-normal select-text"
                  style={
                    {
                      fontSize: `${hudFontSize}px`,
                      lineHeight: `${Math.round(hudFontSize * 1.58)}px`,
                      '--tw-prose-body': '#f1f5f9',
                      '--tw-prose-headings': '#ffffff',
                      '--tw-prose-code': '#93c5fd',
                      '--tw-prose-bullets': '#94a3b8',
                    } as React.CSSProperties
                  }
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const codeContent = String(children).replace(/\n$/, '');
                        return !inline ? (
                          <div className="relative my-2 rounded-lg border border-white/10 bg-slate-950/80 p-3 overflow-x-auto font-mono text-[11px] leading-relaxed group/code">
                            <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity duration-200">
                              <button
                                onClick={() => {
                                  void navigator.clipboard.writeText(codeContent);
                                }}
                                className="p-1 rounded bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition active:scale-90"
                                title="Copy code"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </div>
                        ) : (
                          <code className="bg-slate-900 border border-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-blue-300 font-medium" {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {item.answer.startsWith('“') || item.answer.startsWith('"')
                      ? item.answer
                      : `“${item.answer}”`}
                  </ReactMarkdown>
                </div>
              ) : item.isStreaming ? (
                <div className="flex items-center gap-2 text-xs text-blue-400 py-1 font-medium">
                  <Loader2 size={13} className="animate-spin text-blue-400" />
                  <span className="text-[11px]">Thinking & speculatively streaming answer...</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 4. Ultra-Compact Bottom Toolbar & Input Combined */}
      <footer className="px-3 pb-3 pt-1 shrink-0 space-y-1.5">
        {/* Quick Click Action Chips */}
        <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void executeAssist('what_to_say')}
              disabled={streaming}
              className="flex items-center gap-1 text-sky-400 hover:text-white transition-all font-semibold hover:scale-[1.03] active:scale-95 cursor-pointer"
            >
              <Wand2 size={11} />
              <span>What should I say?</span>
            </button>
            <span className="text-slate-700">•</span>
            <button
              onClick={() => void executeAssist('solve_code', undefined, true)}
              disabled={streaming}
              className="flex items-center gap-1 text-emerald-400 hover:text-white transition-all font-semibold hover:scale-[1.03] active:scale-95 cursor-pointer"
            >
              <Sparkles size={11} />
              <span>Solve Code</span>
            </button>
            <span className="text-slate-700">•</span>
            <button
              onClick={() => void executeAssist('vision', 'Analyze and solve the code or architecture diagram on my screen.', true)}
              disabled={streaming}
              title="Capture active screen & analyze with multimodal vision"
              className="flex items-center gap-1 text-sky-400 hover:text-white transition-all font-semibold hover:scale-[1.03] active:scale-95 cursor-pointer"
            >
              <Camera size={11} />
              <span>Snap & Solve</span>
            </button>
            <span className="text-slate-700">•</span>
            <button
              onClick={() => void executeAssist('follow_ups')}
              disabled={streaming}
              className="flex items-center gap-1 hover:text-white transition-all font-semibold hover:scale-[1.03] active:scale-95 cursor-pointer text-indigo-400"
            >
              <HelpCircle size={11} />
              <span>Follow-ups</span>
            </button>
            <span className="text-slate-700">•</span>
            <button
              onClick={() => void executeAssist('recap')}
              disabled={streaming}
              className="flex items-center gap-1 hover:text-white transition-all font-semibold hover:scale-[1.03] active:scale-95 cursor-pointer text-purple-400"
            >
              <RefreshCw size={11} />
              <span>Recap</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick HUD Font Size Zoom */}
            <div className="flex items-center gap-1 rounded-full bg-slate-900/60 px-2 py-0.5 border border-white/10 text-[9px] text-slate-400 shadow-sm">
              <button
                onClick={() => changeHudFontSize(-1)}
                title="Decrease Font Size"
                className="hover:text-white px-1 font-bold transition-colors cursor-pointer active:scale-75"
              >
                A-
              </button>
              <span className="text-[8px] font-mono text-blue-300 font-semibold px-0.5">{hudFontSize}px</span>
              <button
                onClick={() => changeHudFontSize(1)}
                title="Increase Font Size"
                className="hover:text-white px-1 font-bold transition-colors cursor-pointer active:scale-75"
              >
                A+
              </button>
            </div>

            {conversation.length > 0 && conversation[conversation.length - 1].answer && !streaming && (
              <button
                onClick={handleCopyLatest}
                title="Copy latest answer"
                className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-md border border-white/10 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                {copiedLatest ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                <span>{copiedLatest ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Ultra-Slim Input Bar */}
        <div className="h-9 rounded-xl border border-white/15 bg-white/[0.06] px-2.5 flex items-center gap-2 focus-within:border-blue-500/55 focus-within:bg-white/[0.09] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] transition-all">
          <span className="flex items-center gap-1 rounded bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 shadow-sm">
            <Zap size={9} className="text-amber-400" />
            <span>Smart</span>
          </span>

          <input
            ref={inputRef}
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about screen or interview question, or Enter for Assist"
            disabled={streaming}
            className="flex-1 bg-transparent text-[11px] text-white placeholder:text-slate-500 outline-none"
          />

          {promptText && !streaming && (
            <button
              onClick={() => setPromptText('')}
              title="Clear input text"
              className="text-slate-400 hover:text-white p-0.5 transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          )}

          {streaming ? (
            <button
              onClick={handleStop}
              className="rounded-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 p-1.5 text-white shadow-md shadow-rose-600/35 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-90"
            >
              <Square size={9} />
            </button>
          ) : (
            <button
              onClick={() => void executeAssist(activeMode)}
              disabled={streaming || (!promptText.trim() && !interviewerText && !screenText)}
              className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 p-1.5 text-white shadow-md shadow-blue-600/35 flex items-center justify-center shrink-0 cursor-pointer transition-all active:scale-90"
            >
              <Play size={9} className="fill-white translate-x-0.5" />
            </button>
          )}
        </div>
      </footer>

      {showNamingModal && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#07080b]/95 p-4 font-sans select-none overflow-hidden text-slate-100 backdrop-blur-xl">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[100px] pointer-events-none" />

          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111214]/80 p-5 shadow-2xl backdrop-blur-md space-y-4 relative">
            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-400 border border-blue-500/20 mb-1">
                <Sparkles size={20} className="animate-pulse" />
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight">Name Interview Session</h3>
              <p className="text-[10px] text-slate-400 leading-relaxed max-w-[280px]">
                Create a persistent, secure session. All transcriptions, screen context, and co-pilot answers will be saved to your workspace history and indexed for RAG.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Session Name / Purpose</label>
                <input
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  placeholder="e.g. Google Coding Round, Java Prep"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleStartSession();
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => void handleStartSession()}
                  className="flex-grow rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 text-xs shadow-lg shadow-blue-600/15 active:scale-95 transition-all cursor-pointer"
                >
                  Start Session
                </button>
                <button
                  onClick={() => void handleStartSession(true)}
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold px-3 py-2 text-xs active:scale-95 transition-all cursor-pointer"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
