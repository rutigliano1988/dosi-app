import { describe, it, expect } from 'vitest';
import { rowToMed as browserRowToMed } from '../data/sync';
import { rowToMed as sharedRowToMed } from '../../supabase/functions/_shared/types.ts';

const cases: Record<string, unknown>[] = [
  {
    id: 'm1', name: 'Sintrom', dose: '1 mg', form: 'pill', color: 'coral',
    schedule: { freq: 'interval', times: ['06:00'], intervalHours: 8 },
    duration: { kind: 'days', days: 10, startedOn: '2026-08-20' },
    stock: 30, expiry: '2027-01-01', notes: 'con comida', paused: false,
  },
  { id: 'm2' }, // fila mínima → defaults
  { id: 'm3', paused: 'yes' }, // paused no-booleano → false
  {
    id: 'm4', name: 'Insulina', dose: '1 dosis', form: 'injection', color: 'sky',
    schedule: { freq: 'everyNDays', times: ['09:00'], intervalDays: 10 },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 5,
  },
];

describe('rowToMed: paridad sync.ts ↔ _shared/types.ts', () => {
  for (const [i, row] of cases.entries()) {
    it(`caso ${i}`, () => {
      const a = browserRowToMed(row);
      const b = sharedRowToMed(row);
      // color: el navegador tipa PillColorKey, _shared lo deja string — comparar por valor
      expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    });
  }

  it('everyNDays: intervalDays sobrevive la normalización en ambos lados', () => {
    const row = {
      id: 'm5', schedule: { freq: 'everyNDays', times: ['09:00'], intervalDays: 10 },
      duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    };
    expect(browserRowToMed(row).schedule.intervalDays).toBe(10);
    expect(sharedRowToMed(row).schedule.intervalDays).toBe(10);
  });

  it('fila mínima: defaults esperados', () => {
    const m = browserRowToMed({ id: 'x' });
    expect(m.name).toBe('');
    expect(m.form).toBe('pill');
    expect(m.color).toBe('coral');
    expect(m.schedule).toEqual({ freq: 'daily', times: ['08:00'], weekdays: undefined, intervalHours: undefined, intervalDays: undefined });
    expect(m.duration.kind).toBe('ongoing');
    expect(m.duration.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.stock).toBe(0);
    expect(m.paused).toBe(false);
  });
});
