import type { Theme, PillColorKey } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import { PILL_COLORS } from '../theme/tokens';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import IconBtn from '../components/IconBtn';
import Card from '../components/Card';
import SectionList from '../components/SectionList';
import ProgressRing from '../components/ProgressRing';
import EmptyState from '../components/EmptyState';
import PillGlyph from '../components/PillGlyph';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  meds: Medicine[];
  doses: Dose[];
  onMark: (doseId: string) => void;
  onSnooze: (doseId: string) => void;
  onSkip: (doseId: string) => void;
  onAddMed: () => void;
  onOpenMed: (medId: string) => void;
  onShowNotif: () => void;
}

function DoseRow({ theme, med, dose, taken, onMark, onOpen }: {
  theme: Theme;
  med: Medicine;
  dose: Dose;
  taken?: boolean;
  onMark?: () => void;
  onOpen?: () => void;
}) {
  return (
    <div style={{
      background: theme.surface, borderRadius: 18,
      border: `1px solid ${theme.border}`,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: taken ? 0.7 : 1,
    }}>
      <PillGlyph color={med.color} size={44} form={med.form} />
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div style={{
          fontSize: 15.5, fontWeight: 600, color: theme.text, letterSpacing: -0.2,
          textDecoration: taken ? 'line-through' : 'none',
          textDecorationColor: theme.textSoft,
        }}>
          {med.name}
        </div>
        <div style={{ fontSize: 13, color: theme.textDim, marginTop: 1 }}>{med.dose}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums',
        }}>
          {dose.time}
        </div>
        {taken ? (
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: theme.successSoft, color: theme.success,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {I.check(18, theme.success)}
          </div>
        ) : (
          <button onClick={onMark} style={{
            width: 36, height: 36, borderRadius: 12,
            background: theme.surface2, border: `1px solid ${theme.borderStrong}`,
            color: theme.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {I.check(18, theme.textDim)}
          </button>
        )}
      </div>
    </div>
  );
}

export default function HomeScreen({ theme, t, meds, doses, onMark, onSnooze, onAddMed, onOpenMed, onShowNotif }: Props) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('greetingMorning') : hour < 19 ? t('greetingDay') : t('greetingEvening');

  if (!meds || meds.length === 0) {
    return (
      <div style={{ paddingTop: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TopBar theme={theme} subtitle={greet} title={t('greetingName')}
          right={<IconBtn theme={theme}>{I.bell(20, theme.text)}</IconBtn>}
        />
        <EmptyState
          theme={theme}
          icon={I.pill(56, theme.accent)}
          title={t('emptyHomeTitle')}
          message={t('emptyHomeMsg')}
          primary={{ label: t('emptyHomeCta'), icon: I.plus(18, theme.accentText), onClick: onAddMed }}
        />
      </div>
    );
  }

  const taken = doses.filter(d => d.status === 'taken');
  const upcomingDoses = doses.filter(d => d.status === 'upcoming' || d.status === 'now');
  const nowDose = doses.find(d => d.status === 'now') ?? upcomingDoses[0];
  const nowMed = nowDose ? meds.find(m => m.id === nowDose.medId) : null;
  const progress = doses.length > 0 ? taken.length / doses.length : 0;

  return (
    <div style={{ paddingTop: 8 }}>
      <TopBar
        theme={theme}
        subtitle={greet}
        title={t('greetingName')}
        right={<IconBtn theme={theme} onClick={onShowNotif} badge>{I.bell(20, theme.text)}</IconBtn>}
      />

      {/* Progress card */}
      <div style={{ padding: '0 16px 16px' }}>
        <Card theme={theme} style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ProgressRing theme={theme} value={progress} size={68} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: theme.textDim, fontWeight: 600,
                letterSpacing: 0.2, textTransform: 'uppercase',
              }}>
                {t('todayPlan')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginTop: 2, letterSpacing: -0.4 }}>
                {taken.length}/{doses.length}{' '}
                <span style={{ color: theme.textDim, fontWeight: 500, fontSize: 14 }}>{t('nDosesDone')}</span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {doses.map(d => {
                  const m = meds.find(x => x.id === d.medId);
                  const isTaken = d.status === 'taken';
                  const dotColor = m ? (PILL_COLORS[m.color as PillColorKey]?.dot ?? theme.accent) : theme.accent;
                  return (
                    <div key={d.id} style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: isTaken ? dotColor : theme.surface2,
                    }} />
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Next dose hero */}
      {nowDose && nowMed && (
        <div style={{ padding: '0 16px 18px' }}>
          <div style={{
            background: theme.accent, color: theme.accentText,
            borderRadius: 24, padding: 20,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, letterSpacing: 0.4,
                textTransform: 'uppercase', opacity: 0.85,
              }}>
                {nowDose.status === 'now' ? t('nowLabel') : t('nextDose')}
                <span>Â·</span>
                {nowDose.time}
              </div>
              <button
                onClick={() => onSnooze(nowDose.id)}
                style={{
                  background: 'rgba(0,0,0,0.12)', border: 0, color: theme.accentText,
                  borderRadius: 999, padding: '4px 10px', fontSize: 11.5,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('snooze')}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 18,
                background: 'rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <PillGlyph color={nowMed.color} size={42} form={nowMed.form} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontSize: 26, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1.1,
                }}>
                  {nowMed.name}
                </div>
                <div style={{ fontSize: 14, opacity: 0.75, marginTop: 2 }}>
                  {nowMed.dose}{nowMed.notes ? ` Â· ${nowMed.notes.split('.')[0]}` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={() => onMark(nowDose.id)}
              style={{
                width: '100%', height: 52, borderRadius: 16,
                background: 'rgba(0,0,0,0.15)', color: theme.accentText,
                border: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 16, fontWeight: 700, letterSpacing: -0.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {I.check(20, theme.accentText)} {t('markTaken')}
            </button>
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingDoses.length > 1 && (
        <SectionList theme={theme} title={t('upcoming')}>
          {upcomingDoses.slice(1).map(d => {
            const m = meds.find(x => x.id === d.medId);
            if (!m) return null;
            return (
              <DoseRow key={d.id} theme={theme} med={m} dose={d}
                onMark={() => onMark(d.id)}
                onOpen={() => onOpenMed(m.id)}
              />
            );
          })}
        </SectionList>
      )}

      {/* Taken */}
      {taken.length > 0 && (
        <SectionList theme={theme} title={t('completed')}>
          {taken.map(d => {
            const m = meds.find(x => x.id === d.medId);
            if (!m) return null;
            return (
              <DoseRow key={d.id} theme={theme} med={m} dose={d} taken
                onOpen={() => onOpenMed(m.id)}
              />
            );
          })}
        </SectionList>
      )}

      <div style={{ height: 120 }} />
    </div>
  );
}
