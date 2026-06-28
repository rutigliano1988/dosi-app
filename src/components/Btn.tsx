import React, { useRef } from 'react';
import type { Theme } from '../theme/tokens';

type BtnKind = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  theme: Theme;
  children: React.ReactNode;
  kind?: BtnKind;
  size?: BtnSize;
  onClick?: () => void;
  style?: React.CSSProperties;
  full?: boolean;
  disabled?: boolean;
}

const KIND_STYLES: Record<BtnKind, (t: Theme) => { bg: string; fg: string; border: string }> = {
  primary:   t => ({ bg: t.accent,      fg: t.accentText, border: 'transparent' }),
  secondary: t => ({ bg: t.surface2,    fg: t.text,       border: t.borderStrong }),
  soft:      t => ({ bg: t.accentSoft,  fg: t.accentText, border: 'transparent' }),
  ghost:     t => ({ bg: 'transparent', fg: t.text,       border: 'transparent' }),
  danger:    t => ({ bg: t.dangerSoft,  fg: t.danger,     border: 'transparent' }),
};

const SIZE_STYLES: Record<BtnSize, { h: number; px: number; fs: number; r: number }> = {
  sm: { h: 36, px: 14, fs: 14, r: 12 },
  md: { h: 48, px: 18, fs: 15, r: 14 },
  lg: { h: 56, px: 22, fs: 16, r: 16 },
};

export default function Btn({ theme, children, kind = 'primary', size = 'md', onClick, style, full, disabled }: BtnProps) {
  const k = KIND_STYLES[kind](theme);
  const s = SIZE_STYLES[size];
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => { if (ref.current) ref.current.style.transform = 'scale(0.97)'; }}
      onMouseUp={() => { if (ref.current) ref.current.style.transform = 'scale(1)'; }}
      onMouseLeave={() => { if (ref.current) ref.current.style.transform = 'scale(1)'; }}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        borderRadius: s.r,
        border: `1px solid ${k.border}`,
        background: k.bg,
        color: k.fg,
        fontSize: s.fs,
        fontWeight: 600,
        fontFamily: 'inherit',
        letterSpacing: -0.1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        transition: 'transform .12s, opacity .12s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
