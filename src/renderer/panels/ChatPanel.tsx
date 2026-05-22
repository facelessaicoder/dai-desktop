import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { color, font, glass, space, radius, spring, blur } from '@dai-desktop/ui';
import type { ChatMessage } from '../global.d';

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

// ── Component ─────────────────────────────────────────────────────────────────

type BackendIndicator = 'local' | 'ollama' | 'claude' | 'none';

function deriveBackend(
  ollamaAvailable: boolean,
  hasAnthropicKey: boolean,
  hasModelPath: boolean,
): BackendIndicator {
  if (ollamaAvailable)   return 'ollama';
  if (hasAnthropicKey)   return 'claude';
  if (hasModelPath)      return 'local';
  return 'none';
}

const BACKEND_COLOR: Record<BackendIndicator, string> = {
  local:  '#22c55e',
  ollama: '#eab308',
  claude: '#3b82f6',
  none:   '#ef4444',
};

const BACKEND_LABEL: Record<BackendIndicator, string> = {
  local:  'Local',
  ollama: 'Ollama',
  claude: 'Claude',
  none:   'No backend',
};

export function ChatPanel() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState('');
  const [streaming, setStreaming]       = useState(false);
  const [ollamaAvail, setOllamaAvail]   = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasModelPath, setHasModelPath] = useState(false);
  const listRef                         = useRef<HTMLDivElement>(null);
  const textareaRef                     = useRef<HTMLTextAreaElement>(null);
  const cleanupRef                      = useRef<(() => void)[]>([]);
  const currentMsgIdRef                 = useRef<string | null>(null);

  const backend = deriveBackend(ollamaAvail, hasAnthropicKey, hasModelPath);

  // Subscribe to Ollama status and fetch initial settings
  useEffect(() => {
    const removeOllama = window.dai.model.onOllamaStatus(({ available }) => {
      setOllamaAvail(available);
    });

    void window.dai.settings.get('anthropic_api_key').then((v) => setHasAnthropicKey(!!v));
    void window.dai.settings.get('modelPath').then((v) => setHasModelPath(!!v));

    return removeOllama;
  }, []);

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
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

    // Add user bubble
    const userMsg: Message = { id: nextId(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);

    // Create empty assistant bubble
    const assistantId = nextId();
    currentMsgIdRef.current = assistantId;
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreaming(true);

    // Register streaming listeners
    const removeToken       = window.dai.chat.onToken(appendToken);
    const removeToolUse     = window.dai.chat.onToolUse(appendToolUse);
    const removeToolResult  = window.dai.chat.onToolResult(appendToolResult);
    const removeDone        = window.dai.chat.onDone(finishStreaming);
    cleanupRef.current = [removeToken, removeToolUse, removeToolResult, removeDone];

    // Build history from current messages (exclude the new user message — it's the prompt)
    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
    // If ok, done fires from agent:done event via finishStreaming
  }, [streaming, messages, appendToken, appendToolUse, appendToolResult, finishStreaming]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
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
          <BackendBadge backend={backend} />
          {streaming && <ThinkingIndicator />}
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} style={messageList}>
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <WelcomeState onQuickAction={handleQuickAction} />
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </AnimatePresence>
        {/* Bottom spacer so last message isn't flush against input */}
        <div style={{ height: space[4] }} />
      </div>

      {/* Input area */}
      <div style={inputArea}>
        <div style={inputWrapper}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            placeholder={streaming ? 'Ari is thinking...' : 'Ask anything about your code...'}
            rows={1}
            style={{
              ...textareaStyle,
              color: streaming ? color.textMuted : color.textPrimary,
            }}
          />
          <motion.button
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            style={{
              ...sendBtn,
              opacity: streaming || !input.trim() ? 0.35 : 1,
              cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer',
            }}
            whileHover={streaming || !input.trim() ? {} : { scale: 1.08 }}
            whileTap={streaming || !input.trim() ? {} : { scale: 0.92 }}
            transition={spring.snappy}
          >
            <Send size={16} strokeWidth={2} />
          </motion.button>
        </div>
        <p style={inputHint}>Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ── Backend badge ─────────────────────────────────────────────────────────────

function BackendBadge({ backend }: { backend: BackendIndicator }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
      <motion.div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: BACKEND_COLOR[backend],
          flexShrink: 0,
        }}
        animate={backend !== 'none' ? {
          boxShadow: [
            `0 0 4px ${BACKEND_COLOR[backend]}80`,
            `0 0 10px ${BACKEND_COLOR[backend]}80`,
            `0 0 4px ${BACKEND_COLOR[backend]}80`,
          ],
        } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span style={{ fontSize: font.micro, color: color.textMuted, letterSpacing: '0.04em' }}>
        {BACKEND_LABEL[backend]}
      </span>
    </div>
  );
}

// ── Welcome state ──────────────────────────────────────────────────────────────

function WelcomeState({ onQuickAction }: { onQuickAction: (a: QuickAction) => void }) {
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
      <p style={welcomeSub}>Ari runs locally — your code never leaves this machine.</p>
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
      style={{
        ...bubbleRow,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: space[1] }}>
        {/* Tool use chips — shown above assistant message content */}
        {!isUser && message.toolUses && message.toolUses.length > 0 && (
          <div style={toolChipsRow}>
            {message.toolUses.map((tu, i) => (
              <ToolCallChip key={i} toolUse={tu} result={message.toolResults?.[i]} />
            ))}
          </div>
        )}

        {/* Main content bubble */}
        <div
          style={{
            ...(isUser ? userBubble : assistantBubble),
            ...(message.isError ? { borderColor: color.danger, color: color.danger } : {}),
          }}
        >
          <MessageContent content={message.content} isStreaming={message.isStreaming} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Message content renderer ───────────────────────────────────────────────────
// Splits on code fences for basic markdown-ish rendering

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
      style={{
        ...toolChip,
        ...(hasError ? { borderColor: color.dangerDim, color: color.danger } : {}),
      }}
      layout
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={toolChipBtn}
      >
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
    <motion.div
      style={thinkingDots}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
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

interface ContentPart {
  type: 'text' | 'code';
  text: string;
  lang?: string;
}

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
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: color.base,
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${space[3]} ${space[5]}`,
  borderBottom: `1px solid ${color.border}`,
  flexShrink: 0,
};

const messageList: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: `${space[4]} ${space[5]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
};

const bubbleRow: React.CSSProperties = {
  display: 'flex',
  width: '100%',
};

const userBubble: React.CSSProperties = {
  background: color.accent,
  color: color.base,
  padding: `${space[3]} ${space[4]}`,
  borderRadius: `${radius.lg} ${radius.lg} ${radius.sm} ${radius.lg}`,
  fontSize: font.body,
  fontWeight: font.medium,
  boxShadow: `0 0 16px ${color.accentDim}`,
};

const assistantBubble: React.CSSProperties = {
  ...glass,
  padding: `${space[3]} ${space[4]}`,
  borderRadius: `${radius.lg} ${radius.lg} ${radius.lg} ${radius.sm}`,
  fontSize: font.body,
  color: color.textPrimary,
  lineHeight: '1.65',
};

const inputArea: React.CSSProperties = {
  flexShrink: 0,
  padding: `${space[3]} ${space[4]} ${space[4]}`,
  borderTop: `1px solid ${color.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
};

const inputWrapper: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: space[2],
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding: `${space[2]} ${space[3]}`,
  backdropFilter: blur.glass,
  transition: 'border-color 150ms ease',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontFamily: font.family,
  fontSize: font.body,
  lineHeight: '1.5',
  maxHeight: 160,
  overflowY: 'auto',
};

const sendBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: radius.md,
  border: 'none',
  background: color.accent,
  color: color.base,
  flexShrink: 0,
  transition: 'opacity 150ms ease',
};

const inputHint: React.CSSProperties = {
  fontSize: font.micro,
  color: color.textMuted,
  paddingLeft: space[1],
};

const welcomeShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  gap: space[4],
  paddingBottom: space[10],
  minHeight: '60vh',
};

const welcomeDot: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: color.accent,
};

const welcomeHeading: React.CSSProperties = {
  fontSize: font.display,
  color: color.textPrimary,
  fontWeight: font.light,
  textAlign: 'center',
};

const welcomeSub: React.CSSProperties = {
  fontSize: font.small,
  color: color.textDim,
  textAlign: 'center',
};

const quickActionsRow: React.CSSProperties = {
  display: 'flex',
  gap: space[2],
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: space[2],
};

const quickChip: React.CSSProperties = {
  padding: `${space[2]} ${space[4]}`,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.full,
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  transition: 'all 150ms ease',
};

const codeBlock: React.CSSProperties = {
  position: 'relative',
  background: 'rgba(0,0,0,0.35)',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  padding: space[4],
  fontFamily: font.mono,
  fontSize: font.small,
  lineHeight: '1.6',
  overflowX: 'auto',
  margin: `${space[2]} 0`,
  whiteSpace: 'pre',
};

const codeLang: React.CSSProperties = {
  position: 'absolute',
  top: space[1],
  right: space[2],
  fontSize: font.micro,
  color: color.textMuted,
  fontFamily: font.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const cursorStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 2,
  height: '1em',
  background: color.accent,
  marginLeft: 2,
  verticalAlign: 'text-bottom',
  borderRadius: 1,
};

const toolChipsRow: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
  marginBottom: space[1],
};

const toolChip: React.CSSProperties = {
  background: color.accentGlow,
  border: `1px solid ${color.accentDim}`,
  borderRadius: radius.md,
  overflow: 'hidden',
  fontSize: font.micro,
};

const toolChipBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[1],
  padding: `${space[1]} ${space[2]}`,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: color.accent,
  fontFamily: font.family,
  width: '100%',
  textAlign: 'left',
};

const toolDetail: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: font.micro,
  padding: space[2],
  borderTop: `1px solid ${color.accentDim}`,
  color: color.textDim,
  overflow: 'auto',
  maxHeight: 200,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const thinkingDots: React.CSSProperties = {
  display: 'flex',
  gap: space[1],
  alignItems: 'center',
};

const dot: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: color.accent,
};
