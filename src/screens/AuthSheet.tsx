import { useState, useEffect } from 'react';
import type { Theme } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';
import { linkEmail, confirmEmailChange, signInWithEmail, confirmSignIn } from '../lib/supabase';

interface AuthSheetProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  mode: 'link' | 'signin';
  onClose: () => void;
  onSuccess: (result: { userId?: string }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapError(msg: string, t: AuthSheetProps['t']): string {
  console.error('[dosi] auth error:', msg);
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('exists')) return t('authErrExists');
  if (m.includes('signups not allowed') || m.includes('not found') || m.includes('user not found')) return t('authErrNoAccount');
  if (m.includes('rate') || m.includes('429') || m.includes('too many') || m.includes('only request this after') || m.includes('over_email_send_rate_limit')) return t('authErrRate');
  if (m.includes('network') || m.includes('fetch') || m.includes('session missing') || m.includes('load failed') || m.includes('iso-8859')) return t('authErrNetwork');
  if (m.includes('otp') || m.includes('token') || m.includes('expired') || (m.includes('invalid') && m.includes('code'))) return t('authErrCode');
  return t('authErrGeneric');
}

export default function AuthSheet({ theme, t, mode, onClose, onSuccess }: AuthSheetProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const title = mode === 'link' ? t('authLinkTitle') : t('authSigninTitle');
  const sub = mode === 'link' ? t('authLinkSub') : t('authSigninSub');

  async function sendCode() {
    setErr('');
    if (!EMAIL_RE.test(email.trim())) { setErr(t('authErrInvalidEmail')); return; }
    setBusy(true);
    try {
      if (mode === 'link') await linkEmail(email.trim());
      else await signInWithEmail(email.trim());
      setStep('code');
      setCooldown(60);
    } catch (e) {
      setErr(mapError((e as Error).message, t));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setErr('');
    if (code.trim().length < 6) { setErr(t('authErrCode')); return; }
    setBusy(true);
    try {
      if (mode === 'link') {
        await confirmEmailChange(email.trim(), code.trim());
        onSuccess({});
      } else {
        const userId = await confirmSignIn(email.trim(), code.trim());
        onSuccess({ userId });
      }
    } catch (e) {
      setErr(mapError((e as Error).message, t));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 52, background: theme.surface, color: theme.text,
    border: `1px solid ${theme.borderStrong}`, borderRadius: 14, padding: '0 16px',
    fontSize: 16, fontWeight: 500, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end', animation: 'dosi-fade .2s',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.text,
        borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '90%', overflowY: 'auto',
        animation: 'dosi-sheet .35s cubic-bezier(.2,.9,.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: theme.borderStrong }} />
        </div>
        <div style={{ padding: '4px 24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 8 }}>
            <div style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 28, fontWeight: 500, letterSpacing: -0.6, lineHeight: 1.1,
            }}>{title}</div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: 12, background: theme.surface2,
              border: 0, color: theme.text, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.close(18, theme.text)}</button>
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.45, marginBottom: 20 }}>{sub}</div>

          {step === 'email' ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textDim, marginBottom: 8 }}>{t('authEmailLabel')}</div>
              <input
                type="email" inputMode="email" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('authEmailPlaceholder')} style={inputStyle}
              />
              {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ height: 16 }} />
              <Btn theme={theme} kind="primary" size="md" full disabled={busy} onClick={sendCode}>
                {t('authSendCode')}
              </Btn>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.textDim, marginBottom: 8 }}>{t('authCodeLabel')}</div>
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
              />
              {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ height: 16 }} />
              <Btn theme={theme} kind="primary" size="md" full disabled={busy} onClick={confirm}>
                {t('authConfirm')}
              </Btn>
              <button
                disabled={cooldown > 0 || busy}
                onClick={sendCode}
                style={{
                  marginTop: 12, width: '100%', background: 'transparent', border: 0,
                  color: cooldown > 0 ? theme.textSoft : theme.accent, fontFamily: 'inherit',
                  fontSize: 13.5, fontWeight: 600, cursor: cooldown > 0 ? 'default' : 'pointer',
                }}
              >
                {cooldown > 0 ? t('authResendIn', { n: cooldown }) : t('authResend')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
