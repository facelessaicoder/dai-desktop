/**
 * Welcome / first-launch panel.
 *
 * Shown when the user has no Dataspheres API key configured. Offers two
 * paths:
 *   1. "Sign in with Dataspheres AI" — opens the browser to the OAuth
 *      endpoint, which 302s back to dataspheres://auth?token=<jwt>.
 *      Once the deep-link arrives, the token is persisted via
 *      settings:set('cloudApiKey', token) and the app navigates to Chat.
 *   2. "Use developer key" — falls back to Settings panel for the
 *      manual paste-API-key flow (current behavior).
 *
 * The first path is the target user experience. The second is a safety
 * net for power users / when the OAuth endpoint is down.
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { color, font, space, spring } from '@dai-desktop/ui';

interface WelcomeProps {
  /** Called once the user has a valid API key (either via OAuth or manual). */
  onSignedIn: () => void;
  /** Called when the user picks "Use developer key" — switches to Settings. */
  onUseDeveloperKey: () => void;
}

// Override via VITE_DATASPHERES_AUTH_URL build-time env if needed.
const AUTH_URL =
  (typeof process !== 'undefined' && (process as unknown as { env?: { DATASPHERES_AUTH_URL?: string } }).env?.DATASPHERES_AUTH_URL) ||
  'https://dataspheres.ai/auth/desktop?return=dataspheres%3A%2F%2Fauth';

export function WelcomePanel({ onSignedIn, onUseDeveloperKey }: WelcomeProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for the deep-link return from the OAuth flow
  useEffect(() => {
    const unsub = window.dai.deepLink.onUrl(async (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.host !== 'auth' && parsed.pathname !== '/auth') return;
        const token = parsed.searchParams.get('token');
        if (!token) {
          setError('No token in callback URL.');
          setSigningIn(false);
          return;
        }
        await window.dai.settings.set('cloudApiKey', token);
        onSignedIn();
      } catch (err) {
        setError(String(err));
        setSigningIn(false);
      }
    });
    return unsub;
  }, [onSignedIn]);

  const signIn = async () => {
    setError(null);
    setSigningIn(true);
    const res = await window.dai.shell.openExternal(AUTH_URL);
    if (res.error) {
      setError(`Couldn't open browser: ${res.error}`);
      setSigningIn(false);
    }
    // Else: wait for deep-link callback (handled in the useEffect above).
  };

  return (
    <div style={shell}>
      <div style={inner}>
        {/* Logo mark */}
        <motion.div
          style={logoRing}
          animate={{ boxShadow: [`0 0 24px ${color.accentDim}`, `0 0 48px ${color.accentDim}`, `0 0 24px ${color.accentDim}`] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="48" height="48" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="14" cy="14" rx="12" ry="5" stroke={color.accent} strokeWidth="1.2" strokeOpacity="0.5" transform="rotate(-30 14 14)" />
            <circle cx="14" cy="14" r="5.5" fill={color.accent} fillOpacity="0.15" stroke={color.accent} strokeWidth="1.4" />
            <circle cx="14" cy="14" r="2" fill={color.accent} />
          </svg>
        </motion.div>

        <h1 style={title}>Welcome to Dataspheres AI</h1>
        <p style={subtitle}>
          Sign in to access your workspaces. Your code never leaves this machine.
        </p>

        <motion.button
          style={signInBtn}
          onClick={signIn}
          disabled={signingIn}
          whileHover={{ filter: 'brightness(1.1)' }}
          whileTap={{ scale: 0.98 }}
          transition={spring.snappy}
        >
          {signingIn ? 'Waiting for browser sign-in…' : 'Sign in with Dataspheres AI'}
        </motion.button>

        {error && <div style={errorBox}>{error}</div>}

        <button style={fallbackLink} onClick={onUseDeveloperKey}>
          I have a developer API key
        </button>

        <p style={footnote}>
          Don't have an account?{' '}
          <a
            href="#"
            style={footLink}
            onClick={(e) => {
              e.preventDefault();
              window.dai.shell.openExternal('https://dataspheres.ai/signup');
            }}
          >
            Sign up — free tier, no credit card required
          </a>
        </p>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  background: color.base,
};

const inner: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: space[4],
  maxWidth: 420,
  padding: space[6],
};

const logoRing: React.CSSProperties = {
  width: 96,
  height: 96,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: `1px solid ${color.border}`,
  marginBottom: space[2],
};

const title: React.CSSProperties = {
  fontSize: font.display,
  fontWeight: font.light,
  color: color.textPrimary,
  margin: 0,
};

const subtitle: React.CSSProperties = {
  fontSize: font.body,
  color: color.textDim,
  lineHeight: 1.5,
  margin: 0,
  marginBottom: space[2],
};

const signInBtn: React.CSSProperties = {
  padding: `${space[3]} ${space[6]}`,
  fontSize: font.body,
  fontWeight: font.medium,
  color: '#0A1622',
  background: color.accent,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  width: '100%',
  outline: 'none',
};

const fallbackLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  padding: space[2],
  textDecoration: 'underline',
  marginTop: space[2],
};

const errorBox: React.CSSProperties = {
  width: '100%',
  padding: space[3],
  borderRadius: 8,
  background: color.dangerDim,
  border: `1px solid ${color.danger}`,
  color: color.textPrimary,
  fontSize: font.small,
  textAlign: 'left',
};

const footnote: React.CSSProperties = {
  fontSize: font.small,
  color: color.textMuted,
  margin: 0,
  marginTop: space[4],
};

const footLink: React.CSSProperties = {
  color: color.accent,
  textDecoration: 'none',
};
