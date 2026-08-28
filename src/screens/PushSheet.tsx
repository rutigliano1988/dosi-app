import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';
import { needsInstallFirst } from '../lib/push';

type EnableResult = 'ok' | 'denied' | 'unsupported' | 'needs-install' | 'error';

interface PushSheetProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
  onEnable: () => Promise<EnableResult>;
}

export default function PushSheet({ theme, t, onClose, onEnable }: PushSheetProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const install = needsInstallFirst();

  const handleEnable = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await onEnable();
      if (r === 'ok') { onClose(); return; }
      if (r === 'needs-install') { setErr(t('pushInstallBody')); return; }
      if (r === 'denied') { setErr(t('pushDenied')); return; }
      if (r === 'unsupported') { setErr(t('pushUnsupported')); return; }
      setErr(t('pushErrorGeneric'));
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
              {install ? t('pushInstallTitle') : t('pushSheetTitle')}
            </div>
            <button onClick={onClose} style={{
              width: 36, height: 36, borderRadius: 12, background: theme.surface2,
              border: 0, color: theme.text, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{I.close(18, theme.text)}</button>
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, lineHeight: 1.45, marginBottom: 20 }}>
            {install ? t('pushInstallBody') : t('pushSheetBody')}
          </div>

          {err && <div style={{ color: theme.danger, fontSize: 13, marginBottom: 12 }}>{err}</div>}

          {install ? (
            <Btn theme={theme} kind="primary" size="md" full onClick={onClose}>
              {t('pushInstallGotIt')}
            </Btn>
          ) : (
            <>
              <Btn theme={theme} kind="primary" size="md" full disabled={busy} onClick={handleEnable}>
                {t('pushSheetEnable')}
              </Btn>
              <button
                onClick={onClose}
                style={{
                  marginTop: 12, width: '100%', background: 'transparent', border: 0,
                  color: theme.textDim, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('pushSheetLater')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
