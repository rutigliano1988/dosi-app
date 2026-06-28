import { useEffect, useRef } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import { I } from '../icons';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  med: Medicine;
  dose: Dose;
  onClose: () => void;
  onTake: () => void;
  onSnooze: () => void;
  onSkip: () => void;
}

export default function NotificationToast({ theme, t, lang, med, dose, onClose, onTake, onSnooze, onSkip }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.style.transform = 'translateY(0)';
        ref.current.style.opacity = '1';
      }
    });
  }, []);

  const glassBg = theme.dark
    ? 'rgba(40,34,26,0.92)'
    : 'rgba(255,253,248,0.96)';

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 60, left: 10, right: 10, zIndex: 100,
      transform: 'translateY(-30px)', opacity: 0,
      transition: 'transform .35s cubic-bezier(.2,.8,.3,1), opacity .35s',
    }}>
      <div style={{
        background: glassBg,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRadius: 22, border: `1px solid ${theme.borderStrong}`,
        padding: 14,
        boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: theme.accent, color: theme.accentText,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {I.bell(20, theme.accentText)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.text, letterSpacing: 0.2 }}>
              <span style={{ textTransform: 'uppercase' }}>{t('appName')}</span>
              <span style={{ color: theme.textSoft, fontWeight: 500 }}> Â· {lang === 'es' ? 'ahora' : 'now'}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, marginTop: 2 }}>
              {t('notifTitle')}
            </div>
            <div style={{ fontSize: 13, color: theme.textDim, marginTop: 1 }}>
              {med.name} Â· {med.dose} Â· {dose.time}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 0, color: theme.textSoft, cursor: 'pointer',
          }}>
            {I.close(18, theme.textSoft)}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onTake} style={{
            flex: 2, height: 38, borderRadius: 11, border: 0, fontFamily: 'inherit',
            background: theme.accent, color: theme.accentText, fontWeight: 700, cursor: 'pointer', fontSize: 13.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {I.check(16, theme.accentText)} {t('notifTake')}
          </button>
          <button onClick={onSnooze} style={{
            flex: 1, height: 38, borderRadius: 11,
            background: theme.surface2, color: theme.text,
            border: `1px solid ${theme.border}`, fontFamily: 'inherit',
            fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>
            {t('notifSnooze')}
          </button>
          <button onClick={onSkip} style={{
            flex: 1, height: 38, borderRadius: 11,
            background: 'transparent', color: theme.textDim,
            border: `1px solid ${theme.border}`, fontFamily: 'inherit',
            fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>
            {t('notifSkip')}
          </button>
        </div>
      </div>
    </div>
  );
}
