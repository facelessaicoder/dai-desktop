/**
 * Welcome / first-launch panel.
 *
 * Shown when the user has no Dataspheres API key configured. Three sign-in
 * paths:
 *   1. Email + password — POST /api/auth/login, store returned token.
 *   2. Continue with Google — opens browser to /api/auth/google with a
 *      dataspheres:// callback. Once the deep-link arrives, store token.
 *   3. "I have a developer API key" — falls back to Settings panel
 *      for the manual paste-API-key flow.
 *
 * The primary path is email+password (works today, no backend changes).
 * Google is one click but depends on Dataspheres NextAuth accepting our
 * custom-scheme callbackUrl — may surface an error if not allowlisted.
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

interface WelcomeError {
  message: string;
  /** When set, show "Test connection" affordance — these are connectivity/server errors */
  isConnectivity?: boolean;
}

export function WelcomePanel({ onSignedIn, onUseDeveloperKey }: WelcomeProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'google'>(null);
  const [error, setError] = useState<WelcomeError | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<string | null>(null);

  // Show the environment we're talking to (dev vs prod). Useful for
  // "no network traffic" debugging — confirms whether the app is even
  // pointed at the server you expect.
  useEffect(() => {
    window.dai.auth.getBaseUrl().then(setBaseUrl).catch(() => {});
  }, []);

  // Listen for the deep-link return from the OAuth flow (Google path)
  useEffect(() => {
    const unsub = window.dai.deepLink.onUrl(async (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.host !== 'auth' && parsed.pathname !== '/auth') return;
        const token = parsed.searchParams.get('token');
        if (!token) {
          setError('No token returned from sign-in. Try again.');
          setBusy(null);
          return;
        }
        await window.dai.settings.set('cloudApiKey', token);
        onSignedIn();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(null);
      }
    });
    return unsub;
  }, [onSignedIn]);

  const signInWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConnResult(null);
    if (!email.trim()) {
      setError({ message: 'Enter your email.' });
      return;
    }
    if (!password) {
      setError({ message: 'Enter your password.' });
      return;
    }
    setBusy('email');
    console.log('[welcome] signing in with email…');
    const res = await window.dai.auth.loginEmail(email.trim(), password);
    if (res.error || !res.token) {
      console.warn('[welcome] sign-in failed:', res.error);
      // Connectivity-flavored failures get the "Test connection" affordance
      const isConn = res.code === 'timeout' || res.code === 'dns' || res.code === 'refused' || res.code === 'reset' || res.code === 'tls' || res.code === 'network';
      setError({ message: res.error || 'Sign-in failed.', isConnectivity: isConn });
      setBusy(null);
      return;
    }
    console.log(`[welcome] sign-in success (isSessionToken=${res.isSessionToken === true})`);
    if (res.isSessionToken) {
      // No fatal — but warn so user knows why cloud features might be flaky
      console.warn('[welcome] using NextAuth session token (no API key returned). Some cloud features may not work until the server-side desktop-key endpoint is wired up.');
    }
    await window.dai.settings.set('cloudApiKey', res.token);
    onSignedIn();
  };

  const signInWithGoogle = async () => {
    setError(null);
    setConnResult(null);
    setBusy('google');
    const res = await window.dai.auth.loginGoogle();
    if (res.error) {
      setError({ message: `Couldn't open browser: ${res.error}` });
      setBusy(null);
    }
    // Else: wait for deep-link callback (handled in the useEffect above).
  };

  const cancelSignIn = () => {
    setBusy(null);
    setError({ message: 'Sign-in cancelled.' });
  };

  const testConnection = async () => {
    setTestingConn(true);
    setConnResult(null);
    const res = await window.dai.auth.testConnection();
    setTestingConn(false);
    if (res.ok) {
      setConnResult(`✓ Reached ${baseUrl.replace(/^https?:\/\//, '')} in ${res.ms}ms.`);
    } else {
      setConnResult(`✗ ${res.message ?? `Unreachable (${res.code ?? 'unknown'})`}`);
    }
  };

  // Full-screen loading overlay while a sign-in attempt is in flight.
  // Sign-in can take several seconds (network + token exchange).
  if (busy !== null) {
    return (
      <div style={shell}>
        <div style={inner}>
          <motion.img
            src="./icon.png"
            alt="Dataspheres AI"
            width={96}
            height={96}
            draggable={false}
            style={{ display: 'block', marginBottom: space[3] }}
            animate={{
              filter: [
                `drop-shadow(0 0 16px ${color.accentDim})`,
                `drop-shadow(0 0 40px ${color.accent})`,
                `drop-shadow(0 0 16px ${color.accentDim})`,
              ],
              scale: [1, 1.05, 1],
            }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <h2 style={loadingTitle}>
            {busy === 'email' ? 'Signing you in…' : 'Waiting for browser…'}
          </h2>
          <p style={loadingSub}>
            {busy === 'email'
              ? `Verifying your credentials with ${baseUrl.replace(/^https?:\/\//, '') || 'Dataspheres AI'}.`
              : 'Finish signing in in your browser. We’ll bring you back here automatically.'}
          </p>
          <button onClick={cancelSignIn} style={cancelLink}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={inner}>
        <motion.img
          src="./icon.png"
          alt="Dataspheres AI"
          width={96}
          height={96}
          draggable={false}
          style={{ display: 'block', marginBottom: space[2] }}
          animate={{ filter: [`drop-shadow(0 0 16px ${color.accentDim})`, `drop-shadow(0 0 32px ${color.accentDim})`, `drop-shadow(0 0 16px ${color.accentDim})`] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        <h1 style={title}>Welcome to Dataspheres AI</h1>
        <p style={subtitle}>
          Sign in to access your workspaces. Your code never leaves this machine.
        </p>

        {error && (
          <div style={errorBox} role="alert">
            <div>{error.message}</div>
            {error.isConnectivity && (
              <button
                style={errorAction}
                onClick={testConnection}
                disabled={testingConn}
              >
                {testingConn ? 'Testing…' : 'Test connection'}
              </button>
            )}
          </div>
        )}
        {connResult && <div style={connStatus} role="status">{connResult}</div>}

        <form style={form} onSubmit={signInWithEmail}>
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy !== null}
            style={input}
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy !== null}
            style={input}
            required
          />
          <motion.button
            type="submit"
            style={primaryBtn}
            disabled={busy !== null}
            whileHover={busy ? {} : { filter: 'brightness(1.1)' }}
            whileTap={busy ? {} : { scale: 0.98 }}
            transition={spring.snappy}
          >
            {busy === 'email' ? 'Signing in…' : 'Sign in'}
          </motion.button>
        </form>

        <div style={dividerRow}>
          <div style={dividerLine} />
          <div style={dividerText}>or</div>
          <div style={dividerLine} />
        </div>

        <motion.button
          style={secondaryBtn}
          onClick={signInWithGoogle}
          disabled={busy !== null}
          whileHover={busy ? {} : { background: color.surfaceHover }}
          whileTap={busy ? {} : { scale: 0.98 }}
          transition={spring.snappy}
        >
          <GoogleGlyph />
          <span>{busy === 'google' ? 'Waiting for browser…' : 'Continue with Google'}</span>
        </motion.button>

        <button style={fallbackLink} onClick={onUseDeveloperKey} disabled={busy !== null}>
          I have a developer API key
        </button>

        <div style={footnote}>
          <div>Don't have an account?</div>
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
        </div>

        {baseUrl && (
          <div style={envBadge} title="Set DATASPHERES_BASE_URL or settings.dataspheres_base_url to change.">
            connected to <span style={envHost}>{baseUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Google 'G' mark (official multi-color glyph) ─────────────────────────────
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
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
  gap: space[3],
  width: '100%',
  // Wide enough to fit "Welcome to Dataspheres AI" on one line at the
  // display font size. Form children still constrained to a sensible
  // width via inputWidth (~360 inside this 440 container).
  maxWidth: 440,
  padding: space[6],
};

const title: React.CSSProperties = {
  fontSize: font.display,
  fontWeight: font.light,
  color: color.textPrimary,
  margin: 0,
  whiteSpace: 'nowrap',
};

const subtitle: React.CSSProperties = {
  fontSize: font.body,
  color: color.textDim,
  lineHeight: 1.5,
  margin: 0,
  marginBottom: space[2],
};

const form: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  width: '100%',
};

const input: React.CSSProperties = {
  padding: `${space[3]} ${space[4]}`,
  fontSize: font.body,
  color: color.textPrimary,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  outline: 'none',
  width: '100%',
};

const primaryBtn: React.CSSProperties = {
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
  marginTop: space[1],
};

const dividerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  width: '100%',
  margin: `${space[1]} 0`,
};

const dividerLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: color.border,
};

const dividerText: React.CSSProperties = {
  fontSize: font.small,
  color: color.textMuted,
};

const secondaryBtn: React.CSSProperties = {
  padding: `${space[3]} ${space[6]}`,
  fontSize: font.body,
  fontWeight: font.medium,
  color: color.textPrimary,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  cursor: 'pointer',
  width: '100%',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[2],
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
  marginTop: space[4],
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[1],
};

const footLink: React.CSSProperties = {
  color: color.modeVibe,
  textDecoration: 'underline',
  cursor: 'pointer',
};

const loadingTitle: React.CSSProperties = {
  fontSize: font.heading,
  fontWeight: font.light,
  color: color.textPrimary,
  margin: 0,
  marginBottom: space[2],
};

const loadingSub: React.CSSProperties = {
  fontSize: font.body,
  color: color.textDim,
  lineHeight: 1.5,
  margin: 0,
  textAlign: 'center',
  maxWidth: 320,
  marginBottom: space[4],
};

const cancelLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: color.textDim,
  fontSize: font.small,
  cursor: 'pointer',
  padding: space[2],
  textDecoration: 'underline',
};

const errorAction: React.CSSProperties = {
  marginTop: space[2],
  padding: `${space[1]} ${space[3]}`,
  background: 'transparent',
  border: `1px solid ${color.danger}`,
  borderRadius: 6,
  color: color.textPrimary,
  fontSize: font.small,
  cursor: 'pointer',
};

const connStatus: React.CSSProperties = {
  width: '100%',
  padding: space[2],
  fontSize: font.small,
  color: color.textDim,
  textAlign: 'left',
  fontFamily: font.mono,
};

// Tiny "connected to dev.dataspheres.ai" line at the bottom of the welcome
// screen. Useful for telling at a glance which environment the app is
// pointed at — critical for debugging "I logged in and nothing happened."
const envBadge: React.CSSProperties = {
  position: 'fixed',
  bottom: 12,
  right: 16,
  fontSize: font.micro,
  color: color.textMuted,
  fontFamily: font.mono,
};

const envHost: React.CSSProperties = {
  color: color.modeVibe,
};
