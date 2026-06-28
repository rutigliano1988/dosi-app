import React, { useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Caregiver } from '../data/types';
import { I } from '../icons';
import Btn from '../components/Btn';
import SegmentedRow from '../components/SegmentedRow';

interface Props {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  caregiver: Caregiver;
  onClose: () => void;
}

function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Instrument Serif", Georgia, serif',
      fontSize: size * 0.42, fontWeight: 500,
    }}>
      {name.charAt(0)}
    </div>
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

export default function ManageCaregiverSheet({ theme, t, caregiver, onClose }: Props) {
  const [perm, setPerm] = useState(caregiver.permission);
  const [notifyMiss, setNotifyMiss] = useState(caregiver.notifyOnMiss);
  const [showInv, setShowInv] = useState(caregiver.showInventory);

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
                  {t('cgManageTitle', { name: caregiver.name.split(' ')[0] })}
                </div>
                <div style={{ fontSize: 14, color: theme.textDim, marginTop: 6 }}>
                  {t('cgAddedOn', { date: caregiver.addedDate })}
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

          {/* Person card */}
          <div style={{
            background: theme.surface, borderRadius: 22,
            border: `1px solid ${theme.border}`,
            padding: 14, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16,
          }}>
            <Avatar name={caregiver.name} color={caregiver.color} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: theme.text, letterSpacing: -0.2 }}>
                {caregiver.name}
              </div>
              <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2 }}>{t(caregiver.relationKey)}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: theme.textDim, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
            {t('cgPermission')}
          </div>
          <SegmentedRow theme={theme} value={perm} onChange={v => setPerm(v as 'view' | 'edit')} options={[
            { id: 'view', label: t('cgPermView') },
            { id: 'edit', label: t('cgPermEdit') },
          ]} />
          <div style={{ height: 14 }} />

          <ToggleRow theme={theme} label={t('cgNotifyMiss')} value={notifyMiss} onChange={setNotifyMiss} />
          <ToggleRow theme={theme} label={t('cgShowInv')} value={showInv} onChange={setShowInv} />

          <div style={{ height: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn theme={theme} kind="secondary" size="md" style={{ flex: 1 }}>{t('cgPause')}</Btn>
            <Btn theme={theme} kind="danger" size="md" style={{ flex: 1 }} onClick={onClose}>{t('cgRevoke')}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
