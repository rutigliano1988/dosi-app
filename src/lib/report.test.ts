import { describe, it, expect } from 'vitest';
import { buildReport, reportFileName, scheduleText } from './report';
import type { Medicine, Dose } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'Sintrom', dose: '4 mg', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-01-01' },
    stock: 30, ...over,
  };
}
function row(o: Partial<Dose> & { date: string }): Dose {
  return { id: `m1-${o.date}-${o.time ?? '08:00'}`, medId: 'm1', time: '08:00', totalMin: 480, status: 'upcoming', ...o };
}

describe('scheduleText', () => {
  it('daily → horas', () => {
    expect(scheduleText(med({ schedule: { freq: 'daily', times: ['08:00', '20:00'] } }))).toBe('08:00, 20:00');
  });
  it('weekdays → prefijo de días', () => {
    expect(scheduleText(med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } })))
      .toBe('L, X, V · 09:00');
  });
});

describe('reportFileName', () => {
  it('sanea nombre con acentos y espacios', () => {
    expect(reportFileName('Ana Pérez', '2026-06-01', '2026-08-30'))
      .toBe('dosi-informe-ana-perez-2026-06-01-2026-08-30.pdf');
  });
  it('nombre vacío → paciente', () => {
    expect(reportFileName('', '2026-06-01', '2026-08-30')).toBe('dosi-informe-paciente-2026-06-01-2026-08-30.pdf');
  });
});

describe('buildReport', () => {
  const now = new Date(2026, 7, 28, 23, 59);

  it('estructura básica', () => {
    const rows = [
      row({ date: '2026-08-27', time: '08:00', status: 'taken' }),
      row({ date: '2026-08-28', time: '08:00', status: 'skipped' }),
    ];
    const r = buildReport([med()], rows, '2026-08-26', '2026-08-28', now, 'Ana');
    expect(r.userName).toBe('Ana');
    expect(r.activeMedCount).toBe(1);
    expect(r.medLines[0]).toMatchObject({ name: 'Sintrom', taken: 1, skipped: 1, missed: 1 });
    // incidencias: 26 olvidada + 28 omitida, ordenadas asc
    expect(r.incidents.map(i => `${i.dateISO}/${i.kind}`)).toEqual(['2026-08-26/missed', '2026-08-28/skipped']);
  });

  it('rango sin dosis debidas → summary.rate null, sin incidencias', () => {
    const future = new Date(2026, 7, 28, 6, 0);
    const r = buildReport([med()], [], '2026-08-28', '2026-08-28', future, 'Ana');
    expect(r.summary.rate).toBeNull();
    expect(r.incidents).toEqual([]);
  });

  it('meds vacías o rango invertido no lanzan', () => {
    expect(() => buildReport([], [], '2026-08-28', '2026-08-01', now, 'Ana')).not.toThrow();
    const r = buildReport([], [], '2026-08-28', '2026-08-01', now, 'Ana');
    expect(r.medLines).toEqual([]);
    expect(r.summary.rate).toBeNull();
  });
});
