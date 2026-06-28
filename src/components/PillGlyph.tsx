import React from 'react';
import { PILL_COLORS, type PillColorKey } from '../theme/tokens';
import { I } from '../icons';
import type { MedForm } from '../data/types';

interface PillGlyphProps {
  color: PillColorKey | string;
  size?: number;
  form?: MedForm;
  dark?: boolean;
}

export default function PillGlyph({ color, size = 40, form = 'capsule', dark = false }: PillGlyphProps) {
  const entry = PILL_COLORS[color as PillColorKey] ?? { dot: color, soft: '#eee' };
  const bg = dark ? `${entry.dot}22` : entry.soft;
  const stroke = entry.dot;

  if (form === 'syrup' || form === 'drops') {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: stroke, flexShrink: 0,
      }}>
        {form === 'drops' ? I.drop(size * 0.55, stroke, true) : I.syrup(size * 0.55, stroke)}
      </div>
    );
  }

  const clipId = `cap-${color}-${size}`;
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
        <defs>
          <clipPath id={clipId}>
            <rect x="3" y="9" width="18" height="6" rx="3"/>
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`} transform="rotate(-30 12 12)">
          <rect x="3" y="9" width="9" height="6" fill={stroke}/>
          <rect x="12" y="9" width="9" height="6" fill={stroke} opacity="0.45"/>
        </g>
        <rect x="3" y="9" width="18" height="6" rx="3" fill="none"
          stroke={stroke} strokeWidth="0.8" transform="rotate(-30 12 12)" opacity="0.5"/>
      </svg>
    </div>
  );
}
