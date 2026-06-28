import React, { useEffect } from 'react';
import type { Theme } from '../theme/tokens';

type ToastKind = 'neutral' | 'success' | 'danger';

interface ToastProps {
  theme: Theme;
  message: string;
  icon?: React.ReactNode;
  kind?: ToastKind;
  onDone: () => void;
  duration?: number;
}

const COLORS: Record<ToastKind, (t: Theme) => { bg: string; fg: string }> = {
  neutral: t => ({ bg: t.text,    fg: t.bg }),
  success: _  => ({ bg: '#5f7a4a', fg: '#fff' }),
  danger:  _  => ({ bg: '#b03020', fg: '#fff' }),
};

export default function Toast({ theme, message, icon, kind = 'neutral', onDone, duration = 2200 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  const c = COLORS[kind](theme);

  return (
    <div style={{
      position: 'absolute', left: 16, right: 16, bottom: 100, zIndex: 220,
      background: c.bg, color: c.fg,
      padding: '12px 16px', borderRadius: 16,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
      animation: 'dosi-pop .3s',
    }}>
      {icon && <span style={{ display: 'flex' }}>{icon}</span>}
      <span style={{ fontSize: 14, fontWeight: 600 }}>{message}</span>
    </div>
  );
}
