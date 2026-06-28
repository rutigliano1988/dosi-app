import React from 'react';
import type { Theme } from '../theme/tokens';

interface TopBarProps {
  theme: Theme;
  title?: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export default function TopBar({ theme, title, subtitle, left, right }: TopBarProps) {
  return (
    <div style={{
      padding: '8px 20px 12px',
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {subtitle && (
          <div style={{ color: theme.textDim, fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
            {subtitle}
          </div>
        )}
        {title && (
          <div style={{
            color: theme.text, fontSize: 30, fontWeight: 600, letterSpacing: -0.6,
            lineHeight: 1.1,
            fontFamily: '"Instrument Serif", Georgia, serif',
          }}>
            {title}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        {left}{right}
      </div>
    </div>
  );
}
