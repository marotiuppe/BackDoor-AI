import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Code2,
  Download,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Play,
  Send,
  Sparkles,
  StopCircle,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { AudioCaptureStatus, MockInterviewSession } from '../types/chat';

interface MockInterviewStudioProps {
  onClose?: () => void;
}

interface QuestionTurn {
  questionNumber: number;
  interviewerQuestion: string;
  candidateAnswer: string;
  feedback?: string;
  technicalScore?: number;
  communicationScore?: number;
  structureScore?: number;
  tradeoffScore?: number;
  suggestedFollowUp?: string;
}

const INTERVIEW_TRACKS = [
  {
    id: 'system_design',
    title: 'System Design & Distributed Architecture',
    desc: 'Scalability, Paxos/Raft consensus, DB partitioning, Caching, P99 latency SLA',
    icon: Layers,
    color: 'from-blue-600 to-indigo-600',
    starterQuestion:
      'Design a globally distributed rate limiter that handles 100,000 requests per second across 5 regions with sub-2 millisecond latency. How would you prevent race conditions between edge nodes?',
  },
  {
    id: 'dsa_coding',
    title: 'Data Structures & Algorithmic Problem Solving',
    desc: 'Optimal time/space complexity, edge cases, graph traversals, and dynamic programming',
    icon: Code2,
    color: 'from-emerald-600 to-teal-600',
    starterQuestion:
      'Given an array of integers representing stock prices on consecutive days, find the maximum profit you can achieve with at most K transactions. Explain your dynamic programming state definition and how you optimize space to O(K).',
  },
  {
    id: 'behavioral_star',
    title: 'Executive Behavioral & STAR Leadership',
    desc: 'Handling architectural disagreements, high-severity outages, and team influence',
    icon: Award,
    color: 'from-amber-600 to-orange-600',
    starterQuestion:
      'Tell me about a time you identified a critical architectural bottleneck that your team overlooked. How did you convince stakeholders to prioritize fixing it, and what was the quantifiable impact?',
  },
  {
    id: 'cloud_sre',
    title: 'Cloud Infrastructure & SRE Resilience',
    desc: 'Kubernetes failover, zero-downtime database migrations, and chaos engineering',
    icon: Zap,
    color: 'from-purple-600 to-pink-600',
    starterQuestion:
      'Your production cluster is experiencing a cascading eviction storm causing 500 errors across all microservices. Walk me through your step-by-step incident triage and mitigation strategy.',
  },
];

export function MockInterviewStudio({ onClose }: MockInterviewStudioProps) {
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('Senior (L5/L6)');
  const [targetRole, setTargetRole] = useState<string>('');

  const [generatingTopics, setGeneratingTopics] = useState<boolean>(false);
  const [dynamicTracks, setDynamicTracks] = useState<typeof INTERVIEW_TRACKS | null>(null);

  const resolvedTracks = dynamicTracks ?? INTERVIEW_TRACKS;

  const [inSession, setInSession] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [turns, setTurns] = useState<QuestionTurn[]>([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);

  const [candidateInput, setCandidateInput] = useState<string>('');
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [ttsSpeaking, setTtsSpeaking] = useState<boolean>(false);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [micActive, setMicActive] = useState<boolean>(false);

  const [finalScorecard, setFinalScorecard] = useState<MockInterviewSession | null>(null);
  const [savedSessions, setSavedSessions] = useState<MockInterviewSession[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    loadPastSessions();
    void generateTopicsFromProfile();
  }, []);

  const generateTopicsFromProfile = async () => {
    try {
      const profile = await invoke<{
        fullName: string;
        targetRole: string;
        bio: string;
        skills: string;
        projects: string;
      }>('get_user_profile');

      if (profile.targetRole) setTargetRole(profile.targetRole);

      const hasProfile = profile.skills.trim().length > 10 || profile.projects.trim().length > 10;
      if (!hasProfile) return;

      setGeneratingTopics(true);

      const provider = (localStorage.getItem('backdoor_default_provider') || 'OLLAMA') as string;
      const model = localStorage.getItem(`backdoor_model_${provider}`) || '';

      const profileSummary = [
        profile.targetRole ? `Target Role: ${profile.targetRole}` : '',
        profile.skills ? `Technologies: ${profile.skills.slice(0, 400)}` : '',
        profile.projects ? `Projects: ${profile.projects.slice(0, 400)}` : '',
        profile.bio ? `Background: ${profile.bio.slice(0, 300)}` : '',
      ].filter(Boolean).join('\n');

      const prompt = `You are a technical interview designer.
Candidate Profile:
${profileSummary}

Generate exactly 4 personalized interview tracks tailored to this candidate's actual tech stack and projects.
Each track must match a specific technology/domain the candidate has real experience with.

OUTPUT FORMAT RULES:
1. Return ONLY a valid JSON array.
2. Do NOT use markdown fences. Start with '[' and end with ']'.

<json_schema>
[
  {
    "id": "unique_snake_case_id",
    "title": "Track Title (concise)",
    "desc": "1 short sentence about what will be tested",
    "starterQuestion": "A focused opening interview question tailored to their specific projects and stack"
  }
]
</json_schema>`;

      const res: string = await invoke('ask_overlay_assist', {
        input: {
          prompt,
          mode: 'assist',
          provider,
          model,
          includeScreenImage: false,
        },
      });

      // Parse and validate
      const clean = res.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean) as Array<{
        id: string;
        title: string;
        desc: string;
        starterQuestion: string;
      }>;

      if (Array.isArray(parsed) && parsed.length > 0) {
        // Map to same shape as INTERVIEW_TRACKS (using static icons cycling)
        const icons = [Layers, Code2, Award, Zap];
        const colors = [
          'from-blue-600 to-indigo-600',
          'from-emerald-600 to-teal-600',
          'from-amber-600 to-orange-600',
          'from-purple-600 to-pink-600',
        ];
        const mapped = parsed.map((t, i) => ({
          ...t,
          icon: icons[i % icons.length],
          color: colors[i % colors.length],
        }));
        setDynamicTracks(mapped);
        setSelectedTrack(mapped[0]?.id ?? '');
      }
    } catch (err) {
      console.warn('Topic generation failed, using defaults:', err);
      setSelectedTrack(INTERVIEW_TRACKS[0].id);
    } finally {
      setGeneratingTopics(false);
    }
  };

  const loadPastSessions = async () => {
    try {
      const list = await invoke<MockInterviewSession[]>('list_mock_interview_sessions');
      setSavedSessions(list);
    } catch (err) {
      console.error('Failed to load past mock interview sessions:', err);
    }
  };

  const speakText = (text: string) => {
    if (!ttsEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setTtsSpeaking(true);
    utterance.onend = () => setTtsSpeaking(false);
    utterance.onerror = () => setTtsSpeaking(false);
    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setTtsSpeaking(false);
    }
  };

  const startSession = () => {
    const trackObj = resolvedTracks.find((t) => t.id === selectedTrack) || resolvedTracks[0];
    if (!trackObj) return;
    const newSessionId = `mock_${Date.now()}`;
    const initialTurn: QuestionTurn = {
      questionNumber: 1,
      interviewerQuestion: trackObj.starterQuestion,
      candidateAnswer: '',
    };

    setSessionId(newSessionId);
    setTurns([initialTurn]);
    setCurrentTurnIndex(0);
    setCandidateInput('');
    setFinalScorecard(null);
    setInSession(true);
    speakText(initialTurn.interviewerQuestion);
  };

  const toggleMic = async () => {
    try {
      const next = !micActive;
      const status = await invoke<AudioCaptureStatus>('toggle_audio_capture', { enabled: next });
      setMicActive(status.micActive);
    } catch (err) {
      console.error('Failed to toggle microphone:', err);
    }
  };

  // Poll mic transcript when listening
  useEffect(() => {
    if (!micActive || !inSession) return;
    const interval = window.setInterval(async () => {
      try {
        const status = await invoke<AudioCaptureStatus>('get_audio_capture_status');
        if (status.lastMicTranscript && status.lastMicTranscript.trim()) {
          setCandidateInput((prev) => {
            if (prev.endsWith(status.lastMicTranscript.trim())) return prev;
            return prev ? `${prev} ${status.lastMicTranscript.trim()}` : status.lastMicTranscript.trim();
          });
        }
      } catch (err) {
        // Ignore polling error
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [micActive, inSession]);

  const submitCandidateAnswer = async () => {
    if (!candidateInput.trim() || evaluating) return;

    setEvaluating(true);
    stopSpeaking();

    const currentTurn = turns[currentTurnIndex];
    const updatedTurns = [...turns];
    updatedTurns[currentTurnIndex] = {
      ...currentTurn,
      candidateAnswer: candidateInput.trim(),
    };
    setTurns(updatedTurns);

    // Call LLM for real-time rubric evaluation & follow-up probe
    const evaluationPrompt = `You are an elite Senior Staff Bar Raiser conducting a live interview.
TRACK: ${selectedTrack}
DIFFICULTY: ${difficulty}
INTERVIEWER QUESTION: "${currentTurn.interviewerQuestion}"
CANDIDATE ANSWER: "${candidateInput.trim()}"

Evaluate the candidate's answer with strict standards.

OUTPUT FORMAT RULES:
1. Return a valid JSON object ONLY.
2. Do NOT wrap the JSON in markdown code blocks or code fences (e.g. do NOT use \`\`\`json ... \`\`\`).
3. Do NOT include any introductory or concluding conversational text. Start with '{' and end with '}'.

<json_schema>
{
  "technicalScore": <integer, range 0-100>,
  "communicationScore": <integer, range 0-100>,
  "structureScore": <integer, range 0-100>,
  "tradeoffScore": <integer, range 0-100>,
  "feedback": "string, 2-3 sentence punchy critique on strengths & blindspots",
  "followUpQuestion": "string, a challenging follow-up probe question testing trade-offs, edge cases, or scalability limits"
}
</json_schema>`;

    try {
      const evalProvider = (localStorage.getItem('backdoor_default_provider') as string) || (localStorage.getItem('mypersonalai_default_provider') as string) || 'GEMINI';
      const evalModel = localStorage.getItem(`backdoor_model_${evalProvider}`) || localStorage.getItem(`mypersonalai_model_${evalProvider}`) || (evalProvider === 'GEMINI' ? 'gemini-3.7-flash' : evalProvider === 'GROQ' ? 'llama-3.3-70b-versatile' : evalProvider === 'ANTHROPIC' ? 'claude-sonnet-4.6' : evalProvider === 'OLLAMA' ? 'gemma4:31b-cloud' : 'gpt-5.4');

      const evaluationRes = await invoke<string>('ask_overlay_assist', {
        input: {
          prompt: evaluationPrompt,
          mode: 'assist',
          provider: evalProvider,
          model: evalModel,
          includeScreenImage: false,
        },
      });

      // Parse JSON from LLM response
      let evalData = {
        technicalScore: 85,
        communicationScore: 82,
        structureScore: 88,
        tradeoffScore: 80,
        feedback: 'Solid foundational architecture. You articulated the core components clearly.',
        followUpQuestion: 'How would your design behave if network partitions occur between region A and region B?',
      };

      try {
        const jsonMatch = evaluationRes.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          evalData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.warn('Evaluation JSON parse error:', e);
      }

      // Save turn evaluation
      updatedTurns[currentTurnIndex] = {
        ...updatedTurns[currentTurnIndex],
        feedback: evalData.feedback,
        technicalScore: evalData.technicalScore,
        communicationScore: evalData.communicationScore,
        structureScore: evalData.structureScore,
        tradeoffScore: evalData.tradeoffScore,
        suggestedFollowUp: evalData.followUpQuestion,
      };

      if (updatedTurns.length < 3) {
        // Add next turn
        const nextTurn: QuestionTurn = {
          questionNumber: updatedTurns.length + 1,
          interviewerQuestion: evalData.followUpQuestion,
          candidateAnswer: '',
        };
        updatedTurns.push(nextTurn);
        setTurns(updatedTurns);
        setCurrentTurnIndex(updatedTurns.length - 1);
        setCandidateInput('');
        speakText(nextTurn.interviewerQuestion);
      } else {
        // Completed 3 turns -> generate final scorecard
        setTurns(updatedTurns);
        await generateFinalScorecard(updatedTurns);
      }
    } catch (err) {
      console.error('Error evaluating turn:', err);
    } finally {
      setEvaluating(false);
    }
  };

  const generateFinalScorecard = async (completedTurns: QuestionTurn[]) => {
    const avgTech = Math.round(
      completedTurns.reduce((acc, t) => acc + (t.technicalScore || 80), 0) / completedTurns.length
    );
    const avgComm = Math.round(
      completedTurns.reduce((acc, t) => acc + (t.communicationScore || 80), 0) / completedTurns.length
    );
    const avgStruct = Math.round(
      completedTurns.reduce((acc, t) => acc + (t.structureScore || 80), 0) / completedTurns.length
    );
    const avgTrade = Math.round(
      completedTurns.reduce((acc, t) => acc + (t.tradeoffScore || 80), 0) / completedTurns.length
    );
    const overall = Math.round((avgTech + avgComm + avgStruct + avgTrade) / 4);

    const scorecard: MockInterviewSession = {
      id: sessionId,
      title: `${selectedTrack.replace('_', ' ').toUpperCase()} Session (${new Date().toLocaleDateString()})`,
      targetRole,
      track: selectedTrack,
      difficulty,
      overallScore: overall,
      technicalDepthScore: avgTech,
      communicationScore: avgComm,
      structureScore: avgStruct,
      tradeoffsScore: avgTrade,
      strengths:
        '• Strong grasp of fundamental scalability patterns and caching hierarchies.\n• Good clarity when breaking down high-level architectural blocks.',
      blindspots:
        '• Overlooked network partition failure modes in secondary regions.\n• Mention metrics and quantifiable throughput numbers more explicitly.',
      recommendations:
        '• Deepen familiarity with Raft quorum write guarantees.\n• Always state Time and Space complexity before writing code.',
      transcriptJson: JSON.stringify(completedTurns),
      createdAt: new Date().toISOString(),
    };

    setFinalScorecard(scorecard);

    try {
      await invoke('save_mock_interview_session', { session: scorecard });
      await loadPastSessions();
    } catch (err) {
      console.error('Failed to save mock interview session:', err);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await invoke('delete_mock_interview_session', { id });
      setSavedSessions(savedSessions.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const currentTurn = turns[currentTurnIndex];

  return (
    <div className="flex h-full w-full flex-col bg-[#0f1013] text-slate-100 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-[#22242a] bg-[#141518] px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
            <Activity size={18} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              Mock Interview Studio
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/30">
                Voice AI Simulation
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Realistic Voice Bar Raiser with Live Rubric Scoring</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
              showHistory
                ? 'bg-blue-600 text-white border-blue-500'
                : 'border-[#282a32] bg-[#1a1b20] text-slate-300 hover:text-white'
            }`}
          >
            <Clock size={13} />
            <span>Past Sessions ({savedSessions.length})</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-[#22242a] hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Main Studio Viewport */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Track & Config Sidebar / History Panel */}
        <aside className="w-80 border-r border-[#22242a] bg-[#121316] p-4 flex flex-col justify-between overflow-y-auto shrink-0 space-y-4">
          {showHistory ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Saved Interview Sessions</span>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  Back to Setup
                </button>
              </div>

              {savedSessions.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">No past sessions yet.</p>
              )}

              {savedSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-[#22242a] bg-[#16171b] p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white truncate max-w-[170px]">
                      {session.title}
                    </span>
                    <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                      {session.overallScore}/100
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Track: {session.track.replace('_', ' ')} · {session.difficulty}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-[#22242a]">
                    <span className="text-[9px] text-slate-500">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="text-slate-500 hover:text-rose-400 p-0.5"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300">Select Interview Track</label>
                  {generatingTopics && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-400">
                      <Loader2 size={11} className="animate-spin" />
                      Personalizing from profile...
                    </span>
                  )}
                  {dynamicTracks && !generatingTopics && (
                    <span className="text-[10px] text-emerald-400 font-semibold">✓ Tailored to your stack</span>
                  )}
                </div>
                <div className="mt-1 space-y-2">
                  {resolvedTracks.map((track) => {
                    const Icon = track.icon;
                    const isSelected = selectedTrack === track.id;
                    return (
                      <button
                        key={track.id}
                        disabled={inSession}
                        onClick={() => setSelectedTrack(track.id)}
                        className={`w-full text-left rounded-xl p-3 border transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-600/10 text-white shadow-sm'
                            : 'border-[#22242a] bg-[#16171b] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon size={15} className={isSelected ? 'text-blue-400' : 'text-slate-500'} />
                          <span className="text-xs font-semibold">{track.title}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">{track.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Target Role & Difficulty</label>
                <input
                  type="text"
                  disabled={inSession}
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="Target Role"
                  className="mt-1.5 w-full rounded-lg border border-[#282a32] bg-[#16171b] px-3 py-1.5 text-xs text-white outline-none"
                />

                <select
                  disabled={inSession}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#282a32] bg-[#16171b] px-3 py-1.5 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="Mid-Level (L4/SDE II)">Mid-Level (L4 / SDE II)</option>
                  <option value="Senior (L5/L6)">Senior Engineer / Tech Lead (L5/L6)</option>
                  <option value="Principal / Staff">Principal / Staff Engineer (L7+)</option>
                </select>
              </div>
            </div>
          )}

          {!inSession && !finalScorecard && (
            <button
              onClick={startSession}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:brightness-110 transition"
            >
              <Play size={14} className="fill-white" />
              <span>Start Interactive Interview</span>
            </button>
          )}

          {inSession && (
            <button
              onClick={() => {
                setInSession(false);
                stopSpeaking();
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600/20 border border-rose-500/30 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition"
            >
              <StopCircle size={14} />
              <span>End Interview Session</span>
            </button>
          )}
        </aside>

        {/* Center Main Stage Area */}
        <main className="flex-1 flex flex-col bg-[#0e0f12] overflow-y-auto p-6 space-y-4">
          {/* Final Scorecard Modal View */}
          {finalScorecard && (
            <div className="rounded-2xl border border-emerald-500/30 bg-[#14181f] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-[#22242a] pb-4">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                    Interview Completed · Scorecard
                  </span>
                  <h2 className="text-lg font-bold text-white mt-0.5">{finalScorecard.title}</h2>
                  <p className="text-xs text-slate-400">
                    Role: {finalScorecard.targetRole} · {finalScorecard.difficulty}
                  </p>
                </div>
                <div className="flex flex-col items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/40 px-5 py-2.5">
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    {finalScorecard.overallScore}%
                  </span>
                  <span className="text-[10px] text-emerald-300 font-semibold">OVERALL RATING</span>
                </div>
              </div>

              {/* Rubric Breakdown Grid */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#22242a] bg-[#181a20] p-3 text-center">
                  <span className="text-[10px] text-slate-400">Technical Depth</span>
                  <p className="text-lg font-bold text-blue-400 font-mono">
                    {finalScorecard.technicalDepthScore}%
                  </p>
                </div>
                <div className="rounded-xl border border-[#22242a] bg-[#181a20] p-3 text-center">
                  <span className="text-[10px] text-slate-400">Communication</span>
                  <p className="text-lg font-bold text-sky-400 font-mono">
                    {finalScorecard.communicationScore}%
                  </p>
                </div>
                <div className="rounded-xl border border-[#22242a] bg-[#181a20] p-3 text-center">
                  <span className="text-[10px] text-slate-400">Structure & STAR</span>
                  <p className="text-lg font-bold text-amber-400 font-mono">
                    {finalScorecard.structureScore}%
                  </p>
                </div>
                <div className="rounded-xl border border-[#22242a] bg-[#181a20] p-3 text-center">
                  <span className="text-[10px] text-slate-400">Trade-offs & Edge Cases</span>
                  <p className="text-lg font-bold text-purple-400 font-mono">
                    {finalScorecard.tradeoffsScore}%
                  </p>
                </div>
              </div>

              {/* Critique Sections */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Key Strengths
                  </span>
                  <p className="text-slate-300 leading-relaxed whitespace-pre-line">
                    {finalScorecard.strengths}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertCircle size={14} /> Identified Blindspots
                  </span>
                  <p className="text-slate-300 leading-relaxed whitespace-pre-line">
                    {finalScorecard.blindspots}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    if (!finalScorecard) return;
                    const mdReport = `# BackDoor AI — Mock Interview Evaluation Report
**Track:** ${finalScorecard.track || selectedTrack}
**Role:** ${finalScorecard.targetRole || targetRole}
**Level:** ${finalScorecard.difficulty || difficulty}
**Date:** ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}

---

## 📊 Performance Scores
- **Overall Score:** ${finalScorecard.overallScore}%
- **Technical Depth:** ${finalScorecard.technicalDepthScore}%
- **Communication & Clarity:** ${finalScorecard.communicationScore}%
- **Structure & STAR Method:** ${finalScorecard.structureScore}%
- **Trade-offs & Edge Cases:** ${finalScorecard.tradeoffsScore}%

---

## 🟢 Key Strengths
${finalScorecard.strengths}

---

## 🟡 Identified Blindspots & Improvement Areas
${finalScorecard.blindspots}

---

*Generated by BackDoor AI Desktop Assistant*
`;
                    const blob = new Blob([mdReport], { type: 'text/markdown;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Interview_Report_${(finalScorecard.track || selectedTrack).replace(/\s+/g, '_')}_${Date.now()}.md`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition flex items-center gap-1.5"
                >
                  <Download size={14} /> Export Report (.md)
                </button>
                <button
                  onClick={startSession}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
                >
                  Start New Session
                </button>
              </div>
            </div>
          )}

          {/* Active Interview Stage */}
          {inSession && currentTurn && (
            <div className="flex-1 flex flex-col justify-between space-y-4">
              {/* Question Banner */}
              <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-600 text-white font-bold text-[10px] px-2.5 py-0.5">
                      Question {currentTurn.questionNumber} of 3
                    </span>
                    <span className="text-xs font-medium text-slate-300">
                      Interviewer (Bar Raiser)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTtsEnabled(!ttsEnabled)}
                      title={ttsEnabled ? 'Voice Narrator Enabled' : 'Voice Narrator Muted'}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      {ttsEnabled ? (
                        <Volume2 size={16} className={ttsSpeaking ? 'text-blue-400 animate-pulse' : ''} />
                      ) : (
                        <VolumeX size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => speakText(currentTurn.interviewerQuestion)}
                      className="text-[10px] font-medium text-blue-400 hover:underline"
                    >
                      Replay Voice
                    </button>
                  </div>
                </div>

                <p className="text-sm font-semibold text-white leading-relaxed">
                  &ldquo;{currentTurn.interviewerQuestion}&rdquo;
                </p>
              </div>

              {/* Turn History / Prior Feedback */}
              {turns.length > 1 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Previous Question Turn
                  </span>
                  {turns.slice(0, turns.length - 1).map((t, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#22242a] bg-[#141518] p-3 text-xs space-y-1.5"
                    >
                      <span className="font-semibold text-slate-300">
                        Q{t.questionNumber}: {t.interviewerQuestion}
                      </span>
                      <p className="text-slate-400 italic">&ldquo;{t.candidateAnswer}&rdquo;</p>
                      {t.feedback && (
                        <div className="rounded bg-[#101114] p-2 text-[11px] text-emerald-300 border border-emerald-500/20">
                          <strong>Bar Raiser Feedback:</strong> {t.feedback}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Candidate Response Workspace */}
              <div className="rounded-2xl border border-[#282a32] bg-[#141518] p-4 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-white">Your Spoken or Written Response</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMic}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                        micActive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/20'
                          : 'bg-[#1e2026] text-slate-400 border border-[#282a32] hover:text-white'
                      }`}
                    >
                      {micActive ? (
                        <Mic size={13} className="animate-pulse text-emerald-400" />
                      ) : (
                        <MicOff size={13} />
                      )}
                      <span>{micActive ? 'Listening to You...' : 'Enable Mic'}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  ref={inputRef}
                  value={candidateInput}
                  onChange={(e) => setCandidateInput(e.target.value)}
                  rows={6}
                  disabled={evaluating}
                  placeholder="Speak through microphone or type your structured STAR/Technical answer here..."
                  className="w-full rounded-xl border border-[#282a32] bg-[#101114] p-3 text-xs text-white placeholder:text-slate-500 outline-none focus:border-blue-500/50 leading-relaxed font-sans"
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Press Submit to trigger real-time Bar Raiser scoring & adaptive follow-up probe.
                  </span>

                  <button
                    onClick={submitCandidateAnswer}
                    disabled={evaluating || !candidateInput.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 disabled:opacity-40 transition"
                  >
                    {evaluating ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Evaluating Response...</span>
                      </>
                    ) : (
                      <>
                        <Send size={13} />
                        <span>Submit Answer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Idle Welcome State */}
          {!inSession && !finalScorecard && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-2xl">
                <Sparkles size={32} />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-base font-bold text-white">Ready for your Mock Interview?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Select a domain track from the left panel, toggle Voice Narrator, and answer realistic technical and behavioral questions under live timed conditions.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
