import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';

type SubmitResult = 'ok' | 'bad-code' | 'self' | 'no-push' | 'network';

interface CaregiverSheetProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  mode: 'show' | 'enter';
  code?: string;
  expiresAt?: string | null;
  onClose: () => void;
  onRegenerate?: () => void;
  onCancelCode?: () => void;
  onSubmitCode?: (code: string) => Promise<SubmitResult>;
}

export default function CaregiverSheet({
  theme, t, mode, code, expiresAt, onClose, onRegenerate, onCancelCode, onSubmitCode,
}: CaregiverSheetProps) {
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const secBtn: React.CSSProperties = {
    flex: 1, background: 'transparent', border: `1px solid ${theme.border}`,
    color: theme.text, borderRadius: 12, padding: '10px 0',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };

  const hoursLeft = expiresAt
    ? Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000))
    : 0;
  const expired = Boolean(expiresAt) && hoursLeft <= 0;

  const share = async () => {
    if (!code) return;
    try {
      if (navigator.share) { await navigator.share({ title: 'Dosi', text: code }); return; }
    } catch { /* cancelado */ }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* nada */ }
  };

  const submit = async () => {
    if (!onSubmitCode) return;
    setErr('');
    const c = entry.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 6) { setErr(t('cgErrBadCode')); return; }
    setBusy(true);
    try {
      const r = await onSubmitCode(c);
      if (r === 'ok') { onClose(); return; }
      setErr(t(r === 'self' ? 'cgErrSelf' : r === 'no-push' ? 'cgErrNoPush' : r === 'network' ? 'cgErrNetwork' : 'cgErrBadCode'));
    } finally {
      setBusy(false);
    }
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
            }}>
              {mode === 'show' ? t('cgShareTitle') : t('cgEnterTitle')}
            </div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: 12, background: theme.surface2,
              border: 0, color: theme.text, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.close(18, theme.text)}</button>
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.45, marginBottom: 20 }}>
            {mode === 'show' ? t('cgShareBody') : t('cgEnterBody')}
          </div>

          {mode === 'show' ? (
            <>
              <div style={{
                textAlign: 'center', fontSize: 34, fontWeight: 800, letterSpacing: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: expired ? theme.textSoft : theme.text, padding: '12px 0 6px',
              }}>
                {code}
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: expired ? theme.danger : theme.textDim, marginBottom: 18 }}>
                {expired ? t('cgExpired') : t('cgExpiresIn', { h: hoursLeft })}
              </div>
              <Btn theme={theme} kind="primary" size="md" full onClick={share}>
                {copied ? t('cgCopied') : t('cgShareBtn')}
              </Btn>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={onRegenerate} style={secBtn}>{t('cgRegen')}</button>
                <button onClick={onCancelCode} style={{ ...secBtn, color: theme.danger }}>{t('cgCancelCode')}</button>
              </div>
            </>
          ) : (
            <>
              <input
                autoFocus inputMode="text" autoCapitalize="characters" maxLength={8}
                value={entry}
                onChange={e => setEntry(e.target.value.toUpperCase())}
                placeholder={t('cgEnterPlaceholder')}
                style={{
                  width: '100%', height: 52, background: theme.surface, color: theme.text,
                  border: `1px solid ${theme.borderStrong}`, borderRadius: 14, padding: '0 16px',
                  fontSize: 20, fontWeight: 700, letterSpacing: 4, textAlign: 'center',
                  fontFamily: 'ui-monospace, monospace', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{err}</div>}
              <div style={{ height: 16 }} />
              <Btn theme={theme} kind="primary" size="md" full disabled={busy || entry.replace(/[^A-Za-z0-9]/g, '').length < 6} onClick={submit}>
                {t('cgAccept')}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
