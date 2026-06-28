import React from 'react';
import type { Theme } from '../theme/tokens';

interface SectionListProps {
  theme: Theme;
  title: string;
  children: React.ReactNode;
}

export default function SectionList({ theme, title, children }: SectionListProps) {
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <div style={{
        fontSize: 12.5, color: theme.textDim, fontWeight: 700,
        letterSpacing: 0.5, textTransform: 'uppercase',
        padding: '0 4px 8px',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}
