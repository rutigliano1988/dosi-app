import React from 'react';
import type { Theme, PillColorKey } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine } from '../data/types';
import { PILL_COLORS } from '../theme/tokens';
import { I } from '../icons';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Btn from '../components/Btn';
import PillGlyph from '../components/PillGlyph';

interface Props {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  med: Medicine | null;
  onBack: () => void;
  onShowStockAlert: () => void;
  onEdit: () => void;
  onPauseToggle: () => void;
  onDelete: () => void;
}

export default function DetailScreen({ theme, t, med, onBack, onShowStockAlert, onEdit, onPauseToggle, onDelete }: Props) {
  if (!med) return null;

  const c = PILL_COLORS[med.color as PillColorKey] ?? { dot: '#ccc', soft: '#eee' };
  const dur = med.duration;
  const dayProgress = dur.kind === 'days' && dur.days && dur.startedDay
    ? dur.startedDay / dur.days : 1;
  const stockLow = med.stock <= 6;
  const dosesPerDay = med.schedule.times.length;
  const daysLeft = Math.floor(med.stock / dosesPerDay);
  const formKey = `form${med.form.charAt(0).toUpperCase()}${med.form.slice(1)}` as string;

  const mockHistory = [
    { day: 'Hoy',  time: '08:00', taken: true  },
    { day: 'Ayer', time: '20:00', taken: true  },
    { day: 'Ayer', time: '14:00', taken: true  },
    { day: 'Ayer', time: '08:00', taken: false },
  ];

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{ background: c.soft, padding: '12px 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'rgba(255,255,255,0.6)', border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            {I.back(20, '#1c1812')}
          </button>
          <button style={{
            width: 42, height: 42, borderRadius: 14,
            background: 'rgba(255,255,255,0.6)', border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}>
            {I.more(20, '#1c1812')}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 22 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22,
            background: 'rgba(255,255,255,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            opacity: med.paused ? 0.55 : 1,
          }}>
            <PillGlyph color={med.color} size={56} form={med.form} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
            {med.paused && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 9px', borderRadius: 999, marginBottom: 6,
                background: 'rgba(255,255,255,0.55)', color: '#1c1812',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                backdropFilter: 'blur(8px)',
              }}>
                {I.pause(11, '#1c1812')} {t('detailPausedTag')}
              </span>
            )}
            <div style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 30, fontWeight: 500, letterSpacing: -0.6, color: '#1c1812', lineHeight: 1.05,
            }}>
              {med.name}
            </div>
            <div style={{ color: 'rgba(28,24,18,0.65)', fontSize: 14, fontWeight: 500, marginTop: 4 }}>
              {med.dose} · {t(formKey)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Schedule card */}
        <Card theme={theme} style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {t('schedule')}
            </div>
            <button onClick={onEdit} style={{
              background: 'transparent', border: 0, color: theme.textSoft, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
            }}>
              {I.edit(14, theme.textSoft)} {t('edit')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {med.schedule.times.map(time => (
              <div key={time} style={{
                background: theme.surface2, color: theme.text,
                padding: '8px 12px', borderRadius: 12, fontWeight: 700,
                fontSize: 15, fontVariantNumeric: 'tabular-nums',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ color: theme.textDim }}>{I.clock(14, theme.textDim)}</span>
                {time}
              </div>
            ))}
          </div>
          {dur.kind === 'days' && dur.startedDay && dur.days && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: theme.textDim, fontWeight: 500 }}>{t('duration')}</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.text }}>
                  {t('step')} {dur.startedDay} {t('of')} {dur.days}
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: theme.surface2, overflow: 'hidden' }}>
                <div style={{
                  width: `${dayProgress * 100}%`, height: '100%', background: theme.accent,
                  borderRadius: 3, transition: 'width .4s',
                }} />
              </div>
            </div>
          )}
        </Card>

        {/* Stock card */}
        <Card theme={theme} style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {t('stock')}
            </div>
            {stockLow && <Badge theme={theme} kind="warn">{t('lowStock')}</Badge>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: theme.text, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
              {med.stock}
            </div>
            <div style={{ color: theme.textDim, fontSize: 14, fontWeight: 500 }}>
              {t('pillsLeft')} · {t('enoughFor')} {daysLeft} {t('daysOf')}
            </div>
          </div>
          <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: theme.surface2, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(med.stock / 30, 1) * 100}%`, height: '100%',
              background: stockLow ? theme.warn : theme.success,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12.5, color: theme.textDim }}>
            <span>{t('expiresOn')} {med.expiry}</span>
            <button onClick={onShowStockAlert} style={{
              background: 'transparent', border: 0, color: theme.accent,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5,
            }}>
              {t('refill')}
            </button>
          </div>
        </Card>

        {/* Notes */}
        {med.notes && (
          <Card theme={theme} style={{ padding: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
              {t('instructions')}
            </div>
            <div style={{ fontSize: 14.5, color: theme.text, lineHeight: 1.5 }}>{med.notes}</div>
          </Card>
        )}

        {/* History */}
        <Card theme={theme} style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            {t('history')}
          </div>
          {mockHistory.map((h, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: i < mockHistory.length - 1 ? `1px solid ${theme.border}` : 'none',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9,
                background: h.taken ? theme.successSoft : theme.dangerSoft,
                color: h.taken ? theme.success : theme.danger,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {h.taken ? I.check(14, theme.success) : I.close(14, theme.danger)}
              </div>
              <div style={{ flex: 1, fontSize: 14, color: theme.text }}>{h.day} · {h.time}</div>
              <div style={{ fontSize: 13, color: theme.textDim }}>
                {h.taken ? t('taken') : t('skipDose')}
              </div>
            </div>
          ))}
        </Card>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Btn theme={theme} kind="secondary" size="md" style={{ flex: 1 }} onClick={onPauseToggle}>
            {med.paused ? I.check(16, theme.text) : I.pause(16, theme.text)}
            {med.paused ? t('detailResume') : t('pause')}
          </Btn>
          <Btn theme={theme} kind="danger" size="md" style={{ flex: 1 }} onClick={onDelete}>
            {I.trash(16, theme.danger)} {t('delete')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
