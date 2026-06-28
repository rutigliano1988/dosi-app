import React from 'react';
import type { Theme } from '../theme/tokens';

interface IconBtnProps {
  theme: Theme;
  children: React.ReactNode;
  onClick?: () => void;
  badge?: boolean;
}

export default function IconBtn({ theme, children, onClick, badge }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 42, height: 42, borderRadius: 14,
        background: theme.surface, border: `1px solid ${theme.border}`,
        color: theme.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', position: 'relative',
        flexShrink: 0,
      }}
    >
      {children}
      {badge && (
        <span style={{
          position: 'absolute', top: 7, right: 7,
          width: 8, height: 8, borderRadius: 4,
          background: theme.accent,
          border: `1.5px solid ${theme.surface}`,
        }} />
      )}
    </button>
  );
}
