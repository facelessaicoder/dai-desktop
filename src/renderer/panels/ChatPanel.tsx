import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronDown, ChevronRight, Wrench, Lock, Globe, X, Zap } from 'lucide-react';
import { color, font, glass, space, radius, spring, blur } from '@dai-desktop/ui';
import type { ChatMessage, BackendType, SkillMeta } from '../global.d';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolUseData {
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultData {
  name: string;
  result?: unknown;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolUses?: ToolUseData[];
  toolResults?: ToolResultData[];
  isStreaming?: boolean;
  isError?: boolean;
  backend?: BackendType;
}

interface QuickAction {
  label: string;
  prompt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Explain this codebase',  prompt: 'Give me a high-level overview of this codebase — what it does, how it\'s structured, and the key files I should know about.' },
  { label: 'Create a task',          prompt: 'Help me create a new task in the SDD planner.' },
  { label: 'Search for ...',         prompt: 'Search the workspace for ' },
];

let msgCounter = 0;
function nextId() { return `msg-${++msgCounter}`; }

// ── Backend / privacy config ──────────────────────────────────────────────────

function deriveBackend(
  ollamaAvailable: boolean,
  hasAnthropicKey: boolean,
  hasModelPath: boolean,
): BackendType {
  if (ollamaAvailable)  return 'ollama';
  if (hasAnthropicKey)  return 'claude';
  if (hasModelPath)     return 'local';
  return 'none';
}

interface PrivacyCfg {
  label: string;
  sublabel: string;
  fg: string;
  bg: string;
  border: string;
  isLocal: boolean;
}

const PRIVACY_CFG: Record<BackendType, PrivacyCfg> = {
  local: {
    label:    'Local & Private',
    sublabel: 'runs entirely on your device · nothing leaves',
    fg:       '#22c55e',
    bg:       'rgba(34, 197, 94, 0.07)',
    border:   'rgba(34, 197, 94, 0.22)',
    isLocal:  true,
  },
  ollama: {
    label:    'Local & Private',
    sublabel: 'Ollama · running on your device',
    fg:       '#4ade80',
    bg:       'rgba(74, 222, 128, 0.07)',
    border:   'rgba(74, 222, 128, 0.22)',
    isLocal:  true,
  },
  claude: {
    label:    'Cloud · Claude API',
    sublabel: 'encrypted · Anthropic servers',
    fg:       '#60a5fa',
    bg:       'rgba(96, 165, 250, 0.07)',
    border:   'rgba(96, 165, 250, 0.22)',
    isLocal:  false,
  },
  none: {
    label:    'No Backend',
    sublabel: 'add a model or API key in Settings',
    fg:       color.danger,
    bg:       color.dangerDim,
    border:   'rgba(229, 99, 74, 0.22)',
    isLocal:  false,
  },
};

const BACKEND_LABEL: Record<BackendType, string> = {
  local:  'local',
  ollama: 'ollama',
  claude: 'claude',
  none:   'none',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const [messages, setMessages]               = useState<Message[]>([]);
  const [input, setInput]                     = useState('');
  const [streaming, setStreaming]             = useState(false);
  const [ollamaAvail, setOllamaAvail]         = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasModelPath, setHasModelPath]       = useState(false);
  const [allSkills, setAllSkills]             = useState<SkillMeta[]>([]);
  const [activeSkill, setActiveSkill]         = useState<SkillMeta | null>(null);
  const [paletteIdx, setPaletteIdx]           = useState(0);

  const listRef          = useRef<HTMLDivElement>(null);
  const textareaRef      = useRef<HTMLTextAreaElement>(null);
  const cleanupRef       = useRef<(() => void)[]>([]);
  const currentMsgIdRef  = useRef<string | null>(null);

  const backend = deriveBackend(ollamaAvail, hasAnthropicKey, hasModelPath);

  // Palette visibility: show when input starts with '/'
  const showPalette = input.startsWith('/');
  const paletteQuery = showPalette ? input.slice(1).toLowerCase() : '';
  const filteredSkills = showPalette
    ? allSkills.filter((s) =>
        !paletteQuery ||
        s.name.toLowerCase().includes(paletteQuery) ||
        s.description.toLowerCase().includes(paletteQuery),
      )
    : [];

  // Reset selection when filter changes
  useEffect(() => { setPaletteIdx(0); }, [paletteQuery]);

  // Load Ollama status + initial settings
  useEffect(() => {
    const removeOllama = window.dai.model.onOllamaStatus(({ available }) => {
      setOllamaAvail(available);
    });
    void window.dai.settings.get('anthropic_api_key').then((v) => setHasAnthropicKey(!!v));
    void window.dai.settings.get('modelPath').then((v) => setHasModelPath(!!v));
    return removeOllama;
  }, []);

  // Load available skills
  useEffect(() => {
    void window.dai.skills.list().then((r) => {
      if (r.ok && r.data) setAllSkills(r.data);
    });
  }, []);

  // Stamp the backend on the current assistant message when agent reports it
  useEffect(() => {
    const remove = window.dai.chat.onBackendChange((b: BackendType) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === currentMsgIdRef.current ? { ...m, backend: b } : m,
        ),
      );
    });
    return remove;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // Cleanup IPC listeners on unmount
  useEffect(() => {
    return () => { cleanupRef.current.forEach((fn) => fn()); };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const appendToken = useCallback((token: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === currentMsgIdRef.current
          ? { ...m, content: m.content + token }
          : m,
      ),
    );
  }, []);

  const appendToolUse = useCallback((data: unknown) => {
    const tu = data as ToolUseData;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === currentMsgIdRef.current
          ? { ...m, toolUses: [...(m.toolUses ?? []), tu] }
          : m,
      ),
    );
  }, []);

  const appendToolResult = useCallback((data: unknown) => {
    const tr = data as ToolResultData;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === currentMsgIdRef.current
          ? { ...m, toolResults: [...(m.toolResults ?? []), tr] }
          : m,
      ),
    );
  }, []);

  const finishStreaming = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === currentMsgIdRef.current ? { ...m, isStreaming: false } : m,
      ),
    );
    setStreaming(false);
    currentMsgIdRef.current = null;
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setInput('');

    const userMsg: Message = { id: nextId(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = nextId();
    currentMsgIdRef.current = assistantId;
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      backend,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    const removeToken      = window.dai.chat.onToken(appendToken);
    const removeToolUse    = window.dai.chat.onToolUse(appendToolUse);
    const removeToolResult = window.dai.chat.onToolResult(appendToolResult);
    const removeDone       = window.dai.chat.onDone(finishStreaming);
    cleanupRef.current = [removeToken, removeToolUse, removeToolResult, removeDone];

    // Build history; prepend active skill as system context if set
    const history: ChatMessage[] = [];
    if (activeSkill) {
      history.push({
        role:    'system',
        content: `You are operating with the "${activeSkill.name}" skill active. ${activeSkill.description}`,
      });
    }
    history.push(...messages.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })));

    const result = await window.dai.chat.send(trimmed, history);

    if (result?.error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: result.message ?? 'An error occurred.', isStreaming: false, isError: true }
            : m,
        ),
      );
      setStreaming(false);
      currentMsgIdRef.current = null;
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
    }
  }, [streaming, messages, appendToken, appendToolUse, appendToolResult, finishStreaming, backend, activeSkill]);

  const selectSkill = useCallback((skill: SkillMeta) => {
    setInput('');
    setActiveSkill(skill);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPalette && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIdx((i) => Math.min(i + 1, filteredSkills.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setPaletteIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter')     { e.preventDefault(); selectSkill(filteredSkills[paletteIdx] ?? filteredSkills[0]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setInput(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    setInput(action.prompt);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div style={panelShell}>
      {/* Header */}
      <div style={header}>
        <span style={{ fontSize: font.small, color: color.textDim, fontWeight: font.medium, letterSpacing: '0.06em' }}>
          ARI CHAT
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
          <CompactBackendBadge backend={backend} />
          {streaming && <ThinkingIndicator />}
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} style={messageList}>
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <WelcomeState backend={backend} onQuickAction={handleQuickAction} />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </AnimatePresence>
        <div style={{ height: space[4] }} />
      </div>

      {/* Input area */}
      <div style={inputArea}>
        {/* Skills palette — floats above input when active */}
        <AnimatePresence>
          {showPalette && filteredSkills.length > 0 && (
            <SkillPalette
              skills={filteredSkills}
              selectedIdx={paletteIdx}
              onSelect={selectSkill}
            />
          )}
        </AnimatePresence>

        {/* Active skill chip */}
        <AnimatePresence>
          {activeSkill && (
            <ActiveSkillChip
              skill={activeSkill}
              onDismiss={() => setActiveSkill(null)}
            />
          )}
        </AnimatePresence>

        {/* Input wrapper */}
        <div style={inputWrapper}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            placeholder={
              streaming
                ? 'Ari is thinking...'
                : showPalette
                ? 'Type skill name to filter · ↑↓ navigate · Enter select · Esc close'
                : 'Ask anything · type / for skills'
            }
            rows={1}
            style={{
              ...textareaStyle,
              color: streaming ? color.textMuted : color.textPrimary,
            }}
          />
          <motion.button
            onClick={() => void sendMessage(input)}
            disabled={streaming || !input.trim() || showPalette}
            style={{
              ...sendBtn,
              opacity: streaming || !input.trim() || showPalette ? 0.35 : 1,
              cursor: streaming || !input.trim() || showPalette ? 'not-allowed' : 'pointer',
            }}
            whileHover={streaming || !input.trim() ? {} : { scale: 1.08 }}
            whileTap={streaming || !input.trim() ? {} : { scale: 0.92 }}
            transition={spring.snappy}
          >
            <Send size={16} strokeWidth={2} />
          </motion.button>
        </div>

        {/* Privacy / connection status bar — always visible */}
        <PrivacyBar backend={backend} streaming={streaming} />
      </div>
    </div>
  );
}

// ── Privacy status bar ────────────────────────────────────────────────────────
// The most important new UX element: makes it unmistakably clear whether
// the current session is fully local+private or sending data over the internet.

function PrivacyBar({ backend, streaming }: { backend: BackendType; streaming: boolean }) {
  const cfg = PRIVACY_CFG[backend];

  return (
    <motion.div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            space[2],
        padding:        `${space[2]} ${space[3]}`,
        background:     cfg.bg,
        border:         `1px solid ${cfg.border}`,
        borderRadius:   radius.md,
        marginTop:      space[2],
        flexShrink:     0,
        transition:     'background 300ms ease, border-color 300ms ease',
      }}
      layout
    >
      {/* Animated status dot */}
      <motion.div
        style={{
          width:        7,
          height:       7,
          borderRadius: '50%',
          background:   cfg.fg,
          flexShrink:   0,
        }}
        animate={streaming
          ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }
          : { boxShadow: [`0 0 4px ${cfg.fg}80`, `0 0 10px ${cfg.fg}80`, `0 0 4px ${cfg.fg}80`] }
        }
        transition={{ duration: streaming ? 0.7 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Lock or globe icon */}
      {cfg.isLocal
        ? <Lock size={12} strokeWidth={2.5} style={{ color: cfg.fg, flexShrink: 0 }} />
        : <Globe size={12} strokeWidth={2.5} style={{ color: cfg.fg, flexShrink: 0 }} />
      }

      {/* Primary label */}
      <span style={{ fontSize: font.small, fontWeight: font.medium, color: cfg.fg, letterSpacing: '0.02em' }}>
        {cfg.label}
      </span>

      {/* Separator + detail */}
      <span style={{ fontSize: font.micro, color: color.textMuted }}>·</span>
      <span style={{ fontSize: font.micro, color: color.textMuted }}>
        {cfg.sublabel}
      </span>
    </motion.div>
  );
}

// ── Compact header badge ──────────────────────────────────────────────────────

function CompactBackendBadge({ backend }: { backend: BackendType }) {
  const cfg = PRIVACY_CFG[backend];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
      <motion.div
        style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.fg, flexShrink: 0 }}
        animate={{ boxShadow: [`0 0 4px ${cfg.fg}80`, `0 0 10px ${cfg.fg}80`, `0 0 4px ${cfg.fg}80`] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span style={{ fontSize: font.micro, color: color.textMuted, letterSpacing: '0.04em' }}>
        {BACKEND_LABEL[backend]}
      </span>
    </div>
  );
}

// ── Skill palette ─────────────────────────────────────────────────────────────

function SkillPalette({
  skills,
  selectedIdx,
  onSelect,
}: {
  skills:      SkillMeta[];
  selectedIdx: number;
  onSelect:    (s: SkillMeta) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  return (
    <motion.div
      style={palette}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={spring.snappy}
    >
      <div style={paletteHeader}>
        <Zap size={11} strokeWidth={2} style={{ color: color.accent }} />
        <span style={{ fontSize: font.micro, color: color.textDim, letterSpacing: '0.06em' }}>SKILLS</span>
        <span style={{ fontSize: font.micro, color: color.textMuted, marginLeft: 'auto' }}>
          {skills.length} available
        </span>
      </div>
      <div ref={listRef} style={paletteList}>
        {skills.map((skill, i) => (
          <SkillPaletteItem
            key={skill.id}
            skill={skill}
            isSelected={i === selectedIdx}
            onSelect={onSelect}
          />
        ))}
      </div>
    </motion.div>
  );
}

function SkillPaletteItem({
  skill,
  isSelected,
  onSelect,
}: {
  skill:      SkillMeta;
  isSelected: boolean;
  onSelect:   (s: SkillMeta) => void;
}) {
  return (
    <motion.button
      onClick={() => onSelect(skill)}
      style={{
        ...paletteItem,
        background:   isSelected ? color.accentGlow : 'transparent',
        borderColor:  isSelected ? color.accentDim  : 'transparent',
        borderLeft:   isSelected ? `2px solid ${color.accent}` : '2px solid transparent',
      }}
      whileHover={{ background: color.accentGlow }}
      transition={{ duration: 0.1 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: font.small, color: isSelected ? color.accent : color.textPrimary, fontWeight: font.medium, fontFamily: font.mono }}>
          /{skill.name}
        </span>
        {skill.argumentHint && (
          <span style={{ fontSize: font.micro, color: color.textMuted, fontFamily: font.mono }}>
            {skill.argumentHint}
          </span>
        )}
        <span style={{ fontSize: font.small, color: color.textDim, marginLeft: space[2], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {skill.description}
        </span>
      </div>
      <span style={{
        fontSize:     font.micro,
        color:        skill.source === 'bundled' ? color.accent : color.modeVibe,
        background:   skill.source === 'bundled' ? color.accentGlow : color.modeVibeDim,
        border:       `1px solid ${skill.source === 'bundled' ? color.accentDim : color.modeVibeDim}`,
        padding:      `1px ${space[2]}`,
        borderRadius: radius.full,
        flexShrink:   0,
      }}>
        {skill.source}
      </span>
    </motion.button>
  );
}

// ── Active skill chip ─────────────────────────────────────────────────────────

function ActiveSkillChip({ skill, onDismiss }: { skill: SkillMeta; onDismiss: () => void }) {
  return (
    <motion.div
      style={skillChip}
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={spring.snappy}
    >
      <Zap size={11} strokeWidth={2} style={{ color: color.accent }} />
      <span style={{ fontSize: font.micro, color: color.accent, fontFamily: font.mono }}>/{skill.name}</span>
      <span style={{ fontSize: font.micro, color: color.textDim }}>skill active</span>
      <button onClick={onDismiss} style={chipDismiss}>
        <X size={10} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ── Welcome state ──────────────────────────────────────────────────────────────

function WelcomeState({
  backend,
  onQuickAction,
}: {
  backend:       BackendType;
  onQuickAction: (a: QuickAction) => void;
}) {
  const cfg = PRIVACY_CFG[backend];
  return (
    <motion.div
      key="welcome"
      style={welcomeShell}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={spring.panel}
    >
      <motion.div
        style={welcomeDot}
        animate={{
          boxShadow: [`0 0 8px ${color.accent}`, `0 0 20px ${color.accent}`, `0 0 8px ${color.accent}`],
          scale: [1, 1.08, 1],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <h1 style={welcomeHeading}>What are you building?</h1>
      <p style={welcomeSub}>
        {cfg.isLocal
          ? 'Running locally · your code never leaves this device.'
          : 'Powered by Claude API · encrypted in transit.'}
      </p>
      <div style={quickActionsRow}>
        {QUICK_ACTIONS.map((action) => (
          <motion.button
            key={action.label}
            onClick={() => onQuickAction(action)}
            style={quickChip}
            whileHover={{ background: color.accentGlow, borderColor: color.accent, color: color.accent }}
            whileTap={{ scale: 0.96 }}
            transition={spring.snappy}
          >
            {action.label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.panel}
      style={{ ...bubbleRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}
    >
      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: space[1] }}>
        {/* Tool use chips */}
        {!isUser && message.toolUses && message.toolUses.length > 0 && (
          <div style={toolChipsRow}>
            {message.toolUses.map((tu, i) => (
              <ToolCallChip key={i} toolUse={tu} result={message.toolResults?.[i]} />
            ))}
          </div>
        )}

        {/* Main content bubble */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              ...(isUser ? userBubble : assistantBubble),
              ...(message.isError ? { borderColor: color.danger, color: color.danger } : {}),
            }}
          >
            <MessageContent content={message.content} isStreaming={message.isStreaming} />
          </div>

          {/* Backend source tag — assistant messages only */}
          {!isUser && message.backend && message.backend !== 'none' && (
            <BackendTag backend={message.backend} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Backend source tag (per-message) ─────────────────────────────────────────

function BackendTag({ backend }: { backend: BackendType }) {
  const cfg = PRIVACY_CFG[backend];
  return (
    <div style={{
      position:     'absolute',
      bottom:       space[1],
      right:        space[2],
      display:      'flex',
      alignItems:   'center',
      gap:          '3px',
      fontSize:     '10px',
      color:        cfg.fg,
      opacity:      0.55,
      userSelect:   'none',
      pointerEvents: 'none',
    }}>
      {cfg.isLocal
        ? <Lock size={8} strokeWidth={2.5} />
        : <Globe size={8} strokeWidth={2.5} />
      }
      {BACKEND_LABEL[backend]}
    </div>
  );
}

// ── Message content renderer ───────────────────────────────────────────────────

function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const parts = splitContent(content);

  return (
    <div style={{ lineHeight: '1.65' }}>
      {parts.map((part, i) =>
        part.type === 'code' ? (
          <pre key={i} style={codeBlock}>
            {part.lang && <span style={codeLang}>{part.lang}</span>}
            <code>{part.text}</code>
          </pre>
        ) : (
          <span key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {part.text}
          </span>
        ),
      )}
      {isStreaming && <StreamCursor />}
    </div>
  );
}

function StreamCursor() {
  return (
    <motion.span
      style={cursorStyle}
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.9, repeat: Infinity }}
    />
  );
}

// ── Tool call chip ─────────────────────────────────────────────────────────────

function ToolCallChip({ toolUse, result }: { toolUse: ToolUseData; result?: ToolResultData }) {
  const [open, setOpen] = useState(false);
  const hasError = !!result?.error;
  const args = Object.entries(toolUse.input ?? {});

  return (
    <motion.div
      style={{ ...toolChip, ...(hasError ? { borderColor: color.dangerDim, color: color.danger } : {}) }}
      layout
    >
      <button onClick={() => setOpen((v) => !v)} style={toolChipBtn}>
        <Wrench size={11} strokeWidth={2} />
        <span style={{ fontSize: font.micro, fontFamily: font.mono }}>
          {toolUse.name}
          {args.length > 0 && (
            <span style={{ color: color.textDim }}>
              ({Object.values(toolUse.input).join(', ').slice(0, 40)})
            </span>
          )}
        </span>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={toolDetail}
          >
            {hasError
              ? `Error: ${result?.error}`
              : JSON.stringify(result?.result ?? toolUse.input, null, 2)}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Thinking indicator ─────────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <motion.div style={thinkingDots} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={dot}
          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </motion.div>
  );
}

// ── Content splitting ─────────────────────────────────────────────────────────

interface ContentPart { type: 'text' | 'code'; text: string; lang?: string; }

function splitContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1] || undefined, text: match[2] });
    lastIndex = fence.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', text: content }];
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelShell: React.CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  height:         '100%',
  background:     color.base,
  overflow:       'hidden',
};

const header: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'space-between',
  padding:        `${space[3]} ${space[5]}`,
  borderBottom:   `1px solid ${color.border}`,
  flexShrink:     0,
};

const messageList: React.CSSProperties = {
  flex:       1,
  overflowY:  'auto',
  overflowX:  'hidden',
  padding:    `${space[4]} ${space[5]}`,
  display:    'flex',
  flexDirection: 'column',
  gap:        space[3],
};

const bubbleRow: React.CSSProperties = {
  display: 'flex',
  width:   '100%',
};

const userBubble: React.CSSProperties = {
  background:   color.accent,
  color:        color.base,
  padding:      `${space[3]} ${space[4]}`,
  borderRadius: `${radius.lg} ${radius.lg} ${radius.sm} ${radius.lg}`,
  fontSize:     font.body,
  fontWeight:   font.medium,
  boxShadow:    `0 0 16px ${color.accentDim}`,
};

const assistantBubble: React.CSSProperties = {
  ...glass,
  padding:      `${space[3]} ${space[4]} ${space[5]} ${space[4]}`,
  borderRadius: `${radius.lg} ${radius.lg} ${radius.lg} ${radius.sm}`,
  fontSize:     font.body,
  color:        color.textPrimary,
  lineHeight:   '1.65',
};

const inputArea: React.CSSProperties = {
  flexShrink:     0,
  padding:        `${space[3]} ${space[4]} ${space[4]}`,
  borderTop:      `1px solid ${color.border}`,
  display:        'flex',
  flexDirection:  'column',
  gap:            space[2],
  position:       'relative',
};

const inputWrapper: React.CSSProperties = {
  display:        'flex',
  alignItems:     'flex-end',
  gap:            space[2],
  background:     color.surface,
  border:         `1px solid ${color.border}`,
  borderRadius:   radius.lg,
  padding:        `${space[2]} ${space[3]}`,
  backdropFilter: blur.glass,
  transition:     'border-color 150ms ease',
};

const textareaStyle: React.CSSProperties = {
  flex:        1,
  resize:      'none',
  background:  'transparent',
  border:      'none',
  outline:     'none',
  fontFamily:  font.family,
  fontSize:    font.body,
  lineHeight:  '1.5',
  maxHeight:   160,
  overflowY:   'auto',
};

const sendBtn: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  width:          32,
  height:         32,
  borderRadius:   radius.md,
  border:         'none',
  background:     color.accent,
  color:          color.base,
  flexShrink:     0,
  transition:     'opacity 150ms ease',
};

const welcomeShell: React.CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  flex:           1,
  gap:            space[4],
  paddingBottom:  space[10],
  minHeight:      '60vh',
};

const welcomeDot: React.CSSProperties = {
  width:        12,
  height:       12,
  borderRadius: '50%',
  background:   color.accent,
};

const welcomeHeading: React.CSSProperties = {
  fontSize:   font.display,
  color:      color.textPrimary,
  fontWeight: font.light,
  textAlign:  'center',
};

const welcomeSub: React.CSSProperties = {
  fontSize:  font.small,
  color:     color.textDim,
  textAlign: 'center',
};

const quickActionsRow: React.CSSProperties = {
  display:        'flex',
  gap:            space[2],
  flexWrap:       'wrap',
  justifyContent: 'center',
  marginTop:      space[2],
};

const quickChip: React.CSSProperties = {
  padding:      `${space[2]} ${space[4]}`,
  background:   color.surface,
  border:       `1px solid ${color.border}`,
  borderRadius: radius.full,
  color:        color.textDim,
  fontSize:     font.small,
  cursor:       'pointer',
  fontFamily:   font.family,
  transition:   'all 150ms ease',
};

const codeBlock: React.CSSProperties = {
  position:    'relative',
  background:  'rgba(0,0,0,0.35)',
  border:      `1px solid ${color.border}`,
  borderRadius: radius.md,
  padding:     space[4],
  fontFamily:  font.mono,
  fontSize:    font.small,
  lineHeight:  '1.6',
  overflowX:   'auto',
  margin:      `${space[2]} 0`,
  whiteSpace:  'pre',
};

const codeLang: React.CSSProperties = {
  position:      'absolute',
  top:           space[1],
  right:         space[2],
  fontSize:      font.micro,
  color:         color.textMuted,
  fontFamily:    font.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const cursorStyle: React.CSSProperties = {
  display:       'inline-block',
  width:         2,
  height:        '1em',
  background:    color.accent,
  marginLeft:    2,
  verticalAlign: 'text-bottom',
  borderRadius:  1,
};

const toolChipsRow: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           space[1],
  marginBottom:  space[1],
};

const toolChip: React.CSSProperties = {
  background:   color.accentGlow,
  border:       `1px solid ${color.accentDim}`,
  borderRadius: radius.md,
  overflow:     'hidden',
  fontSize:     font.micro,
};

const toolChipBtn: React.CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        space[1],
  padding:    `${space[1]} ${space[2]}`,
  background: 'transparent',
  border:     'none',
  cursor:     'pointer',
  color:      color.accent,
  fontFamily: font.family,
  width:      '100%',
  textAlign:  'left',
};

const toolDetail: React.CSSProperties = {
  fontFamily:   font.mono,
  fontSize:     font.micro,
  padding:      space[2],
  borderTop:    `1px solid ${color.accentDim}`,
  color:        color.textDim,
  overflow:     'auto',
  maxHeight:    200,
  whiteSpace:   'pre-wrap',
  wordBreak:    'break-all',
};

const thinkingDots: React.CSSProperties = {
  display:    'flex',
  gap:        space[1],
  alignItems: 'center',
};

const dot: React.CSSProperties = {
  width:        5,
  height:       5,
  borderRadius: '50%',
  background:   color.accent,
};

// Skill palette styles
const palette: React.CSSProperties = {
  position:      'absolute',
  bottom:        'calc(100% + 8px)',
  left:          space[4],
  right:         space[4],
  background:    color.baseElevated,
  border:        `1px solid ${color.border}`,
  borderRadius:  radius.lg,
  boxShadow:     `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${color.accentDim}`,
  overflow:      'hidden',
  zIndex:        100,
  maxHeight:     320,
  display:       'flex',
  flexDirection: 'column',
};

const paletteHeader: React.CSSProperties = {
  display:     'flex',
  alignItems:  'center',
  gap:         space[2],
  padding:     `${space[2]} ${space[3]}`,
  borderBottom:`1px solid ${color.border}`,
  flexShrink:  0,
};

const paletteList: React.CSSProperties = {
  overflowY:     'auto',
  flex:          1,
};

const paletteItem: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  gap:            space[3],
  padding:        `${space[2]} ${space[3]}`,
  width:          '100%',
  border:         'none',
  cursor:         'pointer',
  fontFamily:     font.family,
  textAlign:      'left',
  transition:     'background 100ms ease',
  borderLeft:     '2px solid transparent',
};

const skillChip: React.CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  gap:          space[2],
  padding:      `${space[1]} ${space[3]}`,
  background:   color.accentGlow,
  border:       `1px solid ${color.accentDim}`,
  borderRadius: radius.full,
  flexShrink:   0,
  alignSelf:    'flex-start',
};

const chipDismiss: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  background:     'transparent',
  border:         'none',
  cursor:         'pointer',
  color:          color.textDim,
  padding:        0,
  marginLeft:     space[1],
};
