import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import Badge from './Badge';
import PillGlyph from './PillGlyph';

interface DayTimelineProps {
  theme: Theme;
  t: (k: string) => string;
  lang: Lang;
  meds: Medicine[];
  doses: Dose[];
  emptyText: string;
}

export default function DayTimeline({ theme, t, lang, meds, doses, emptyText }: DayTimelineProps) {
  if (doses.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.textDim, fontSize: 14 }}>
        {emptyText}
      </div>
    );
  }
  return (
    <>
      {doses.map((dose, i) => {
        const med = meds.find((m) => m.id === dose.medId);
        if (!med) return null;
        const stKind = dose.status === 'taken' ? 'success'
          : dose.status === 'skipped' ? 'danger'
          : dose.status === 'missed' ? 'danger'
          : 'neutral';
        const stLabel = dose.status === 'taken' ? t('legendDone')
          : dose.status === 'skipped' ? (lang === 'es' ? 'Omitida' : 'Skipped')
          : dose.status === 'missed' ? (lang === 'es' ? 'Perdida' : 'Missed')
          : t('legendPending');
        return (
          <div key={i} style={{
            background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`,
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 50, fontSize: 13, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>
              {dose.time}
            </div>
            <PillGlyph color={med.color} size={36} form={med.form} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: theme.text }}>{med.name}</div>
              <div style={{ fontSize: 12.5, color: theme.textDim }}>{med.dose}</div>
            </div>
            <Badge theme={theme} kind={stKind as 'success' | 'neutral' | 'danger'}>{stLabel}</Badge>
          </div>
        );
      })}
    </>
  );
}
