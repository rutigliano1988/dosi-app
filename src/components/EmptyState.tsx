import React from 'react';
import type { Theme } from '../theme/tokens';
import Btn from './Btn';

interface CTA {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface EmptyStateProps {
  theme: Theme;
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  message: string;
  primary?: CTA;
  secondary?: CTA;
}

export default function EmptyState({ theme, icon, iconColor, title, message, primary, secondary }: EmptyStateProps) {
  return (
    <div style={{
      flex: 1, padding: '40px 28px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', minHeight: 480,
    }}>
      <div style={{
        width: 132, height: 132, borderRadius: '50%',
        background: theme.accentSoft, color: iconColor ?? theme.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          background: theme.accentSoft, opacity: 0.4,
        }} />
        <div style={{ position: 'relative' }}>{icon}</div>
      </div>
      <div style={{
        fontFamily: '"Instrument Serif", Georgia, serif',
        fontSize: 30, fontWeight: 500, letterSpacing: -0.6,
        color: theme.text, lineHeight: 1.1,
        marginBottom: 10, maxWidth: 280,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 15, color: theme.textDim, lineHeight: 1.5,
        maxWidth: 300, marginBottom: 24,
      }}>
        {message}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
        {primary && (
          <Btn theme={theme} kind="primary" size="lg" full onClick={primary.onClick}>
            {primary.icon}{primary.label}
          </Btn>
        )}
        {secondary && (
          <Btn theme={theme} kind="ghost" size="md" full onClick={secondary.onClick}>
            {secondary.label}
          </Btn>
        )}
      </div>
    </div>
  );
}
