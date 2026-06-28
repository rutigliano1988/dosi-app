import React, { useEffect } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine } from '../data/types';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  med: Medicine;
  time: string;
  onDone: () => void;
}

export default function ConfirmTakenOverlay({ theme, t, med, time, onDone }: Props) {
  useEffect(() => {
    const tm = setTimeout(onDone, 1700);
    return () => clearTimeout(tm);
  }, [onDone]);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'dosi-fade .25s',
    }}>
      <div style={{
        background: theme.surface, color: theme.text,
        borderRadius: 28, padding: '28px 30px',
        width: 240, textAlign: 'center',
        animation: 'dosi-pop .4s cubic-bezier(.2,1.4,.4,1)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          width: 78, height: 78, borderRadius: '50%',
          background: theme.successSoft, margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme.success, position: 'relative',
        }}>
          <svg width="78" height="78" style={{ position: 'absolute', inset: 0 }}>
            <circle cx="39" cy="39" r="35" fill="none" stroke={theme.success} strokeWidth="3"
              strokeDasharray="220" strokeDashoffset="220" strokeLinecap="round"
              style={{ animation: 'dosi-ring 0.6s 0.1s forwards' }}
            />
          </svg>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5L10 17.5 19 7" stroke={theme.success} strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="40" strokeDashoffset="40"
              style={{ animation: 'dosi-check .35s 0.55s forwards' }}
            />
          </svg>
        </div>
        <div style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 26, fontWeight: 500, color: theme.text, letterSpacing: -0.4,
        }}>
          {t('confirmTakenTitle')}
        </div>
        <div style={{ fontSize: 13.5, color: theme.textDim, marginTop: 6, lineHeight: 1.4 }}>
          {t('confirmTakenBody').replace('{name}', med.name).replace('{time}', time)}
        </div>
      </div>
    </div>
  );
}
