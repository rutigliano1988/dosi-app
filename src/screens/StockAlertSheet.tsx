import React from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine } from '../data/types';
import { I } from '../icons';
import Btn from '../components/Btn';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  med: Medicine;
  onClose: () => void;
  onRefill: () => void;
  onRemind: () => void;
}

export default function StockAlertSheet({ theme, t, lang, med, onClose, onRefill, onRemind }: Props) {
  const dosesPerDay = med.schedule.times.length;
  const daysLeft = Math.floor(med.stock / dosesPerDay);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 150,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'dosi-fade .2s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: theme.surface, color: theme.text,
          borderTopLeftRadius: 32, borderTopRightRadius: 32,
          padding: '14px 24px 36px',
          animation: 'dosi-sheet .35s cubic-bezier(.2,.9,.3,1)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: theme.borderStrong, margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 14,
            background: theme.warnSoft, color: theme.warn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {I.alert(26, theme.warn)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 26, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1.1,
            }}>
              {t('alertTitle')}
            </div>
            <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2 }}>{med.name}</div>
          </div>
        </div>
        <div style={{ fontSize: 15, color: theme.text, lineHeight: 1.5, marginBottom: 18 }}>
          {t('alertBody')
            .replace('{n}', String(med.stock))
            .replace('{form}', lang === 'es' ? 'pastillas' : 'pills')
            .replace('{name}', med.name)
            .replace('{days}', String(daysLeft))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn theme={theme} kind="secondary" size="md" onClick={onRemind} style={{ flex: 1 }}>
            {t('remindLater')}
          </Btn>
          <Btn theme={theme} kind="primary" size="md" onClick={onRefill} style={{ flex: 1 }}>
            {t('addRefill')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
