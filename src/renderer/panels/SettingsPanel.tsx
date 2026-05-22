import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, FolderOpen, RefreshCw } from 'lucide-react';
import { color, font, glass, space, radius, spring } from '@dai-desktop/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HardwareInfo {
  acceleration: 'cuda' | 'metal' | 'vulkan' | 'cpu';
  gpuName?: string;
  vramMB?: number;
  ramMB: number;
  cpuCores: number;
  platform: 'win32' | 'darwin' | 'linux';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const [modelPath, setModelPath]         = useState('');
  const [dsApiKey, setDsApiKey]           = useState('');
  const [anthropicKey, setAnthropicKey]   = useState('');
  const [hw, setHw]                       = useState<HardwareInfo | null>(null);
  const [hwError, setHwError]             = useState<string | null>(null);
  const [saved, setSaved]                 = useState<string | null>(null);
  const [reloading, setReloading]         = useState(false);
  const [reloadMsg, setReloadMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const mp  = await window.dai.settings.get('modelPath')          as string | null;
      const ds  = await window.dai.settings.get('dataspheres_api_key') as string | null;
      const ak  = await window.dai.settings.get('anthropic_api_key')  as string | null;
      if (mp)  setModelPath(mp);
      if (ds)  setDsApiKey(ds);
      if (ak)  setAnthropicKey(ak);
    })();
  }, []);

  useEffect(() => {
    window.dai.hardware.info()
      .then((res) => {
        if (res?.ok && res.data) setHw(res.data as HardwareInfo);
        else setHwError(res?.error ?? 'Could not detect hardware');
      })
      .catch((e) => setHwError(String(e)));
  }, []);

  const browse = useCallback(async () => {
    const result = await window.dai.settings.pickModelFile();
    if (!result.canceled && result.filePath) {
      setModelPath(result.filePath);
    }
  }, []);

  const save = useCallback(async () => {
    await window.dai.settings.set('modelPath', modelPath.trim());
    await window.dai.settings.set('dataspheres_api_key', dsApiKey.trim());
    await window.dai.settings.set('anthropic_api_key', anthropicKey.trim());
    setSaved('Saved');
    setTimeout(() => setSaved(null), 2000);
  }, [modelPath, dsApiKey, anthropicKey]);

  const reloadModel = useCallback(async () => {
    setReloading(true);
    setReloadMsg(null);
    await window.dai.settings.set('modelPath', modelPath.trim());
    const res = await window.dai.settings.reloadModel();
    setReloading(false);
    if (res?.ok) {
      setReloadMsg({ ok: true, text: 'Model loaded' });
    } else {
      setReloadMsg({ ok: false, text: res?.error ?? 'Load failed' });
    }
    setTimeout(() => setReloadMsg(null), 3000);
  }, [modelPath]);

  return (
    <div style={panelShell}>
      {/* Header */}
      <div style={header}>
        <span style={{ fontSize: font.small, color: color.textDim, fontWeight: font.medium, letterSpacing: '0.06em' }}>
          SETTINGS
        </span>
        <motion.button
          onClick={save}
          style={{
            ...saveBtn,
            ...(saved ? { color: color.accent, borderColor: color.accentDim } : {}),
          }}
          whileHover={{ background: color.accentGlow, borderColor: color.accent }}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
        >
          {saved ?? 'Save'}
        </motion.button>
      </div>

      {/* Content */}
      <div style={content}>

        {/* Local model section */}
        <Section title="Local Model">
          <div style={fieldWrapper}>
            <label style={fieldLabel}>Model Path</label>
            <p style={fieldHint}>.gguf file — absolute path on this machine</p>
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
              <input
                type="text"
                value={modelPath}
                onChange={(e) => setModelPath(e.target.value)}
                placeholder="/home/you/models/gemma-4-e4b.gguf"
                style={{ ...inputStyle, fontFamily: font.mono, flex: 1 }}
                autoComplete="off"
                spellCheck={false}
              />
              <motion.button
                onClick={browse}
                style={iconBtn}
                whileHover={{ borderColor: color.accent, color: color.accent }}
                whileTap={{ scale: 0.94 }}
                title="Browse for .gguf file"
              >
                <FolderOpen size={15} />
              </motion.button>
              <motion.button
                onClick={reloadModel}
                disabled={reloading}
                style={{ ...iconBtn, opacity: reloading ? 0.5 : 1 }}
                whileHover={reloading ? {} : { borderColor: color.accent, color: color.accent }}
                whileTap={reloading ? {} : { scale: 0.94 }}
                title="Reload model now"
              >
                <motion.span
                  animate={reloading ? { rotate: 360 } : { rotate: 0 }}
                  transition={reloading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
                  style={{ display: 'flex' }}
                >
                  <RefreshCw size={15} />
                </motion.span>
              </motion.button>
            </div>
            <AnimatePresence>
              {reloadMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    fontSize: font.micro,
                    color: reloadMsg.ok ? color.accent : color.danger,
                    marginTop: space[1],
                  }}
                >
                  {reloadMsg.text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </Section>

        {/* AI API keys section */}
        <Section title="AI Backends">
          <SecretField
            label="Claude API Key"
            hint="Optional — enables Claude fallback when Ollama is unavailable"
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder="sk-ant-..."
          />
          <SecretField
            label="Dataspheres API Key"
            hint="Enables cloud sync and Ari's platform tools"
            value={dsApiKey}
            onChange={setDsApiKey}
            placeholder="dsk-..."
          />
        </Section>

        {/* Hardware section */}
        <Section title="Hardware">
          {hw
            ? <HardwareCard hw={hw} />
            : <div style={{ color: hwError ? color.danger : color.textDim, fontSize: font.small }}>
                {hwError ?? 'Detecting hardware…'}
              </div>
          }
        </Section>

      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      style={sectionWrapper}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.panel}
    >
      <h3 style={sectionTitle}>{title}</h3>
      <div style={{ ...glass, padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4] }}>
        {children}
      </div>
    </motion.div>
  );
}

// ── Secret field (password with eye toggle) ───────────────────────────────────

function SecretField({
  label, hint, value, onChange, placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div style={fieldWrapper}>
      <label style={fieldLabel}>{label}</label>
      {hint && <p style={fieldHint}>{hint}</p>}
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, fontFamily: font.mono, flex: 1 }}
          autoComplete="off"
          spellCheck={false}
        />
        <motion.button
          onClick={() => setShow((v) => !v)}
          style={{ ...iconBtn, flexShrink: 0 }}
          whileHover={{ borderColor: color.accent, color: color.accent }}
          whileTap={{ scale: 0.94 }}
          title={show ? 'Hide' : 'Reveal'}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </motion.button>
      </div>
    </div>
  );
}

// ── Hardware card ─────────────────────────────────────────────────────────────

const ACCEL_COLOR: Record<string, string> = {
  cuda:   color.cuda,
  metal:  color.metal,
  vulkan: color.vulkan,
  cpu:    color.cpu,
};

const ACCEL_LABEL: Record<string, string> = {
  cuda:   'CUDA',
  metal:  'Metal',
  vulkan: 'Vulkan',
  cpu:    'CPU',
};

function HardwareCard({ hw }: { hw: HardwareInfo }) {
  const accel = hw.acceleration;
  const rows: [string, React.ReactNode][] = [
    ['Acceleration', (
      <span style={{
        display: 'inline-block',
        padding: `2px ${space[2]}`,
        background: `${ACCEL_COLOR[accel]}22`,
        border: `1px solid ${ACCEL_COLOR[accel]}66`,
        borderRadius: radius.sm,
        color: ACCEL_COLOR[accel],
        fontSize: font.micro,
        fontFamily: font.mono,
        fontWeight: font.medium,
        letterSpacing: '0.04em',
      }}>
        {ACCEL_LABEL[accel] ?? accel.toUpperCase()}
      </span>
    )],
    ...(hw.gpuName ? [['GPU', hw.gpuName] as [string, React.ReactNode]] : []),
    ...(hw.vramMB  ? [['VRAM', `${hw.vramMB} MB`] as [string, React.ReactNode]] : []),
    ['RAM',       `${hw.ramMB} MB`],
    ['CPU cores', String(hw.cpuCores)],
    ['Platform',  hw.platform],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {rows.map(([k, v]) => (
        <div key={k as string} style={hwRow}>
          <span style={{ color: color.textDim, fontSize: font.small }}>{k}</span>
          <span style={{ color: color.textPrimary, fontSize: font.small, fontFamily: font.mono }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
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

const saveBtn: React.CSSProperties = {
  padding: `${space[1]} ${space[4]}`,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  transition: 'all 150ms ease',
};

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  color: color.textDim,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'all 150ms ease',
};

const content: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: `${space[5]} ${space[5]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[6],
  maxWidth: 640,
};

const sectionWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
};

const sectionTitle: React.CSSProperties = {
  fontSize: font.small,
  color: color.textDim,
  fontWeight: font.medium,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const fieldWrapper: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
};

const fieldLabel: React.CSSProperties = {
  fontSize: font.small,
  color: color.textPrimary,
  fontWeight: font.medium,
};

const fieldHint: React.CSSProperties = {
  fontSize: font.micro,
  color: color.textMuted,
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  padding: `${space[2]} ${space[3]}`,
  color: color.textPrimary,
  fontSize: font.small,
  outline: 'none',
  width: '100%',
  transition: 'border-color 150ms ease',
};

const hwRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${space[1]} 0`,
  borderBottom: `1px solid ${color.border}`,
};
