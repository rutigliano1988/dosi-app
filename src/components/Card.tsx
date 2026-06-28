import React from 'react';
import type { Theme } from '../theme/tokens';

interface CardProps {
  theme: Theme;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function Card({ theme, children, style, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: theme.surface,
        borderRadius: 22,
        border: `1px solid ${theme.border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
