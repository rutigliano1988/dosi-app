import React from 'react';
import type { Theme } from '../theme/tokens';
import Btn from './Btn';

type ConfirmKind = 'danger' | 'primary';

interface ConfirmDialogProps {
  theme: Theme;
  title: string;
  message: string;
  confirmLabel: string;
  confirmKind?: ConfirmKind;
  confirmIcon?: React.ReactNode;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  theme, title, message,
  confirmLabel, confirmKind = 'danger', confirmIcon,
  cancelLabel = 'Cancelar',
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 250,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 28, animation: 'dosi-fade .2s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.surface, borderRadius: 24, padding: 22,
          width: '100%', maxWidth: 320, color: theme.text,
          animation: 'dosi-pop .25s cubic-bezier(.2,1.2,.4,1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 24, fontWeight: 500, letterSpacing: -0.4,
          color: theme.text, lineHeight: 1.15, marginBottom: 8,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 14, color: theme.textDim, lineHeight: 1.5, marginBottom: 18,
        }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn theme={theme} kind="secondary" size="md" style={{ flex: 1 }} onClick={onCancel}>
            {cancelLabel}
          </Btn>
          <Btn theme={theme} kind={confirmKind} size="md" style={{ flex: 1 }} onClick={onConfirm}>
            {confirmIcon}{confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
