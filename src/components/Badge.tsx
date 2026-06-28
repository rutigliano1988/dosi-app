import React from 'react';
import type { Theme } from '../theme/tokens';

type BadgeKind = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

interface BadgeProps {
  theme: Theme;
  kind?: BadgeKind;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const PALETTE: Record<BadgeKind, (t: Theme) => { bg: string; fg: string }> = {
  neutral: t => ({ bg: t.surface2,    fg: t.textDim }),
  accent:  t => ({ bg: t.accentSoft,  fg: t.accentText }),
  success: t => ({ bg: t.successSoft, fg: t.success }),
  warn:    t => ({ bg: t.warnSoft,    fg: t.warn }),
  danger:  t => ({ bg: t.dangerSoft,  fg: t.danger }),
};

export default function Badge({ theme, kind = 'neutral', children, icon }: BadgeProps) {
  const p = PALETTE[kind](theme);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 9px', borderRadius: 999,
      background: p.bg, color: p.fg,
      fontSize: 11.5, fontWeight: 600, letterSpacing: 0.1,
      whiteSpace: 'nowrap',
    }}>
      {icon}{children}
    </span>
  );
}
