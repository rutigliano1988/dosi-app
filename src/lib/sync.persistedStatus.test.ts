import { describe, it, expect } from 'vitest';
import { persistedStatus } from '../data/sync';

// 'missed' es un estado puramente derivado para la UI (buildTodayDoses). La BD
// solo acepta 'upcoming'|'now'|'taken'|'skipped' (CHECK doses_status_check), así
// que ningún camino de escritura debe enviar 'missed'.
describe('persistedStatus', () => {
  it("mapea 'missed' → 'upcoming' (último estado real de una toma sin marcar)", () => {
    expect(persistedStatus('missed')).toBe('upcoming');
  });

  it('deja intactos los estados que la BD sí acepta', () => {
    for (const s of ['upcoming', 'now', 'taken', 'skipped'] as const) {
      expect(persistedStatus(s)).toBe(s);
    }
  });
});
