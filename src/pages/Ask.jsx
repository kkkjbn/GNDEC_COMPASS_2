import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Columns2,
  Copy,
  ExternalLink,
  GraduationCap,
  Info,
  MapPin,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { answerQuestion, ASSISTANT_STARTERS, assistantSuggestions } from '../lib/assistant.js';
import { findSection } from '../lib/timetable.js';
import { istDateTimeLabel } from '../lib/utils.js';
import { Avatar, Badge, CopyButton, InlineNotice, Modal, RichText } from '../components/ui.jsx';

const ACTION_ICONS = {
  arrow: ArrowRight,
  timetable: CalendarDays,
  map: MapPin,
  student: UserRound,
  faculty: GraduationCap,
  study: BookOpen,
  notices: CalendarDays,
  calendar: CalendarDays,
  camera: Camera,
  external: ExternalLink,
  settings: Settings,
  about: Info,
  columns: Columns2,
  book: BookOpen,
  students: UserRound,
};

const CAPABILITIES = [
  { icon: CalendarDays, title: 'Timetable', text: 'Today, any weekday, full week, free periods, teachers and rooms.' },
  { icon: UserRound, title: 'People', text: 'Students by CRN or name, mentors, section counts and faculty profiles.' },
  { icon: MapPin, title: 'Campus', text: 'Places, block locations, walking estimates and photo landmarks.' },
  { icon: BookOpen, title: 'Academics', text: 'Syllabus, previous papers, question banks and exam preparation.' },
];

const LIMITS = [
  'No generative guessing — if the data is missing, Compass says so.',
  'No live exam date sheet, fee status, attendance or results.',
  'Room-to-door routes and some block links are still approximate.',
];

function ActionButton({ action, onNavigate }) {
  const Icon = ACTION_ICONS[action.icon] || ArrowRight;
  if (action.url || String(action.path || '').startsWith('http')) {
    return (
      <a className="chat-action" href={action.url || action.path} target="_blank" rel="noreferrer">
        <Icon size={14} />
        {action.label}
        <ExternalLink size={11} />
      </a>
    );
  }
  return (
    <Link className="chat-action" to={action.path || '/today'} onClick={onNavigate}>
      <Icon size={14} />
      {action.label}
      <ChevronRight size={12} />
    </Link>
  );
}

function Confidence({ value }) {
  const meta = {
    high: { label: 'Grounded answer', tone: 'green' },
    medium: { label: 'Partially verified', tone: 'gold' },
    low: { label: 'Low confidence', tone: 'neutral' },
  }[value] || { label: 'Answer', tone: 'neutral' };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function Message({ message, onAsk, onNavigate }) {
  if (message.role === 'user') {
    return (
      <div className="chat-message user">
        <div className="chat-user-stack">
          <div className="chat-bubble user-bubble">
            <p>{message.text}</p>
          </div>
          {message.ts ? (
            <time className="chat-time" dateTime={new Date(message.ts).toISOString()}>
              {istDateTimeLabel(message.ts)}
            </time>
          ) : null}
        </div>
      </div>
    );
  }
  const answer = message.answer || { text: message.text, confidence: 'low' };
  return (
    <div className="chat-message assistant">
      <span className="chat-avatar assistant-avatar">
        <Sparkles size={16} />
      </span>
      <div className="assistant-message-body">
        <div className="assistant-message-top">
          <b>Ask Compass</b>
          <Confidence value={answer.confidence} />
          <CopyButton value={message.text || answer.text} label="" className="chat-copy" />
        </div>
        <RichText text={message.text || answer.text} />
        {message.ts ? (
          <time className="chat-time" dateTime={new Date(message.ts).toISOString()}>
            {istDateTimeLabel(message.ts)}
          </time>
        ) : null}
        {answer.matches?.length > 0 && (
          <div className="chat-matches">
            {answer.matches.map((match) => (
              <Link key={match.path} to={match.path} className="chat-match" onClick={onNavigate}>
                <span>
                  <b>{match.title}</b>
                  <small>{match.subtitle}</small>
                </span>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        )}
        {answer.actions?.length > 0 && (
          <div className="chat-actions">
            {answer.actions.map((action, index) => (
              <ActionButton key={`${action.label}-${index}`} action={action} onNavigate={onNavigate} />
            ))}
          </div>
        )}
        {answer.chips?.length > 0 && (
          <div className="chat-chips">
            {answer.chips.map((chip) => (
              <button type="button" key={chip} onClick={() => onAsk(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Ask() {
  const { data, profile, online, toast, assistantMemory, setAssistantMemory, chatHistory, setChatHistory } = useApp();
  const { searchParams, navigate } = useRouter();
  const [messages, setMessages] = useState(() => {
    if (Array.isArray(chatHistory) && chatHistory.length) return chatHistory;
    return [
      {
        id: 'welcome',
        role: 'assistant',
        ts: Date.now(),
        text: "Sat Sri Akal! I'm **Ask Compass** — a deterministic campus assistant.\n\nI work from the timetable, student roster, faculty directory, campus map, notices and study index cached on this device. I can find a class, room, person, paper, holiday or walking route — and I'll tell you when something is not verified.\n\nWhat do you need?",
        answer: {
          confidence: 'high',
          actions: [{ label: 'Set my section', path: '/settings', icon: 'settings' }],
          chips: ['My next class', 'Show ECE B1 timetable', 'Where is the library?', 'Latest notices'],
        },
      },
    ];
  });
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const logRef = useRef(null);
  const textRef = useRef(null);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const lastQueryRef = useRef('');
  const dataRef = useRef(data);
  const profileRef = useRef(profile);
  const memoryRef = useRef(assistantMemory);

  dataRef.current = data;
  profileRef.current = profile;
  memoryRef.current = assistantMemory;

  const section = findSection(data?.timetable, profile.sectionId);
  const starters = useMemo(() => {
    const values = [
      ...ASSISTANT_STARTERS.slice(0, 8),
      ...assistantSuggestions(profile, data),
    ];
    return [...new Set(values)].slice(0, 10);
  }, [profile, data]);

  useEffect(() => {
    setChatHistory(messages.slice(-60));
  }, [messages, setChatHistory]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* already stopped */
      }
    },
    [],
  );

  const ask = (raw) => {
    const text = String(raw || '').trim();
    if (!text || thinking) return;
    const userMessage = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setThinking(true);
    timerRef.current = setTimeout(() => {
      let answer;
      try {
        answer = answerQuestion(text, {
          data: dataRef.current,
          profile: profileRef.current,
          memory: memoryRef.current,
          now: new Date(),
        });
      } catch (error) {
        answer = {
          intent: 'error',
          confidence: 'low',
          text: 'Something went wrong while reading the campus data. Try rephrasing, or open the page directly from the sidebar.',
        };
      }
      setMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: 'assistant', text: answer.text, answer, ts: Date.now() },
      ]);
      if (answer.memory) setAssistantMemory(answer.memory);
      setThinking(false);
    }, 240);
  };

  useEffect(() => {
    const q = searchParams.get('q');
    if (!q) {
      lastQueryRef.current = '';
      return;
    }
    if (data && q !== lastQueryRef.current) {
      lastQueryRef.current = q;
      ask(q);
      navigate('/ask', { replace: true, keepScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, data]);

  const startVoice = () => {
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      toast('Voice input is not supported in this browser. Type your question instead.', 'error');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      setDraft(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      toast('Voice input stopped. Check microphone permission.', 'error');
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      toast('Voice input could not start.', 'error');
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setChatHistory([]);
    setAssistantMemory({});
    setConfirmClear(false);
    toast('Conversation and assistant memory cleared.', 'success');
  };

  const onDraftChange = (event) => {
    setDraft(event.target.value);
    const node = textRef.current;
    if (node) {
      node.style.height = 'auto';
      node.style.height = `${Math.min(150, node.scrollHeight)}px`;
    }
  };

  const submit = (event) => {
    event?.preventDefault();
    ask(draft);
    setTimeout(() => {
      if (textRef.current) textRef.current.style.height = 'auto';
    }, 0);
  };

  return (
    <div className="ask-page">
      <div className="ask-head">
        <div>
          <span className="eyebrow">ON-DEVICE CAMPUS ASSISTANT</span>
          <h1>
            Ask Compass.<br />
            <em>Grounded, not guessing.</em>
          </h1>
          <p>Fuzzy names, Hinglish, broken spellings and straightforward questions are all fine. Answers come from cached college data.</p>
        </div>
        <div className="ask-head-actions">
          <Badge tone={online ? 'green' : 'gold'}>
            {online ? 'Data cached locally' : 'Offline — data cached'}
          </Badge>
          <button type="button" className="btn ghost small" onClick={() => setConfirmClear(true)} disabled={!messages.length}>
            <Trash2 size={14} /> Clear chat
          </button>
        </div>
      </div>

      <div className="ask-layout">
        <section className="chat-shell">
          <div className="chat-banner">
            <span className="chat-banner-icon">
              <Sparkles size={19} />
            </span>
            <div>
              <b>Ask Compass</b>
              <small>Deterministic retrieval · Not a generative AI · No question leaves your device</small>
            </div>
            <span className="chat-banner-status">
              <span className={`status-dot ${online ? 'online' : 'offline'}`} />
              {online ? 'Ready' : 'Offline ready'}
            </span>
          </div>

          <div className="chat-log" ref={logRef} aria-live="polite">
            {!messages.length && (
              <div className="chat-empty">
                <span className="empty-icon">
                  <Sparkles size={24} />
                </span>
                <h2>Start with a real question.</h2>
                <p>“ECE B1 timetable tomorrow”, “Where is the admission cell?”, “AM-101 papers”, “How many students in CS?”</p>
              </div>
            )}
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                onAsk={ask}
                onNavigate={() => {}}
              />
            ))}
            {thinking && (
              <div className="chat-message assistant thinking">
                <span className="chat-avatar assistant-avatar">
                  <Sparkles size={16} />
                </span>
                <div className="thinking-bubble">
                  <span />
                  <span />
                  <span />
                  <small>Reading campus data</small>
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="chat-starters">
              <span>TRY ASKING</span>
              <div className="starter-grid">
                {starters.slice(0, 8).map((starter) => (
                  <button type="button" key={starter} onClick={() => ask(starter)}>
                    {starter}
                    <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="chat-composer" onSubmit={submit}>
            <div className="composer-box">
              <textarea
                ref={textRef}
                rows={1}
                value={draft}
                onChange={onDraftChange}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask about a class, room, person, paper, notice or route…"
                aria-label="Ask Compass a question"
                maxLength={500}
              />
              <div className="composer-actions">
                <button type="button" className={`icon-btn mic ${listening ? 'listening' : ''}`} onClick={startVoice} aria-label={listening ? 'Stop voice input' : 'Use voice input'}>
                  {listening ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
                <button type="submit" className="send-btn" disabled={!draft.trim() || thinking} aria-label="Send question">
                  <Send size={17} />
                </button>
              </div>
            </div>
            <div className="composer-meta">
              <span>Enter to send · Shift + Enter for a new line</span>
              <span>Works offline</span>
            </div>
          </form>
        </section>

        <aside className="ask-rail">
          <div className="ask-context">
            <span className="eyebrow">YOUR CONTEXT</span>
            <div className="ask-profile">
              <Avatar name={profile.name || 'Guest'} size={38} />
              <div>
                <b>{profile.name || 'No profile name'}</b>
                <small>{profile.crn ? `CRN ${profile.crn}` : 'Not signed in — no account needed'}</small>
              </div>
            </div>
            <div className="ask-profile-section">
              <span>
                <b>{section?.id || profile.sectionId || 'Section not set'}</b>
                <small>{section?.label || 'Set your section for personalised answers'}</small>
              </span>
              <Link to="/settings" className="icon-btn" aria-label="Edit profile">
                <Settings size={15} />
              </Link>
            </div>
            <p className="fine-print">Compass remembers the last section or teacher you asked about during this conversation, on this device only.</p>
          </div>

          <div className="ask-capabilities">
            <span className="eyebrow">GOOD AT</span>
            {CAPABILITIES.map((item) => (
              <div className="capability-row" key={item.title}>
                <span className="capability-icon">
                  <item.icon size={15} />
                </span>
                <span>
                  <b>{item.title}</b>
                  <small>{item.text}</small>
                </span>
              </div>
            ))}
          </div>

          <div className="ask-limits">
            <span className="eyebrow">HONEST LIMITS</span>
            <ul>
              {LIMITS.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </div>

          <div className="ask-sources">
            <span className="eyebrow">SOURCES</span>
            <a href="https://appsc.gndec.ac.in/time_tables" target="_blank" rel="noreferrer">
              Official timetables <ExternalLink size={12} />
            </a>
            <a href="https://gndec.ac.in/faculty/" target="_blank" rel="noreferrer">
              Faculty directory <ExternalLink size={12} />
            </a>
            <a href="https://erp.gndec.ac.in/notice" target="_blank" rel="noreferrer">
              ERP notices <ExternalLink size={12} />
            </a>
            <Link to="/about">How the assistant works</Link>
          </div>
        </aside>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear this conversation?"
        subtitle="Messages, action history and assistant memory will be removed from this browser."
        size="sm"
        footer={
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
            <button type="button" className="btn danger" onClick={clearConversation}>
              <Trash2 size={15} /> Clear conversation
            </button>
          </div>
        }
      >
        <InlineNotice tone="warn">This cannot be undone. Your profile and bookmarks are not affected.</InlineNotice>
      </Modal>
    </div>
  );
}
