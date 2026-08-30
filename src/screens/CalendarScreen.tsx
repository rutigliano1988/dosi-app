import { useState, useMemo } from 'react';
import type { JSX } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { tArr } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import { isoDate } from '../lib/schedule';
import { buildAdherence, adherenceLabel } from '../lib/adherence';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import SectionList from '../components/SectionList';
import ProgressRing from '../components/ProgressRing';
import SegmentedRow from '../components/SegmentedRow';
import DayTimeline from '../components/DayTimeline';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  meds: Medicine[];
  doses: Dose[];         // today's live doses
  historyDoses: Dose[];  // last 90 days from Supabase (have .date field)
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

  // Adherencia de la semana (mismo motor que la vista Mes).
  const weekAdh = useMemo(
    () => buildAdherence(meds, historyDoses, isoDate(week[0]), todayStr, new Date()),
    [meds, historyDoses, todayStr], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Timeline for selected day
  const selectedDateStr = isoDate(week[selected]);

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

  // ─── Month view ───
  const [monthOffset, setMonthOffset] = useState(0); // 0 = mes actual, hasta -3
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);

  const monthView = useMemo(() => {
    const base = new Date();
    // Suelo de la ventana de datos: historyDoses sólo cubre 90 días.
    const windowStartISO = isoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 89));
    const first = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDayISO = isoDate(new Date(Math.min(
      new Date(year, month, daysInMonth).getTime(),
      new Date().setHours(0, 0, 0, 0),
    )));
    // Recortar el rango a la ventana de datos: los días previos no reciben
    // entrada en perDay → caen en la rama gris (!da), sin "missed" falsos.
    const fromISO = isoDate(first) > windowStartISO ? isoDate(first) : windowStartISO;
    const summary = buildAdherence(meds, historyDoses, fromISO, lastDayISO, new Date());
    const perDay = new Map(summary.perDay.map(d => [d.date, d]));
    // ¿Se puede retroceder un mes más sin caer en un mes entero sin datos?
    const prevMonthLast = new Date(base.getFullYear(), base.getMonth() + monthOffset, 0);
    const canGoBack = isoDate(prevMonthLast) >= windowStartISO;
    // rejilla: hueco inicial = (isoWeekday(first) - 1), luego 1..daysInMonth
    const lead = ((first.getDay() + 6) % 7);
    const cells: (Date | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
    ];
    return { year, month, cells, perDay, summary, canGoBack, monthLabel: `${monthNames[month]} ${year}` };
  }, [monthOffset, meds, historyDoses, lang]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  const da = weekAdh.perDay[i];
                  const due = da ? da.taken + da.missed + da.skipped : 0;
                  const isFuture = isoDate(d) > todayStr;
                  const sel = selected === i;
                  let dot: JSX.Element;
                  if (isFuture || !da || due === 0) {
                    dot = <div style={{ width: 8, height: 8, borderRadius: 4, background: sel ? 'rgba(0,0,0,0.15)' : theme.border }} />;
                  } else if (da.missed + da.skipped === 0) {
                    dot = <div style={{ width: 9, height: 9, borderRadius: 5, background: sel ? (theme.dark ? '#1c1812' : '#fff') : theme.success }} />;
                  } else {
                    dot = <ProgressRing theme={theme} value={da.taken / due} size={22} stroke={3}
                            color={sel ? (theme.dark ? '#1c1812' : '#fff') : theme.success} showLabel={false} />;
                  }
                  return (
                    <button key={i} onClick={() => setSelected(i)} style={{
                      width: 40, padding: '6px 4px', borderRadius: 14, border: 0,
                      background: sel ? theme.accent : 'transparent',
                      color: sel ? theme.accentText : theme.text,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, opacity: 0.7 }}>{days[(d.getDay() + 6) % 7]}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</div>
                      <div>{dot}</div>
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
                <ProgressRing theme={theme} value={weekAdh.rate ?? 0} size={72} color={theme.success} />
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
                    {weekAdh.rate === null ? '—' : Math.round(weekAdh.rate * 100) + '%'}
                    {weekAdh.rate !== null && (
                      <span style={{ fontSize: 14, fontFamily: 'inherit', color: theme.textDim }}> · {adherenceLabel(weekAdh.rate, lang)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: theme.textDim }}>
                    {weekAdh.skipped} {t('skippedCountLabel')} · {weekAdh.missed} {t('missedCountLabel')} · {weekAdh.taken + weekAdh.missed} {lang === 'es' ? 'dosis · esta semana' : 'doses · this week'}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Day timeline */}
          <SectionList theme={theme} title={dayLabel(week[selected])}>
            <DayTimeline theme={theme} t={t} lang={lang} meds={meds}
              doses={dosesForDate(selectedDateStr)}
              emptyText={lang === 'es' ? 'Sin dosis registradas' : 'No doses recorded'} />
          </SectionList>
        </>
      ) : (
        <>
          {/* Navegación de mes */}
          <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button aria-label={t('monthPrev')} disabled={!monthView.canGoBack}
              onClick={() => { if (monthView.canGoBack) { setMonthOffset(o => o - 1); setSelectedMonthDay(null); } }}
              style={{
                width: 38, height: 38, borderRadius: 12, background: theme.surface,
                border: `1px solid ${theme.border}`, color: theme.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: monthView.canGoBack ? 'pointer' : 'default',
                opacity: monthView.canGoBack ? 1 : 0.35,
              }}>
              {I.back(18, theme.text)}
            </button>
            <div style={{ fontWeight: 700, fontSize: 15, color: theme.text, textTransform: 'capitalize' }}>
              {monthView.monthLabel}
            </div>
            <button aria-label={t('monthNext')} disabled={monthOffset >= 0}
              onClick={() => { setMonthOffset(o => Math.min(0, o + 1)); setSelectedMonthDay(null); }}
              style={{
                width: 38, height: 38, borderRadius: 12, background: theme.surface,
                border: `1px solid ${theme.border}`, color: theme.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: monthOffset >= 0 ? 'default' : 'pointer',
                opacity: monthOffset >= 0 ? 0.35 : 1,
              }}>
              {I.chev(18, theme.text)}
            </button>
          </div>

          {/* Cabecera de días L..D */}
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {tArr(lang, 'daysShort').map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: theme.textDim }}>{d}</div>
            ))}
          </div>

          {/* Rejilla */}
          <div style={{ padding: '6px 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {monthView.cells.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const dISO = isoDate(cell);
              const isFuture = dISO > todayStr;
              const da = monthView.perDay.get(dISO);
              const due = da ? da.taken + da.missed + da.skipped : 0;
              const sel = selectedMonthDay === dISO;
              let dot: JSX.Element;
              if (isFuture || !da || due === 0) {
                dot = <div style={{ width: 7, height: 7, borderRadius: 4, background: theme.border }} />;
              } else if (da.missed + da.skipped === 0) {
                dot = <div style={{ width: 9, height: 9, borderRadius: 5, background: theme.success }} />;
              } else {
                dot = <ProgressRing theme={theme} value={da.taken / due} size={18} stroke={3} color={theme.success} showLabel={false} />;
              }
              return (
                <button key={i} onClick={() => setSelectedMonthDay(sel ? null : dISO)} style={{
                  aspectRatio: '1', borderRadius: 12, border: 0, cursor: 'pointer', fontFamily: 'inherit',
                  background: sel ? theme.accent : 'transparent',
                  color: sel ? theme.accentText : theme.text,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cell.getDate()}</span>
                  {dot}
                </button>
              );
            })}
          </div>

          {/* Resumen del mes visible */}
          <div style={{ padding: '0 16px 16px' }}>
            <Card theme={theme} style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <ProgressRing theme={theme} value={monthView.summary.rate ?? 0} size={64} color={theme.success} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: theme.text, fontFamily: '"Instrument Serif", Georgia, serif' }}>
                    {monthView.summary.rate === null ? '—' : Math.round(monthView.summary.rate * 100) + '%'}
                    {monthView.summary.rate !== null && (
                      <span style={{ fontSize: 13, fontWeight: 400, color: theme.textDim }}> · {adherenceLabel(monthView.summary.rate, lang)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: theme.textDim }}>
                    {monthView.summary.skipped} {t('skippedCountLabel')} · {monthView.summary.missed} {t('missedCountLabel')} · {monthView.summary.taken + monthView.summary.missed} {t('dosesThisMonth')}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Timeline del día seleccionado */}
          {selectedMonthDay && (
            <SectionList theme={theme} title={selectedMonthDay}>
              <DayTimeline theme={theme} t={t} lang={lang} meds={meds}
                doses={dosesForDate(selectedMonthDay)}
                emptyText={t('noDosesDay')} />
            </SectionList>
          )}
        </>
      )}
    </div>
  );
}
