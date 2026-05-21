import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { color, font, glass, space, radius, spring, blur } from '@dai-desktop/ui';

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
  const [modelPath, setModelPath]       = useState('');
  const [apiKey, setApiKey]             = useState('');
  const [hw, setHw]                     = useState<HardwareInfo | null>(null);
  const [hwError, setHwError]           = useState<string | null>(null);
  const [saved, setSaved]               = useState<string | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      const mp  = await window.dai.settings.get('modelPath') as string | null;
      const key = await window.dai.settings.get('dataspheres_api_key') as string | null;
      if (mp)  setModelPath(mp);
      if (key) setApiKey(key);
    })();
  }, []);

  // Load hardware info on mount
  useEffect(() => {
    window.dai.hardware.info().then((res) => {
      if (res?.ok && res.data) {
        setHw(res.data as HardwareInfo);
      } else {
        setHwError(res?.error ?? 'Could not detect hardware');
      }
    }).catch((e) => setHwError(String(e)));
  }, []);

  const save = useCallback(async () => {
    await window.dai.settings.set('modelPath', modelPath.trim());
    await window.dai.settings.set('dataspheres_api_key', apiKey.trim());
    setSaved('Saved');
    setTimeout(() => setSaved(null), 2000);
  }, [modelPath, apiKey]);

  return (
    <div style={panelShell}>
      {/* Header */}
      <div style={header}>
        <span style={{ fontSize: font.small, color: color.textDim, fontWeight: font.medium, letterSpacing: '0.06em' }}>
          SETTINGS
        </span>
        <motion.button
          onClick={save}
          style={saveBtn}
          whileHover={{ background: color.accentGlow, borderColor: color.accent }}
          whileTap={{ scale: 0.96 }}
          transition={spring.snappy}
        >
          {saved ?? 'Save'}
        </motion.button>
      </div>

      {/* Content */}
      <div style={content}>

        {/* Model section */}
        <Section title="Local Model">
          <Field
            label="Model Path"
            hint=".gguf file — absolute path on this machine"
            value={modelPath}
            onChange={setModelPath}
            placeholder="/Users/you/models/gemma-4-e4b.gguf"
            mono
          />
        </Section>

        {/* API key section */}
        <Section title="Dataspheres AI">
          <Field
            label="API Key"
            hint="Optional — enables cloud sync and Ari's platform tools"
            value={apiKey}
            onChange={setApiKey}
            placeholder="dsk-..."
            password
            mono
          />
        </Section>

        {/* Hardware section */}
        <Section title="Hardware">
          {hw ? <HardwareCard hw={hw} /> : (
            <div style={{ color: hwError ? color.danger : color.textDim, fontSize: font.small }}>
              {hwError ?? 'Detecting hardware…'}
            </div>
          )}
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

// ── Field ─────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  password?: boolean;
}

function Field({ label, hint, value, onChange, placeholder, mono, password }: FieldProps) {
  return (
    <div style={fieldWrapper}>
      <label style={fieldLabel}>{label}</label>
      {hint && <p style={fieldHint}>{hint}</p>}
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          fontFamily: mono ? font.mono : font.family,
        }}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

// ── Hardware card ─────────────────────────────────────────────────────────────

function HardwareCard({ hw }: { hw: HardwareInfo }) {
  const accelColor: Record<string, string> = {
    cuda:   color.cuda,
    metal:  color.metal,
    vulkan: color.vulkan,
    cpu:    color.cpu,
  };
  const accelLabel: Record<string, string> = {
    cuda:   'CUDA (NVIDIA)',
    metal:  'Metal (Apple Silicon)',
    vulkan: 'Vulkan (AMD/Intel)',
    cpu:    'CPU only',
  };

  const rows: [string, string][] = [
    ['Acceleration', accelLabel[hw.acceleration] ?? hw.acceleration],
    ...(hw.gpuName ? [['GPU', hw.gpuName] as [string, string]] : []),
    ...(hw.vramMB  ? [['VRAM', `${hw.vramMB} MB`] as [string, string]] : []),
    ['RAM',  `${hw.ramMB} MB`],
    ['CPU cores', String(hw.cpuCores)],
    ['Platform', hw.platform],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {rows.map(([k, v]) => (
        <div key={k} style={hwRow}>
          <span style={{ color: color.textDim, fontSize: font.small }}>{k}</span>
          <span style={{
            color: k === 'Acceleration' ? accelColor[hw.acceleration] ?? color.textPrimary : color.textPrimary,
            fontSize: font.small,
            fontFamily: font.mono,
          }}>
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
