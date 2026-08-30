import { describe, it, expect } from 'vitest';
import { backfillCandidates } from '../data/sync';
import type { Medicine } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-01-01' },
    stock: 30, ...over,
  };
}

describe('backfillCandidates', () => {
  const now = new Date(2026, 7, 28, 12, 0); // vie 28 ago

  it('genera una fila por día y hora esperada, excluyendo hoy', () => {
    const rows = backfillCandidates('u1', [med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } })], 3, new Set(), now);
    // días 25, 26, 27 (no el 28) × 2 tomas = 6
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      user_id: 'u1', med_id: 'm1', date: '2026-08-25', time: '08:00',
      total_min: 480, status: 'upcoming', id: 'm1-2026-08-25-08:00',
    });
    expect(rows.every(r => r.date !== '2026-08-28')).toBe(true);
  });

  it('no repite filas que ya existen', () => {
    const existing = new Set(['m1-2026-08-27-08:00']);
    const rows = backfillCandidates('u1', [med()], 3, existing, now);
    expect(rows.map(r => r.date)).toEqual(['2026-08-25', '2026-08-26']);
  });

  it('respeta startedOn: nada antes de que empiece el tratamiento', () => {
    const rows = backfillCandidates('u1', [med({ duration: { kind: 'ongoing', startedOn: '2026-08-27' } })], 5, new Set(), now);
    expect(rows.map(r => r.date)).toEqual(['2026-08-27']);
  });

  it('meds vacías → sin candidatos', () => {
    expect(backfillCandidates('u1', [], 90, new Set(), now)).toEqual([]);
  });
});
