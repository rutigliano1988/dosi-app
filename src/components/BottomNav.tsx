import React from 'react';
import type { Theme } from '../theme/tokens';
import type { TabId } from '../App';
import { I } from '../icons';

interface BottomNavProps {
  theme: Theme;
  active: TabId;
  onChange: (tab: TabId) => void;
  t: (key: string) => string;
}

const ITEMS: { id: TabId; labelKey: string; icon: typeof I.home }[] = [
  { id: 'home',      labelKey: 'home',      icon: I.home },
  { id: 'inventory', labelKey: 'inventory', icon: I.box },
  { id: 'calendar',  labelKey: 'calendar',  icon: I.cal },
  { id: 'profile',   labelKey: 'profile',   icon: I.user },
];

export default function BottomNav({ theme, active, onChange, t }: BottomNavProps) {
  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 28,
      background: theme.surface, borderRadius: 28,
      border: `1px solid ${theme.border}`,
      boxShadow: '0 6px 30px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
      padding: '8px 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      zIndex: 30,
    }}>
      {ITEMS.map(item => {
        const sel = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              background: sel ? theme.accentSoft : 'transparent',
              border: 0, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              color: sel ? theme.accent : theme.textDim,
              padding: '6px 12px', borderRadius: 18,
              transition: 'background-color .15s, color .15s',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ color: sel ? theme.accent : theme.textDim }}>
              {item.icon(22, sel ? theme.accent : theme.textDim, sel)}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: sel ? 700 : 500, letterSpacing: 0.1 }}>
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
