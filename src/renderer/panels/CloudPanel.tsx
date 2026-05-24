import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, ChevronDown, RefreshCw, Plus, ExternalLink, Settings, AlertCircle, FileText, CheckSquare } from 'lucide-react';
import { color, font, glass, glassHover, space, radius, spring, blur } from '@dai-desktop/ui';
import type { CloudDatasphere, CloudPage, CloudTask, CloudPlanMode } from '../global.d';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'pages' | 'tasks';
type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

// ── Main Component ────────────────────────────────────────────────────────────

export function CloudPanel() {
  const [hasApiKey, setHasApiKey]           = useState<boolean | null>(null);
  const [isSessionToken, setIsSessionToken] = useState<boolean>(false);
  const [dataspheres, setDataspheres]       = useState<CloudDatasphere[]>([]);
  const [active, setActive]                 = useState<CloudDatasphere | null>(null);
  const [dsDropOpen, setDsDropOpen]         = useState(false);
  const [tab, setTab]                       = useState<Tab>('pages');
  const [pages, setPages]                   = useState<CloudPage[]>([]);
  const [tasks, setTasks]                   = useState<CloudTask[]>([]);
  const [planModes, setPlanModes]           = useState<CloudPlanMode[]>([]);
  const [loadState, setLoadState]           = useState<LoadState>('idle');
  const [error, setError]                   = useState<string | null>(null);
  const [captureOpen, setCaptureOpen]       = useState(false);
  const [captureText, setCaptureText]       = useState('');
  const [captureType, setCaptureType]       = useState<'page' | 'task'>('page');
  const [capturing, setCapturing]           = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);

  // ── Check API key on mount ─────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const cloudKey = await window.dai.settings.get('cloudApiKey') as string | null;
      const legacyKey = await window.dai.settings.get('dataspheres_api_key') as string | null;
      const isSession = await window.dai.settings.get('cloudApiKeyIsSessionToken');
      setHasApiKey(Boolean(cloudKey || legacyKey));
      setIsSessionToken(isSession === true);
    })();
  }, []);

  // ── Load dataspheres once API key is confirmed ─────────────────────────────
  // (Skipped when we know the stored token is a NextAuth session JWT, not a
  // real dsk_ API key — calling listDataspheres would just produce the
  // SyntaxError "<!DOCTYPE..." that confuses users.)

  useEffect(() => {
    if (!hasApiKey || isSessionToken) return;
    loadDataspheres();
  }, [hasApiKey, isSessionToken]);

  // ── Close dropdown on outside click ───────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDsDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadDataspheres = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    const res = await window.dai.cloud.listDataspheres();
    if (res.error) {
      setLoadState('error');
      setError(res.error);
      return;
    }
    const list = (res.data ?? []) as CloudDatasphere[];
    setDataspheres(list);

    // Fetch current active
    const activeRes = await window.dai.cloud.getActive();
    let current = (activeRes.data as CloudDatasphere | null) ?? null;
    if (!current && list.length > 0) {
      // Auto-select first (prefer private)
      current = list.find((d) => d.isPrivate) ?? list[0];
      await window.dai.cloud.setActive(current.uri);
    }
    setActive(current);
    if (current) {
      await loadContent(current);
    } else {
      setLoadState('loaded');
    }
  }, []);

  const loadContent = useCallback(async (ds: CloudDatasphere) => {
    setLoadState('loading');
    setError(null);
    try {
      const [pagesRes, tasksRes, modesRes] = await Promise.all([
        window.dai.cloud.listPages(ds.uri),
        window.dai.cloud.listTasks(ds.id),
        window.dai.cloud.listPlanModes(ds.id),
      ]);
      setPages((pagesRes.data ?? []) as CloudPage[]);
      setTasks((tasksRes.data ?? []) as CloudTask[]);
      setPlanModes((modesRes.data ?? []) as CloudPlanMode[]);
      setLoadState('loaded');
    } catch (err) {
      setLoadState('error');
      setError(String(err));
    }
  }, []);

  const switchDatasphere = useCallback(async (ds: CloudDatasphere) => {
    setDsDropOpen(false);
    setActive(ds);
    await window.dai.cloud.setActive(ds.uri);
    await loadContent(ds);
  }, [loadContent]);

  const retry = useCallback(() => {
    if (active) loadContent(active);
    else loadDataspheres();
  }, [active, loadContent, loadDataspheres]);

  // ── Quick capture ──────────────────────────────────────────────────────────

  const submitCapture = useCallback(async () => {
    if (!captureText.trim() || !active) return;
    setCapturing(true);
    const res = await window.dai.cloud.quickCapture(captureText.trim(), captureType, { datasphereUri: active.uri });
    setCapturing(false);
    if (res.error) {
      setError(res.error);
    } else {
      setCaptureText('');
      setCaptureOpen(false);
      // Reload relevant tab
      await loadContent(active);
    }
  }, [captureText, captureType, active, loadContent]);

  // ── Render guards ──────────────────────────────────────────────────────────

  if (hasApiKey === null) {
    // Still checking
    return <PanelShell><SkeletonList count={4} /></PanelShell>;
  }

  if (!hasApiKey) {
    return (
      <PanelShell>
        <div style={centeredContent}>
          <motion.div style={iconRing} animate={{ boxShadow: [`0 0 12px ${color.accentDim}`, `0 0 28px ${color.accentDim}`, `0 0 12px ${color.accentDim}`] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <Cloud size={28} strokeWidth={1.5} style={{ color: color.accent }} />
          </motion.div>
          <h2 style={{ fontSize: font.display, color: color.textPrimary, fontWeight: font.light }}>Connect to Dataspheres AI</h2>
          <p style={subText}>Enter your Dataspheres AI API key in Settings to sync tasks, pages, and research.</p>
          <SettingsLink />
        </div>
      </PanelShell>
    );
  }

  if (isSessionToken) {
    // User signed in via email/password and we got a NextAuth session JWT
    // instead of a `dsk_...` key. The cloud API doesn't accept session JWTs
    // as Bearer tokens, so attempting to list dataspheres returns the HTML
    // login page and our JSON parser throws a SyntaxError. Show a clear
    // "API key needed" state instead.
    return (
      <PanelShell>
        <div style={centeredContent}>
          <motion.div style={iconRing} animate={{ boxShadow: [`0 0 12px ${color.accentDim}`, `0 0 28px ${color.accentDim}`, `0 0 12px ${color.accentDim}`] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <Cloud size={28} strokeWidth={1.5} style={{ color: color.accent }} />
          </motion.div>
          <h2 style={{ fontSize: font.display, color: color.textPrimary, fontWeight: font.light }}>One more step</h2>
          <p style={subText}>
            You’re signed in, but your workspaces need a developer API key to load. Grab one at
            dataspheres.ai/app/developers and paste it in Settings.
          </p>
          <SettingsLink />
        </div>
      </PanelShell>
    );
  }

  return (
    <div style={panelShell}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={header}>
        <span style={{ fontSize: font.small, color: color.textDim, fontWeight: font.medium, letterSpacing: '0.06em' }}>
          DATASPHERES AI
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          {/* Datasphere selector */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <motion.button
              style={dsPickerBtn}
              onClick={() => setDsDropOpen((v) => !v)}
              whileHover={glassHover}
              whileTap={{ scale: 0.97 }}
              transition={spring.snappy}
            >
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active?.name ?? 'Select workspace'}
              </span>
              <ChevronDown size={12} strokeWidth={2} style={{ color: color.textDim, flexShrink: 0, transform: dsDropOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }} />
            </motion.button>

            <AnimatePresence>
              {dsDropOpen && (
                <motion.div
                  style={dropdown}
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={spring.snappy}
                >
                  {dataspheres.map((ds) => (
                    <motion.button
                      key={ds.id}
                      style={{ ...dropdownItem, ...(ds.id === active?.id ? { color: color.accent } : {}) }}
                      onClick={() => switchDatasphere(ds)}
                      whileHover={{ background: color.surfaceHover }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name}</span>
                      {ds.isPrivate && <span style={badge}>private</span>}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh */}
          <motion.button
            style={iconBtn}
            onClick={retry}
            whileHover={{ color: color.accent, background: color.accentGlow }}
            whileTap={{ scale: 0.9 }}
            transition={spring.snappy}
            title="Refresh"
          >
            <RefreshCw size={14} strokeWidth={2} style={{ color: loadState === 'loading' ? color.accent : color.textDim, animation: loadState === 'loading' ? 'spin 1s linear infinite' : undefined }} />
          </motion.button>

          {/* New capture */}
          <motion.button
            style={{ ...iconBtn, ...(captureOpen ? { background: color.accentGlow, color: color.accent } : {}) }}
            onClick={() => setCaptureOpen((v) => !v)}
            whileHover={{ color: color.accent, background: color.accentGlow }}
            whileTap={{ scale: 0.9 }}
            transition={spring.snappy}
            title="Quick capture"
          >
            <Plus size={14} strokeWidth={2} style={{ color: captureOpen ? color.accent : color.textDim }} />
          </motion.button>
        </div>
      </div>

      {/* ── Quick capture panel ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {captureOpen && (
          <motion.div
            style={capturePanel}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.panel}
          >
            <div style={{ display: 'flex', gap: space[2], marginBottom: space[2] }}>
              {(['page', 'task'] as const).map((t) => (
                <motion.button
                  key={t}
                  style={{ ...tabChip, ...(captureType === t ? tabChipActive : {}) }}
                  onClick={() => setCaptureType(t)}
                  whileHover={captureType !== t ? { borderColor: color.borderFocus } : {}}
                  transition={spring.snappy}
                >
                  {t === 'page' ? <FileText size={11} /> : <CheckSquare size={11} />}
                  {t}
                </motion.button>
              ))}
            </div>
            <textarea
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              placeholder={captureType === 'page' ? 'Page title and content…' : 'Task title…'}
              style={captureArea}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitCapture();
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], marginTop: space[2] }}>
              <motion.button style={captureBtn} onClick={() => setCaptureOpen(false)} whileHover={glassHover} transition={spring.snappy}>
                Cancel
              </motion.button>
              <motion.button
                style={{ ...captureBtn, ...captureBtnPrimary }}
                onClick={submitCapture}
                disabled={!captureText.trim() || capturing}
                whileHover={!captureText.trim() || capturing ? {} : { background: color.accentDim }}
                whileTap={!captureText.trim() || capturing ? {} : { scale: 0.97 }}
                transition={spring.snappy}
              >
                {capturing ? 'Saving…' : `Save ${captureType}`}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div style={tabBar}>
        {(['pages', 'tasks'] as Tab[]).map((t) => (
          <motion.button
            key={t}
            style={{ ...tabBtn, ...(tab === t ? tabBtnActive : {}) }}
            onClick={() => setTab(t)}
            whileHover={tab !== t ? { color: color.textPrimary } : {}}
            transition={spring.snappy}
          >
            {t === 'pages' ? <FileText size={13} strokeWidth={1.8} /> : <CheckSquare size={13} strokeWidth={1.8} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </motion.button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div style={contentArea}>
        {/* Error state */}
        {loadState === 'error' && error && (
          <motion.div style={errorBanner} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AlertCircle size={14} style={{ color: color.danger, flexShrink: 0 }} />
            <span style={{ flex: 1, color: color.danger, fontSize: font.small }}>{error}</span>
            <motion.button style={retryBtn} onClick={retry} whileHover={{ color: color.accent }} transition={spring.snappy}>
              Retry
            </motion.button>
          </motion.div>
        )}

        {/* Loading skeleton */}
        {loadState === 'loading' && <SkeletonList count={6} />}

        {/* No active datasphere */}
        {loadState === 'loaded' && !active && (
          <div style={emptyState}>
            <p style={{ color: color.textDim, fontSize: font.small }}>Select a workspace above to get started.</p>
          </div>
        )}

        {/* Pages tab */}
        {loadState === 'loaded' && active && tab === 'pages' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="pages"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring.panel}
            >
              {pages.length === 0 ? (
                <div style={emptyState}>
                  <FileText size={24} strokeWidth={1} style={{ color: color.textMuted }} />
                  <p style={{ color: color.textDim, fontSize: font.small }}>No pages yet.</p>
                </div>
              ) : (
                <div style={listWrapper}>
                  {pages.map((page) => (
                    <PageCard key={page.id} page={page} />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Tasks tab */}
        {loadState === 'loaded' && active && tab === 'tasks' && (
          <AnimatePresence mode="wait">
            <motion.div
              key="tasks"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring.panel}
            >
              {tasks.length === 0 ? (
                <div style={emptyState}>
                  <CheckSquare size={24} strokeWidth={1} style={{ color: color.textMuted }} />
                  <p style={{ color: color.textDim, fontSize: font.small }}>No tasks yet.</p>
                </div>
              ) : (
                <TaskList tasks={tasks} planModes={planModes} />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* CSS keyframe for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── PageCard ──────────────────────────────────────────────────────────────────

function PageCard({ page }: { page: CloudPage }) {
  const openUrl = () => {
    if (page.url) window.open(page.url, '_blank');
  };

  return (
    <motion.div
      style={card}
      whileHover={{ ...glassHover, cursor: page.url ? 'pointer' : 'default' }}
      onClick={page.url ? openUrl : undefined}
      transition={spring.snappy}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] }}>
        <span style={{ fontSize: font.body, color: color.textPrimary, fontWeight: font.medium, flex: 1, lineHeight: '1.4' }}>
          {page.title || page.slug}
        </span>
        {page.url && <ExternalLink size={12} strokeWidth={1.5} style={{ color: color.textMuted, flexShrink: 0, marginTop: 2 }} />}
      </div>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[1] }}>
        {page.folderName && <span style={chip}>{page.folderName}</span>}
        {page.status && page.status !== 'published' && <span style={chip}>{page.status}</span>}
        {page.updatedAt && (
          <span style={{ fontSize: font.micro, color: color.textMuted }}>
            {formatRelative(page.updatedAt)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── TaskList ──────────────────────────────────────────────────────────────────

function TaskList({ tasks, planModes }: { tasks: CloudTask[]; planModes: CloudPlanMode[] }) {
  // Group by planModeName or planModeId
  const groups = new Map<string, { label: string; tasks: CloudTask[] }>();

  for (const task of tasks) {
    const key = task.planModeId ?? '__ungrouped__';
    if (!groups.has(key)) {
      const mode = planModes.find((m) => m.id === task.planModeId);
      groups.set(key, {
        label: mode?.name ?? task.planModeName ?? (key === '__ungrouped__' ? 'Tasks' : key),
        tasks: [],
      });
    }
    groups.get(key)!.tasks.push(task);
  }

  return (
    <div style={listWrapper}>
      {Array.from(groups.values()).map((group) => (
        <div key={group.label} style={{ marginBottom: space[4] }}>
          <div style={groupLabel}>{group.label}</div>
          {group.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  done:        color.success,
  complete:    color.success,
  completed:   color.success,
  blocked:     color.danger,
  'in-progress': color.warning,
  'in progress': color.warning,
  review:      color.warning,
};

function TaskCard({ task }: { task: CloudTask }) {
  const statusColor = STATUS_COLORS[task.status?.toLowerCase() ?? ''] ?? color.textMuted;

  return (
    <motion.div style={card} whileHover={glassHover} transition={spring.snappy}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[2] }}>
        <span style={{ fontSize: font.body, color: color.textPrimary, fontWeight: font.regular, flex: 1, lineHeight: '1.4' }}>
          {task.title}
        </span>
        <span style={{ ...chip, color: statusColor, borderColor: statusColor, fontSize: font.micro }}>
          {task.status}
        </span>
      </div>
      {task.tags && task.tags.length > 0 && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[1] }}>
          {task.tags.map((t) => (
            <span key={t} style={chip}>{t}</span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── SkeletonList ──────────────────────────────────────────────────────────────

function SkeletonList({ count }: { count: number }) {
  return (
    <div style={listWrapper}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          style={skeletonCard}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
        >
          <div style={{ ...skeletonLine, width: `${60 + (i % 3) * 15}%` }} />
          <div style={{ ...skeletonLine, width: '35%', height: 10, marginTop: space[1] }} />
        </motion.div>
      ))}
    </div>
  );
}

// ── SettingsLink ──────────────────────────────────────────────────────────────

function SettingsLink() {
  return (
    <motion.button
      style={settingsLinkBtn}
      onClick={() => window.dai.settings.get('_navigate_settings').catch(() => {})}
      whileHover={{ borderColor: color.accent, color: color.accent }}
      whileTap={{ scale: 0.97 }}
      transition={spring.snappy}
    >
      <Settings size={14} strokeWidth={1.5} />
      Open Settings
    </motion.button>
  );
}

// ── PanelShell wrapper ────────────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div style={panelShell}><div style={contentArea}>{children}</div></div>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days  = Math.floor(diff / 86_400_000);
    const hours = Math.floor(diff / 3_600_000);
    const mins  = Math.floor(diff / 60_000);
    if (days > 30)  return new Date(dateStr).toLocaleDateString();
    if (days > 0)   return `${days}d ago`;
    if (hours > 0)  return `${hours}h ago`;
    if (mins > 0)   return `${mins}m ago`;
    return 'just now';
  } catch {
    return '';
  }
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
  padding: `${space[3]} ${space[4]}`,
  borderBottom: `1px solid ${color.border}`,
  flexShrink: 0,
};

const dsPickerBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[1],
  padding: `${space[1]} ${space[3]}`,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.textPrimary,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  maxWidth: 180,
};

const dropdown: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  minWidth: 200,
  ...glass,
  backdropFilter: blur.glass,
  zIndex: 100,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const dropdownItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
  padding: `${space[2]} ${space[3]}`,
  background: 'transparent',
  border: 'none',
  color: color.textPrimary,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  textAlign: 'left',
  width: '100%',
};

const badge: React.CSSProperties = {
  fontSize: font.micro,
  color: color.textMuted,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  padding: `1px ${space[1]}`,
  flexShrink: 0,
};

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: 'transparent',
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  cursor: 'pointer',
  color: color.textDim,
};

const tabBar: React.CSSProperties = {
  display: 'flex',
  borderBottom: `1px solid ${color.border}`,
  flexShrink: 0,
};

const tabBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[1],
  padding: `${space[2]} ${space[4]}`,
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  transition: 'color 150ms, border-color 150ms',
};

const tabBtnActive: React.CSSProperties = {
  color: color.textPrimary,
  borderBottomColor: color.accent,
};

const capturePanel: React.CSSProperties = {
  padding: `${space[3]} ${space[4]}`,
  borderBottom: `1px solid ${color.border}`,
  background: color.accentGlow,
  overflow: 'hidden',
  flexShrink: 0,
};

const tabChip: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[1],
  padding: `${space[1]} ${space[3]}`,
  background: 'transparent',
  border: `1px solid ${color.border}`,
  borderRadius: radius.full,
  color: color.textDim,
  fontSize: font.micro,
  cursor: 'pointer',
  fontFamily: font.family,
  textTransform: 'capitalize',
};

const tabChipActive: React.CSSProperties = {
  color: color.accent,
  borderColor: color.accent,
  background: color.accentGlow,
};

const captureArea: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.25)',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  padding: `${space[2]} ${space[3]}`,
  color: color.textPrimary,
  fontSize: font.small,
  fontFamily: font.family,
  outline: 'none',
  resize: 'vertical' as const,
  boxSizing: 'border-box' as const,
};

const captureBtn: React.CSSProperties = {
  padding: `${space[1]} ${space[3]}`,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
};

const captureBtnPrimary: React.CSSProperties = {
  background: color.accentGlow,
  borderColor: color.accentDim,
  color: color.accent,
};

const contentArea: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: space[3],
};

const listWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
};

const card: React.CSSProperties = {
  ...glass,
  padding: `${space[3]} ${space[4]}`,
  cursor: 'default',
};

const skeletonCard: React.CSSProperties = {
  ...glass,
  padding: `${space[3]} ${space[4]}`,
};

const skeletonLine: React.CSSProperties = {
  height: 14,
  background: color.surface,
  borderRadius: radius.sm,
};

const chip: React.CSSProperties = {
  fontSize: font.micro,
  color: color.textMuted,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.full,
  padding: `1px ${space[2]}`,
};

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[2]} ${space[3]}`,
  background: color.dangerDim,
  border: `1px solid ${color.danger}`,
  borderRadius: radius.md,
  marginBottom: space[3],
};

const retryBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  flexShrink: 0,
};

const groupLabel: React.CSSProperties = {
  fontSize: font.micro,
  color: color.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  padding: `${space[1]} 0`,
  marginBottom: space[1],
};

const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[3],
  padding: space[10],
};

const centeredContent: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[5],
  padding: space[8],
};

const iconRing: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  background: color.accentGlow,
  border: `1px solid ${color.accentDim}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const subText: React.CSSProperties = {
  fontSize: font.body,
  color: color.textDim,
  textAlign: 'center',
  maxWidth: 400,
  lineHeight: '1.65',
};

const settingsLinkBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  padding: `${space[2]} ${space[4]}`,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
};
