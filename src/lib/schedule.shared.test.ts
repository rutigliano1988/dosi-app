import { describe, it, expect } from 'vitest';
import * as browser from './schedule';
import * as shared from '../../supabase/functions/_shared/schedule';
import type { Medicine } from '../data/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 10,
    ...over,
  };
}

// Vectores idénticos a schedule.test.ts — si el motor compartido diverge, falla aquí.
describe('paridad browser ↔ _shared', () => {
  const now = new Date(2026, 7, 28, 8, 5);
  const today = new Date(2026, 7, 28);

  it('isoDate', () => {
    expect(shared.isoDate(new Date(2026, 7, 28))).toBe(browser.isoDate(new Date(2026, 7, 28)));
    expect(shared.isoDate(new Date(2026, 7, 28))).toBe('2026-08-28');
  });

  it('daysBetween', () => {
    expect(shared.daysBetween('2026-08-25', new Date(2026, 7, 28))).toBe(3);
    expect(shared.daysBetween('2026-08-25', new Date(2026, 7, 28)))
      .toBe(browser.daysBetween('2026-08-25', new Date(2026, 7, 28)));
  });

  it('isoWeekday', () => {
    expect(shared.isoWeekday(new Date(2026, 7, 31))).toBe(1);
    expect(shared.isoWeekday(new Date(2026, 7, 30))).toBe(7);
  });

  it('medState', () => {
    expect(shared.medState(med(), today)).toBe('active');
    expect(shared.medState(med({ duration: { kind: 'days', days: 3, startedOn: '2026-08-25' } }), today)).toBe('finished');
    expect(shared.medState(med({ paused: true }), today)).toBe('paused');
  });

  it('expandTimes: interval 8h desde 08:00', () => {
    expect(shared.expandTimes(med({ schedule: { freq: 'interval', times: ['08:00'], intervalHours: 8 } })))
      .toEqual(['00:00', '08:00', '16:00']);
  });

  it('expandTimes: interval 6h desde 22:00', () => {
    expect(shared.expandTimes(med({ schedule: { freq: 'interval', times: ['22:00'], intervalHours: 6 } })))
      .toEqual(['04:00', '10:00', '16:00', '22:00']);
  });

  it('expandTimes: descarta formato inválido y de-duplica', () => {
    expect(shared.expandTimes(med({ schedule: { freq: 'daily', times: ['08:00', '08:00', '25:00', 'xx'] } })))
      .toEqual(['08:00']);
  });

  it('isActiveOn: weekdays', () => {
    const m = med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } });
    expect(shared.isActiveOn(m, new Date(2026, 7, 31))).toBe(true);  // lunes
    expect(shared.isActiveOn(m, new Date(2026, 8, 1))).toBe(false);  // martes
  });

  it('buildTodayDoses: ids con fecha local y orden', () => {
    const meds = [
      med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } }),
      med({ id: 'b', schedule: { freq: 'daily', times: ['12:00'] } }),
    ];
    const doses = shared.buildTodayDoses(meds, now);
    expect(doses.map(d => d.id)).toEqual(['a-2026-08-28-08:00', 'b-2026-08-28-12:00', 'a-2026-08-28-20:00']);
  });

  it('buildTodayDoses: paridad exacta de estados con el motor del navegador', () => {
    const meds = [med({ id: 'a', schedule: { freq: 'daily', times: ['08:00', '22:15', '23:30'] } })];
    const noche = new Date(2026, 7, 28, 22, 0);
    expect(shared.buildTodayDoses(meds, noche)).toEqual(browser.buildTodayDoses(meds, noche));
  });

  it('shiftTime', () => {
    expect(shared.shiftTime('23:55', 10)).toBe('00:05');
  });

  it('strToMin / minToStr exportadas', () => {
    expect(shared.strToMin('08:30')).toBe(510);
    expect(shared.minToStr(510)).toBe('08:30');
    expect(shared.minToStr(-10)).toBe('23:50');
  });
});

describe('nowInTz', () => {
  it('convierte un instante UTC al reloj de pared de la zona', () => {
    const d = shared.nowInTz('America/New_York', new Date('2026-01-15T12:00:00Z'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(7); // EST = UTC-5
  });

  it('cruza el cambio de día', () => {
    const d = shared.nowInTz('Asia/Tokyo', new Date('2026-01-15T20:00:00Z'));
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(5); // JST = UTC+9
  });

  it('tz inválida → devuelve base', () => {
    const base = new Date('2026-01-15T20:00:00Z');
    expect(shared.nowInTz('Not/AZone', base).getTime()).toBe(base.getTime());
  });
});
