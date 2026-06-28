import React from 'react';
import type { Theme } from '../theme/tokens';

interface Option {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedRowProps {
  theme: Theme;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
}

export default function SegmentedRow({ theme, options, value, onChange }: SegmentedRowProps) {
  return (
    <div style={{
      display: 'flex', gap: 6,
      background: theme.surface2, padding: 4, borderRadius: 14,
      border: `1px solid ${theme.border}`,
    }}>
      {options.map(opt => {
        const sel = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              flex: 1, height: 42, borderRadius: 11, border: 0,
              background: sel ? theme.surface : 'transparent',
              color: sel ? theme.text : theme.textDim,
              fontWeight: sel ? 700 : 500, fontSize: 13.5,
              fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: sel ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              letterSpacing: -0.1,
              transition: 'background .15s, color .15s',
            }}
          >
            {opt.icon}{opt.label}
          </button>
        );
      })}
    </div>
  );
}
