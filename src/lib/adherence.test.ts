import { describe, it, expect } from 'vitest';
import { outcomeFor, buildAdherence, adherenceLabel } from './adherence';
import type { Medicine, Dose } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 30, ...over,
  };
}
function row(over: Partial<Dose> & { date: string }): Dose {
  return {
    id: `${over.medId ?? 'm1'}-${over.date}-${over.time ?? '08:00'}`,
    medId: 'm1', time: '08:00', totalMin: 480, status: 'upcoming', ...over,
  };
}

describe('outcomeFor', () => {
  const now = new Date(2026, 7, 28, 10, 0);
  it('taken / skipped directos', () => {
    expect(outcomeFor({ status: 'taken' }, '2026-08-28', '08:00', now)).toBe('taken');
    expect(outcomeFor({ status: 'skipped' }, '2026-08-28', '08:00', now)).toBe('skipped');
  });
  it('sin fila y hora ya pasada → missed', () => {
    expect(outcomeFor(undefined, '2026-08-28', '08:00', now)).toBe('missed');
  });
  it('sin fila y hora futura → pending', () => {
    expect(outcomeFor(undefined, '2026-08-28', '11:00', now)).toBe('pending');
  });
  it('fila upcoming/now se resuelve por la hora', () => {
    expect(outcomeFor({ status: 'upcoming' }, '2026-08-28', '08:00', now)).toBe('missed');
    expect(outcomeFor({ status: 'now' }, '2026-08-28', '12:00', now)).toBe('pending');
  });
  it('frontera: exactamente ahora cuenta como pending', () => {
    expect(outcomeFor(undefined, '2026-08-28', '10:00', now)).toBe('pending');
    expect(outcomeFor(undefined, '2026-08-28', '09:59', now)).toBe('missed');
  });
});

describe('buildAdherence', () => {
  const now = new Date(2026, 7, 28, 23, 59);

  it('rango de un día, todo tomado → rate 1', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } });
    const rows = [
      row({ date: '2026-08-28', time: '08:00', status: 'taken' }),
      row({ date: '2026-08-28', time: '20:00', status: 'taken' }),
    ];
    const a = buildAdherence([m], rows, '2026-08-28', '2026-08-28', now);
    expect(a).toMatchObject({ taken: 2, skipped: 0, missed: 0, rate: 1 });
    expect(a.perDay).toHaveLength(1);
    expect(a.perDay[0]).toMatchObject({ date: '2026-08-28', taken: 2, scheduled: 2 });
    expect(a.perMed[0]).toMatchObject({ medId: 'm1', taken: 2, rate: 1 });
  });

  it('día hueco (sin filas) en el pasado cuenta como olvidos', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00'] } });
    const a = buildAdherence([m], [], '2026-08-26', '2026-08-28', now);
    expect(a.missed).toBe(3);
    expect(a.rate).toBe(0);
    expect(a.perDay.map(d => d.date)).toEqual(['2026-08-26', '2026-08-27', '2026-08-28']);
  });

  it('omitidas fuera del ratio pero contadas', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } });
    const rows = [
      row({ date: '2026-08-28', time: '08:00', status: 'taken' }),
      row({ date: '2026-08-28', time: '20:00', status: 'skipped' }),
    ];
    const a = buildAdherence([m], rows, '2026-08-28', '2026-08-28', now);
    expect(a).toMatchObject({ taken: 1, skipped: 1, missed: 0, rate: 1 }); // 1/(1+0)
  });

  it('rate null cuando no hay ninguna toma debida (solo pending)', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00'] } });
    const future = new Date(2026, 7, 28, 6, 0);
    const a = buildAdherence([m], [], '2026-08-28', '2026-08-28', future);
    expect(a.rate).toBeNull();
    expect(a.perDay[0]).toMatchObject({ pending: 1, scheduled: 1 });
    expect(a.perMed).toEqual([]);
  });

  it('cuenta una fila taken aunque la medicina esté ahora pausada', () => {
    const m = med({ paused: true });
    const rows = [row({ date: '2026-08-28', time: '08:00', status: 'taken' })];
    const a = buildAdherence([m], rows, '2026-08-28', '2026-08-28', now);
    expect(a).toMatchObject({ taken: 1, rate: 1 });
  });

  it('ignora filas de una medicina que ya no existe', () => {
    const rows = [row({ date: '2026-08-28', medId: 'zombie', time: '08:00', status: 'taken' })];
    const a = buildAdherence([med()], rows, '2026-08-28', '2026-08-28', now);
    // m1 esperaba 08:00, sin fila → missed. zombie no cuenta.
    expect(a).toMatchObject({ taken: 0, missed: 1 });
  });

  it('medicina que empieza a mitad del rango', () => {
    const m = med({ duration: { kind: 'ongoing', startedOn: '2026-08-27' } });
    const a = buildAdherence([m], [], '2026-08-25', '2026-08-28', now);
    // solo 27 y 28 esperan dosis → 2 olvidos
    expect(a.missed).toBe(2);
    expect(a.perDay.filter(d => d.scheduled > 0).map(d => d.date))
      .toEqual(['2026-08-27', '2026-08-28']);
  });

  it('no cuenta 2 veces una toma pospuesta que cruzó medianoche', () => {
    const m = med({ schedule: { freq: 'daily', times: ['23:55'] } });
    // dose-action pospuso la toma del 30 a las 00:05 del 31: la fila conserva su
    // id (segmento de fecha = 30) pero `date` pasa a 31 y `time` a 00:05.
    const moved: Dose = {
      id: 'm1-2026-08-30-23:55', medId: 'm1', time: '00:05',
      totalMin: 5, status: 'taken', date: '2026-08-31',
    };
    const at = new Date(2026, 7, 31, 12, 0);
    const a = buildAdherence([m], [moved], '2026-08-30', '2026-08-31', at);
    expect(a.taken).toBe(1);
    expect(a.perDay.find(d => d.date === '2026-08-30')).toMatchObject({ taken: 1 });
    expect(a.perDay.find(d => d.date === '2026-08-31')).toMatchObject({ taken: 0 });
  });

  it('perMed en el orden de `meds`, solo con dosis esperadas', () => {
    const a = med({ id: 'a', schedule: { freq: 'weekdays', times: ['08:00'], weekdays: [1] } });
    const b = med({ id: 'b' });
    // 2026-08-28 es viernes → 'a' no espera nada
    const res = buildAdherence([a, b], [], '2026-08-28', '2026-08-28', now);
    expect(res.perMed.map(p => p.medId)).toEqual(['b']);
  });
});

describe('adherenceLabel', () => {
  it('umbrales', () => {
    expect(adherenceLabel(null, 'es')).toBe('—');
    expect(adherenceLabel(0.95, 'es')).toBe('Excelente');
    expect(adherenceLabel(0.8, 'es')).toBe('Buena');
    expect(adherenceLabel(0.5, 'es')).toBe('Irregular');
    expect(adherenceLabel(0.95, 'en')).toBe('Excellent');
    expect(adherenceLabel(0.8, 'en')).toBe('Good');
  });
});
