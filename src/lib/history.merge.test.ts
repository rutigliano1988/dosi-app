import { describe, it, expect } from 'vitest';
import { mergeHistoryDose } from '../data/sync';
import type { Dose } from '../data/types';

function dose(over: Partial<Dose> = {}): Dose {
  return { id: 'm1-2026-08-30-08:00', medId: 'm1', time: '08:00', totalMin: 480, status: 'now', ...over };
}

describe('mergeHistoryDose', () => {
  it('actualiza el estado en su sitio cuando el id ya está en el historial', () => {
    const history: Dose[] = [
      dose({ id: 'm1-2026-08-30-08:00', status: 'missed', date: '2026-08-30' }),
      dose({ id: 'm2-2026-08-30-09:00', medId: 'm2', time: '09:00', status: 'taken', date: '2026-08-30' }),
    ];
    const out = mergeHistoryDose(history, dose({ id: 'm1-2026-08-30-08:00' }), 'taken', '2026-08-30');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'm1-2026-08-30-08:00', status: 'taken', date: '2026-08-30' });
    // otras entradas intactas
    expect(out[1]).toBe(history[1]);
  });

  it('añade la dosis con el date y status pasados cuando el id no está', () => {
    const history: Dose[] = [dose({ id: 'm2-2026-08-30-09:00', medId: 'm2', time: '09:00', status: 'taken', date: '2026-08-30' })];
    const d = dose({ id: 'm1-2026-08-30-08:00', status: 'now' });
    const out = mergeHistoryDose(history, d, 'skipped', '2026-08-30');
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(history[0]);
    expect(out[1]).toMatchObject({ id: 'm1-2026-08-30-08:00', medId: 'm1', time: '08:00', totalMin: 480, status: 'skipped', date: '2026-08-30' });
  });

  it('no muta el array ni las entradas originales', () => {
    const history: Dose[] = [dose({ id: 'm1-2026-08-30-08:00', status: 'missed', date: '2026-08-30' })];
    const snapshot = JSON.parse(JSON.stringify(history));
    mergeHistoryDose(history, dose({ id: 'm1-2026-08-30-08:00' }), 'taken', '2026-08-30');
    expect(history).toEqual(snapshot);
  });
});
