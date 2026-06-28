import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { tArr } from '../i18n/strings';
import type { Medicine } from '../data/types';
import { INITIAL_MEDS } from '../data/mock';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import SectionList from '../components/SectionList';
import ProgressRing from '../components/ProgressRing';
import SegmentedRow from '../components/SegmentedRow';
import Badge from '../components/Badge';
import PillGlyph from '../components/PillGlyph';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  meds: Medicine[];
}

const WEEK_DATA = [
  { d: 1, dones: 4, total: 5 },
  { d: 2, dones: 5, total: 5 },
  { d: 3, dones: 3, total: 5 },
  { d: 4, dones: 5, total: 5 },
  { d: 5, dones: 5, total: 5 },
  { d: 6, dones: 0, total: 5 },
  { d: 7, dones: 0, total: 5 },
];
const TODAY_IDX = 4;

const TIMELINE = [
  { time: '07:00', medId: 'lev', status: 'taken' as const },
  { time: '07:30', medId: 'omep', status: 'taken' as const },
  { time: '08:00', medId: 'amox', status: 'taken' as const },
  { time: '12:00', medId: 'iron', status: 'taken' as const },
  { time: '14:00', medId: 'amox', status: 'taken' as const },
  { time: '20:00', medId: 'amox', status: 'pending' as const },
  { time: '22:30', medId: 'mela', status: 'pending' as const },
];

export default function CalendarScreen({ theme, t, lang, meds }: Props) {
  const [mode, setMode] = useState('week');
  const [selected, setSelected] = useState(TODAY_IDX);
  const days = tArr(lang, 'daysShort');

  const allMeds = meds.length > 0 ? meds : INITIAL_MEDS;

  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar theme={theme} title={t('calendarTitle')} />

      <div style={{ padding: '0 16px 16px' }}>
        <SegmentedRow theme={theme} value={mode} onChange={setMode}
          options={[{ id: 'week', label: t('week') }, { id: 'month', label: t('month') }]}
        />
      </div>

      {/* Week strip */}
      <div style={{ padding: '0 16px 16px' }}>
        <Card theme={theme} style={{ padding: '16px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {days.map((d, i) => {
              const w = WEEK_DATA[i];
              const pct = w.total ? w.dones / w.total : 0;
              const sel = selected === i;
              const future = i > TODAY_IDX;
              return (
                <button key={i} onClick={() => setSelected(i)} style={{
                  width: 40, padding: '6px 4px', borderRadius: 14, border: 0,
                  background: sel ? theme.accent : 'transparent',
                  color: sel ? theme.accentText : theme.text,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.7 }}>{d}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {w.d + 11}
                  </div>
                  <div>
                    {future ? (
                      <div style={{
                        width: 8, height: 8, borderRadius: 4,
                        background: sel ? 'rgba(0,0,0,0.2)' : theme.borderStrong,
                      }} />
                    ) : (
                      <ProgressRing
                        theme={theme} value={pct} size={22} stroke={3}
                        color={sel ? (theme.dark ? '#1c1812' : '#fff') : theme.success}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Adherence summary */}
      <div style={{ padding: '0 16px 16px' }}>
        <Card theme={theme} style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ProgressRing theme={theme} value={0.86} size={72} color={theme.success} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 12.5, color: theme.textDim, fontWeight: 700,
                letterSpacing: 0.4, textTransform: 'uppercase',
              }}>
                {t('adherence')}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 700, color: theme.text, letterSpacing: -0.4,
                fontFamily: '"Instrument Serif", Georgia, serif',
              }}>
                86%
              </div>
              <div style={{ fontSize: 12.5, color: theme.textDim }}>
                22 / 25 dosis Â· {lang === 'es' ? 'esta semana' : 'this week'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Day timeline */}
      <SectionList theme={theme} title={lang === 'es' ? 'Jueves 15 Â· hoy' : 'Thu 15 Â· today'}>
        {TIMELINE.map((e, i) => {
          const m = allMeds.find(x => x.id === e.medId);
          if (!m) return null;
          const stKind = e.status === 'taken' ? 'success' : 'neutral';
          return (
            <div key={i} style={{
              background: theme.surface, borderRadius: 16,
              border: `1px solid ${theme.border}`,
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 50, fontSize: 13, fontWeight: 700,
                color: theme.text, fontVariantNumeric: 'tabular-nums',
              }}>
                {e.time}
              </div>
              <PillGlyph color={m.color} size={36} form={m.form} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: theme.text }}>{m.name}</div>
                <div style={{ fontSize: 12.5, color: theme.textDim }}>{m.dose}</div>
              </div>
              <Badge theme={theme} kind={stKind as 'success' | 'neutral'}>
                {e.status === 'taken' ? t('legendDone') : t('legendPending')}
              </Badge>
            </div>
          );
        })}
      </SectionList>
    </div>
  );
}
