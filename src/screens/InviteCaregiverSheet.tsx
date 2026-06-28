import React, { useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { I } from '../icons';
import Btn from '../components/Btn';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  onClose: () => void;
}

function QRPlaceholder({ size = 196, color = '#1c1812', bg = '#fff' }) {
  const n = 25;
  const cell = size / n;
  const cells: [number, number][] = [];
  const corners: [number, number][] = [[0, 0], [n - 7, 0], [0, n - 7]];
  corners.forEach(([cx, cy]) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const onOuter = x === 0 || y === 0 || x === 6 || y === 6;
        const onInner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (onOuter || onInner) cells.push([cx + x, cy + y]);
      }
    }
  });
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inCorner = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (inCorner) continue;
      const h = (((x * 73856093) ^ (y * 19349663) ^ 83492791) >>> 0);
      if ((h % 100) < 47) cells.push([x, y]);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <rect width={size} height={size} fill={bg} />
      {cells.map(([x, y], i) => (
        <rect key={i} x={x * cell} y={y * cell} width={cell + 0.6} height={cell + 0.6} fill={color} rx={cell * 0.18} />
      ))}
      <rect x={size / 2 - 22} y={size / 2 - 22} width={44} height={44} rx={12} fill={bg} />
      <circle cx={size / 2} cy={size / 2} r={14} fill={color} />
      <circle cx={size / 2} cy={size / 2} r={6} fill={bg} />
    </svg>
  );
}

function ToggleRow({ theme, label, value, onChange }: {
  theme: Theme; label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!value)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      width: '100%', padding: '14px 16px',
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: 16, marginBottom: 8, cursor: 'pointer',
      fontFamily: 'inherit', color: theme.text, textAlign: 'left',
    }}>
      <span style={{ fontSize: 14.5, fontWeight: 500 }}>{label}</span>
      <span style={{
        width: 42, height: 24, borderRadius: 14, position: 'relative',
        background: value ? theme.accent : theme.borderStrong, flexShrink: 0,
        display: 'inline-block',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2,
          width: 20, height: 20, borderRadius: 10, background: '#fff',
          transition: 'left .15s',
        }} />
      </span>
    </button>
  );
}

export default function InviteCaregiverSheet({ theme, t, lang, onClose }: Props) {
  const [perm, setPerm] = useState<'view' | 'edit'>('view');
  const [notifyMiss, setNotifyMiss] = useState(true);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'dosi-fade .2s',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: '100%', background: theme.surface, color: theme.text,
          borderTopLeftRadius: 32, borderTopRightRadius: 32,
          animation: 'dosi-sheet .35s cubic-bezier(.2,.9,.3,1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: theme.borderStrong }} />
          </div>
          <div style={{ padding: '20px 24px 36px', textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: theme.successSoft, color: theme.success,
              margin: '4px auto 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {I.check(36, theme.success)}
            </div>
            <div style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 26, fontWeight: 500, letterSpacing: -0.5,
            }}>
              {t('cgInvited')}
            </div>
            <div style={{ fontSize: 14, color: theme.textDim, marginTop: 6, marginBottom: 18 }}>
              {lang === 'es' ? 'Recibirá un enlace por mensaje.' : "They'll get a link by message."}
            </div>
            <Btn theme={theme} kind="primary" size="md" full onClick={onClose}>
              {lang === 'es' ? 'Listo' : 'Done'}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'flex-end',
      animation: 'dosi-fade .2s',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.text,
        borderTopLeftRadius: 32, borderTopRightRadius: 32,
        maxHeight: '90%', overflowY: 'auto',
        animation: 'dosi-sheet .35s cubic-bezier(.2,.9,.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: theme.borderStrong }} />
        </div>
        <div style={{ padding: '4px 24px 28px' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontSize: 28, fontWeight: 500, letterSpacing: -0.6, lineHeight: 1.1, color: theme.text,
                }}>
                  {t('cgInviteTitle')}
                </div>
                <div style={{ fontSize: 14, color: theme.textDim, marginTop: 6, lineHeight: 1.4 }}>
                  {t('cgInviteSub')}
                </div>
              </div>
              <button onClick={onClose} style={{
                width: 36, height: 36, borderRadius: 12, background: theme.surface2,
                border: 0, color: theme.text, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 4,
              }}>
                {I.close(18, theme.text)}
              </button>
            </div>
          </div>

          {/* QR + code */}
          <div style={{
            background: theme.surface2, borderRadius: 22,
            border: `1px solid ${theme.border}`,
            padding: 18, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 14, marginBottom: 18,
          }}>
            <div style={{ background: '#fff', padding: 14, borderRadius: 18, boxShadow: '0 6px 24px rgba(0,0,0,0.10)' }}>
              <QRPlaceholder size={172} color="#1c1812" />
            </div>
            <div style={{ fontSize: 12, color: theme.textDim, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {t('cgOrShare')}
            </div>
            <div style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 22, fontWeight: 700, color: theme.text, letterSpacing: 4,
              padding: '8px 16px', background: theme.surface, borderRadius: 12,
              border: `1px dashed ${theme.borderStrong}`,
            }}>
              DOSI-7K2-X9
            </div>
          </div>

          {/* Permissions */}
          <div style={{
            fontSize: 12, color: theme.textDim, fontWeight: 700,
            letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10,
          }}>
            {t('cgPermission')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {([
              { id: 'view' as const, title: t('cgPermView'), sub: t('cgPermViewSub') },
              { id: 'edit' as const, title: t('cgPermEdit'), sub: t('cgPermEditSub') },
            ]).map(opt => {
              const sel = perm === opt.id;
              return (
                <button key={opt.id} onClick={() => setPerm(opt.id)} style={{
                  textAlign: 'left', padding: 14, borderRadius: 16,
                  background: sel ? theme.accentSoft : theme.surface,
                  border: `1.5px solid ${sel ? theme.accent : theme.border}`,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                    border: `2px solid ${sel ? theme.accent : theme.borderStrong}`,
                    background: sel ? theme.accent : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                  }}>
                    {sel && <div style={{ width: 8, height: 8, borderRadius: 4, background: theme.accentText }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, letterSpacing: -0.2 }}>{opt.title}</div>
                    <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2, lineHeight: 1.4 }}>{opt.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <ToggleRow theme={theme} label={t('cgNotifyMiss')} value={notifyMiss} onChange={setNotifyMiss} />

          <div style={{ height: 12 }} />
          <Btn theme={theme} kind="primary" size="md" full onClick={() => setSent(true)}>
            {I.share(18, theme.accentText)} {t('cgSendInvite')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
