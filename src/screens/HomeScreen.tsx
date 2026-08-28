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
  userName: string;
  meds: Medicine[];
  doses: Dose[];
  onMark: (doseId: string) => void;
  onSnooze: (doseId: string) => void;
  onSkip: (doseId: string) => void;
  onAddMed: () => void;
  onOpenMed: (medId: string) => void;
  onShowNotif: () => void;
  showPushBanner: boolean;
  onEnablePush: () => void;
  onDismissPushBanner: () => void;
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

function PushBanner({ theme, t, onEnable, onDismiss }: {
  theme: Theme;
  t: (key: string) => string;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{
        background: theme.accentSoft, borderRadius: 18, padding: 16,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{ flexShrink: 0, marginTop: 2 }}>{I.bell(20, theme.accent)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.text }}>{t('pushBannerTitle')}</div>
          <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2, lineHeight: 1.4 }}>{t('pushBannerBody')}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onEnable} style={{
              background: theme.accent, color: theme.accentText, border: 0, borderRadius: 999,
              padding: '7px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>{t('pushBannerCta')}</button>
            <button onClick={onDismiss} style={{
              background: 'transparent', color: theme.textDim, border: 0,
              padding: '7px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>{t('skip')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeScreen({
  theme, t, userName, meds, doses, onMark, onSnooze, onAddMed, onOpenMed, onShowNotif,
  showPushBanner, onEnablePush, onDismissPushBanner,
}: Props) {
  const hour = new Date().getHours();
  const base = hour < 12 ? 'Morning' : hour < 19 ? 'Day' : 'Evening';
  const greet = userName ? `${t('greeting' + base)} ${userName}` : t('greeting' + base + 'Plain');
  const barTitle = userName || t('appName');

  if (!meds || meds.length === 0) {
    return (
      <div style={{ paddingTop: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TopBar theme={theme} subtitle={greet} title={barTitle}
          right={<IconBtn theme={theme}>{I.bell(20, theme.text)}</IconBtn>}
        />
        {showPushBanner && (
          <PushBanner theme={theme} t={t} onEnable={onEnablePush} onDismiss={onDismissPushBanner} />
        )}
        <EmptyState
          theme={theme}
          icon={I.pill(56, theme.accent)}
          title={t('emptyHomeTitleNew')}
          message={t('emptyHomeMsg')}
          primary={{ label: t('emptyHomeCta'), icon: I.plus(18, theme.accentText), onClick: onAddMed }}
        />
      </div>
    );
  }

  if (doses.length === 0) {
    return (
      <div style={{ paddingTop: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TopBar theme={theme} subtitle={greet} title={barTitle}
          right={<IconBtn theme={theme}>{I.bell(20, theme.text)}</IconBtn>}
        />
        {showPushBanner && (
          <PushBanner theme={theme} t={t} onEnable={onEnablePush} onDismiss={onDismissPushBanner} />
        )}
        <EmptyState
          theme={theme}
          icon={I.check(56, theme.accent)}
          title={t('homeNothingTodayTitle')}
          message={t('homeNothingTodayMsg')}
        />
      </div>
    );
  }

  const taken = doses.filter(d => d.status === 'taken');
  const missed = doses.filter(d => d.status === 'missed');
  const upcomingDoses = doses.filter(d => d.status === 'upcoming' || d.status === 'now');
  const heroDose = doses.find(d => d.status === 'now') ?? missed[0] ?? upcomingDoses[0];
  const heroMed = heroDose ? meds.find(m => m.id === heroDose.medId) : null;
  const heroId = heroDose?.id;
  const upcomingRest = upcomingDoses.filter(d => d.id !== heroId);
  const missedRest = missed.filter(d => d.id !== heroId);
  const progress = doses.length > 0 ? taken.length / doses.length : 0;

  return (
    <div style={{ paddingTop: 8 }}>
      <TopBar
        theme={theme}
        subtitle={greet}
        title={barTitle}
        right={<IconBtn theme={theme} onClick={onShowNotif} badge>{I.bell(20, theme.text)}</IconBtn>}
      />

      {showPushBanner && (
        <PushBanner theme={theme} t={t} onEnable={onEnablePush} onDismiss={onDismissPushBanner} />
      )}

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
      {heroDose && heroMed && (
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
                {heroDose.status === 'missed'
                  ? t('missedLabel')
                  : heroDose.status === 'now' ? t('nowLabel') : t('nextDose')}
                <span>·</span>
                {heroDose.time}
              </div>
              <button
                onClick={() => onSnooze(heroDose.id)}
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
                <PillGlyph color={heroMed.color} size={42} form={heroMed.form} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontSize: 26, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1.1,
                }}>
                  {heroMed.name}
                </div>
                <div style={{ fontSize: 14, opacity: 0.75, marginTop: 2 }}>
                  {heroMed.dose}{heroMed.notes ? ` · ${heroMed.notes.split('.')[0]}` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={() => onMark(heroDose.id)}
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

      {/* Missed */}
      {missedRest.length > 0 && (
        <SectionList theme={theme} title={t('missedSection')}>
          {missedRest.map(d => {
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

      {/* Upcoming */}
      {upcomingRest.length > 0 && (
        <SectionList theme={theme} title={t('upcoming')}>
          {upcomingRest.map(d => {
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
