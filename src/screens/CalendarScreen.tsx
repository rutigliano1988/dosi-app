import { useState, useMemo } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { tArr } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
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
  doses: Dose[];         // today's live doses
  historyDoses: Dose[];  // last 7 days from Supabase (have .date field)
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildWeek() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
}

export default function CalendarScreen({ theme, t, lang, meds, doses, historyDoses }: Props) {
  const [mode, setMode] = useState('week');
  const todayStr = useMemo(() => isoDate(new Date()), []);
  const week = useMemo(buildWeek, []);
  const todayIdx = 6; // last item is always today
  const [selected, setSelected] = useState(todayIdx);
  const days = tArr(lang, 'daysShort');

  // Get doses for a specific date
  function dosesForDate(dateStr: string): Dose[] {
    if (dateStr === todayStr) return doses;
    return historyDoses.filter(d => d.date === dateStr);
  }

  // Build per-day adherence data
  const weekData = useMemo(() => week.map(d => {
    const dateStr = isoDate(d);
    const dayDoses = dosesForDate(dateStr);
    const isFuture = dateStr > todayStr;
    const taken = dayDoses.filter(d => d.status === 'taken').length;
    const total = isFuture ? 0 : dayDoses.filter(d => d.status !== 'upcoming').length;
    return { date: d, dateStr, taken, total, isFuture };
  }), [week, doses, historyDoses, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weekly adherence summary
  const weekTotals = useMemo(() => {
    const taken = weekData.reduce((acc, d) => acc + d.taken, 0);
    const total = weekData.reduce((acc, d) => acc + d.total, 0);
    return { taken, total, pct: total > 0 ? taken / total : 0 };
  }, [weekData]);

  // Timeline for selected day
  const selectedDateStr = isoDate(week[selected]);
  const selectedDoses = dosesForDate(selectedDateStr);

  const monthNames = lang === 'es'
    ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    : ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function dayLabel(d: Date) {
    const isToday = isoDate(d) === todayStr;
    const num = d.getDate();
    const mon = monthNames[d.getMonth()];
    if (isToday) return lang === 'es' ? `${num} ${mon} · hoy` : `${num} ${mon} · today`;
    return `${num} ${mon}`;
  }

  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar theme={theme} title={t('calendarTitle')} />

      <div style={{ padding: '0 16px 16px' }}>
        <SegmentedRow
          theme={theme} value={mode} onChange={setMode}
          options={[{ id: 'week', label: t('week') }, { id: 'month', label: t('month') }]}
        />
      </div>

      {mode === 'week' ? (
        <>
          {/* Week strip */}
          <div style={{ padding: '0 16px 16px' }}>
            <Card theme={theme} style={{ padding: '16px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {week.map((d, i) => {
                  const wd = weekData[i];
                  const pct = wd.total > 0 ? wd.taken / wd.total : 0;
                  const sel = selected === i;
                  return (
                    <button key={i} onClick={() => setSelected(i)} style={{
                      width: 40, padding: '6px 4px', borderRadius: 14, border: 0,
                      background: sel ? theme.accent : 'transparent',
                      color: sel ? theme.accentText : theme.text,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.7 }}>
                        {days[(d.getDay() + 6) % 7]}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {d.getDate()}
                      </div>
                      <div>
                        {wd.isFuture ? (
                          <div style={{
                            width: 8, height: 8, borderRadius: 4,
                            background: sel ? 'rgba(0,0,0,0.2)' : theme.borderStrong,
                          }} />
                        ) : wd.total === 0 ? (
                          <div style={{
                            width: 8, height: 8, borderRadius: 4,
                            background: sel ? 'rgba(0,0,0,0.15)' : theme.border,
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

          {/* Weekly adherence summary */}
          <div style={{ padding: '0 16px 16px' }}>
            <Card theme={theme} style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <ProgressRing theme={theme} value={weekTotals.pct} size={72} color={theme.success} />
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
                    {weekTotals.total > 0 ? Math.round(weekTotals.pct * 100) : '--'}%
                  </div>
                  <div style={{ fontSize: 12.5, color: theme.textDim }}>
                    {weekTotals.taken} / {weekTotals.total} {lang === 'es' ? 'dosis · esta semana' : 'doses · this week'}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Day timeline */}
          <SectionList theme={theme} title={dayLabel(week[selected])}>
            {selectedDoses.length === 0 ? (
              <div style={{
                padding: '24px 16px', textAlign: 'center',
                color: theme.textDim, fontSize: 14,
              }}>
                {lang === 'es' ? 'Sin dosis registradas' : 'No doses recorded'}
              </div>
            ) : (
              selectedDoses.map((dose, i) => {
                const med = meds.find(m => m.id === dose.medId);
                if (!med) return null;
                const stKind = dose.status === 'taken' ? 'success'
                  : dose.status === 'skipped' ? 'danger'
                  : 'neutral';
                const stLabel = dose.status === 'taken' ? t('legendDone')
                  : dose.status === 'skipped' ? (lang === 'es' ? 'Omitida' : 'Skipped')
                  : t('legendPending');
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
                      {dose.time}
                    </div>
                    <PillGlyph color={med.color} size={36} form={med.form} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: theme.text }}>{med.name}</div>
                      <div style={{ fontSize: 12.5, color: theme.textDim }}>{med.dose}</div>
                    </div>
                    <Badge theme={theme} kind={stKind as 'success' | 'neutral' | 'danger'}>
                      {stLabel}
                    </Badge>
                  </div>
                );
              })
            )}
          </SectionList>
        </>
      ) : (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          color: theme.textDim,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: theme.text, marginBottom: 6 }}>
            {lang === 'es' ? 'Vista mensual próximamente' : 'Monthly view coming soon'}
          </div>
          <div style={{ fontSize: 14 }}>
            {lang === 'es' ? 'Por ahora usa la vista semanal' : 'Use the weekly view for now'}
          </div>
        </div>
      )}
    </div>
  );
}
