import { describe, it, expect } from 'vitest';
import {
  isoDate, daysBetween, isoWeekday, medState, expandTimes, isActiveOn, treatmentDay,
  buildTodayDoses, shiftTime, expectedDosesOn,
} from './schedule';
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

describe('isoDate', () => {
  it('formatea en hora local, no UTC', () => {
    expect(isoDate(new Date(2026, 7, 28))).toBe('2026-08-28'); // mes 7 = agosto
  });
});

describe('daysBetween', () => {
  it('cuenta días completos entre una fecha ISO y un Date', () => {
    expect(daysBetween('2026-08-25', new Date(2026, 7, 28))).toBe(3);
    expect(daysBetween('2026-08-28', new Date(2026, 7, 28))).toBe(0);
  });
});

describe('isoWeekday', () => {
  it('lunes = 1, domingo = 7', () => {
    expect(isoWeekday(new Date(2026, 7, 31))).toBe(1); // 31-ago-2026 es lunes
    expect(isoWeekday(new Date(2026, 7, 30))).toBe(7); // 30-ago-2026 es domingo
  });
});

describe('medState', () => {
  const today = new Date(2026, 7, 28); // 28-ago-2026

  it('ongoing sin pausa → active', () => {
    expect(medState(med(), today)).toBe('active');
  });
  it('paused gana sobre todo', () => {
    expect(medState(med({ paused: true, duration: { kind: 'days', days: 3, startedOn: '2026-08-01' } }), today)).toBe('paused');
  });
  it('days: aún dentro → active', () => {
    expect(medState(med({ duration: { kind: 'days', days: 10, startedOn: '2026-08-25' } }), today)).toBe('active');
  });
  it('days: alcanzado el total → finished', () => {
    expect(medState(med({ duration: { kind: 'days', days: 3, startedOn: '2026-08-25' } }), today)).toBe('finished');
  });
  it('until: fecha pasada → finished', () => {
    expect(medState(med({ duration: { kind: 'until', until: '2026-08-27', startedOn: '2026-08-01' } }), today)).toBe('finished');
  });
  it('until: hoy → active (incluye el día final)', () => {
    expect(medState(med({ duration: { kind: 'until', until: '2026-08-28', startedOn: '2026-08-01' } }), today)).toBe('active');
  });
});

describe('expandTimes', () => {
  it('daily devuelve times ordenado', () => {
    expect(expandTimes(med({ schedule: { freq: 'daily', times: ['20:00', '08:00'] } }))).toEqual(['08:00', '20:00']);
  });
  it('de-duplica horas idénticas', () => {
    expect(expandTimes(med({ schedule: { freq: 'daily', times: ['08:00', '08:00', '20:00'] } }))).toEqual(['08:00', '20:00']);
  });
  it('descarta entradas con formato inválido', () => {
    expect(expandTimes(med({ schedule: { freq: 'daily', times: ['08:00', 'xx'] } }))).toEqual(['08:00']);
    expect(expandTimes(med({ schedule: { freq: 'daily', times: ['08:00', '8', '25:00', '08:99'] } }))).toEqual(['08:00']);
  });
  it('interval 8h desde 08:00 → 3 tomas', () => {
    expect(expandTimes(med({ schedule: { freq: 'interval', times: ['08:00'], intervalHours: 8 } })))
      .toEqual(['00:00', '08:00', '16:00']);
  });
  it('interval 6h desde 22:00 → 4 tomas', () => {
    expect(expandTimes(med({ schedule: { freq: 'interval', times: ['22:00'], intervalHours: 6 } })))
      .toEqual(['04:00', '10:00', '16:00', '22:00']);
  });
  it('weekdays usa times tal cual', () => {
    expect(expandTimes(med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } }))).toEqual(['09:00']);
  });
});

describe('isActiveOn', () => {
  const lunes = new Date(2026, 7, 31);
  const martes = new Date(2026, 8, 1);
  it('daily activo cualquier día', () => {
    expect(isActiveOn(med(), lunes)).toBe(true);
  });
  it('weekdays solo los días marcados', () => {
    const m = med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } });
    expect(isActiveOn(m, lunes)).toBe(true);
    expect(isActiveOn(m, martes)).toBe(false);
  });
  it('finished nunca activo', () => {
    const m = med({ duration: { kind: 'days', days: 1, startedOn: '2026-08-01' } });
    expect(isActiveOn(m, lunes)).toBe(false);
  });
  it('paused nunca activo', () => {
    expect(isActiveOn(med({ paused: true }), lunes)).toBe(false);
  });
});

describe('treatmentDay', () => {
  const today = new Date(2026, 7, 28);
  it('null si la duración no es "days"', () => {
    expect(treatmentDay(med(), today)).toBeNull();
  });
  it('día actual = días transcurridos + 1', () => {
    expect(treatmentDay(med({ duration: { kind: 'days', days: 10, startedOn: '2026-08-25' } }), today))
      .toEqual({ current: 4, total: 10 });
  });
  it('nunca pasa del total', () => {
    expect(treatmentDay(med({ duration: { kind: 'days', days: 3, startedOn: '2026-08-01' } }), today))
      .toEqual({ current: 3, total: 3 });
  });
  it('nunca baja de 1', () => {
    expect(treatmentDay(med({ duration: { kind: 'days', days: 5, startedOn: '2026-09-10' } }), today))
      .toEqual({ current: 1, total: 5 });
  });
});

describe('buildTodayDoses', () => {
  const now = new Date(2026, 7, 28, 8, 5); // 08:05

  it('genera una dosis por cada hora de cada medicina activa, ordenadas', () => {
    const meds = [
      med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } }),
      med({ id: 'b', schedule: { freq: 'daily', times: ['12:00'] } }),
    ];
    const doses = buildTodayDoses(meds, now);
    expect(doses.map(d => d.time)).toEqual(['08:00', '12:00', '20:00']);
    expect(doses.map(d => d.id)).toEqual(['a-2026-08-28-08:00', 'b-2026-08-28-12:00', 'a-2026-08-28-20:00']);
  });

  it('el id incluye la fecha local de "now" (medId-YYYY-MM-DD-HH:MM)', () => {
    const doses = buildTodayDoses([med({ id: 'a', schedule: { freq: 'daily', times: ['08:00'] } })], now);
    expect(doses[0].id).toMatch(/^a-\d{4}-\d{2}-\d{2}-\d{2}:\d{2}$/);
    expect(doses[0].id).toBe('a-2026-08-28-08:00');
  });

  it('dos fechas distintas para la misma med/hora producen ids distintos', () => {
    const m = med({ id: 'a', schedule: { freq: 'daily', times: ['08:00'] } });
    const d1 = buildTodayDoses([m], new Date(2026, 7, 28, 8, 5))[0];
    const d2 = buildTodayDoses([m], new Date(2026, 7, 29, 8, 5))[0];
    expect(d1.id).toBe('a-2026-08-28-08:00');
    expect(d2.id).toBe('a-2026-08-29-08:00');
    expect(d1.id).not.toBe(d2.id);
  });

  it('marca "missed" las dosis muy pasadas', () => {
    const noche = new Date(2026, 7, 28, 22, 0); // 22:00
    const m = med({ id: 'a', schedule: { freq: 'daily', times: ['08:00', '22:15', '23:30'] } });
    const doses = buildTodayDoses([m], noche);
    expect(doses.find(d => d.time === '08:00')!.status).toBe('missed');
    expect(doses.find(d => d.time === '22:15')!.status).toBe('now');
    expect(doses.find(d => d.time === '23:30')!.status).toBe('upcoming');
  });

  it('ignora horas con formato inválido al construir dosis', () => {
    const m = med({ id: 'a', schedule: { freq: 'daily', times: ['08:00', 'abc'] } });
    const doses = buildTodayDoses([m], now);
    expect(doses.map(d => d.time)).toEqual(['08:00']);
  });

  it('marca "now" las dosis dentro de ±30 min y "upcoming" el resto', () => {
    const doses = buildTodayDoses([med({ id: 'a', schedule: { freq: 'daily', times: ['08:00', '12:00'] } })], now);
    expect(doses.find(d => d.time === '08:00')!.status).toBe('now');
    expect(doses.find(d => d.time === '12:00')!.status).toBe('upcoming');
  });

  it('excluye medicinas pausadas o finalizadas', () => {
    const meds = [
      med({ id: 'a' }),
      med({ id: 'b', paused: true }),
      med({ id: 'c', duration: { kind: 'days', days: 1, startedOn: '2026-08-01' } }),
    ];
    expect(buildTodayDoses(meds, now).map(d => d.medId)).toEqual(['a']);
  });

  it('excluye medicinas de "días concretos" que no tocan hoy', () => {
    // 28-ago-2026 es viernes (isoWeekday 5)
    const soloLunes = med({ id: 'x', schedule: { freq: 'weekdays', times: ['08:00'], weekdays: [1] } });
    expect(buildTodayDoses([soloLunes], now)).toHaveLength(0);
  });
});

describe('shiftTime', () => {
  it('suma minutos con wrap de 24h', () => {
    expect(shiftTime('08:00', 10)).toBe('08:10');
    expect(shiftTime('23:55', 10)).toBe('00:05');
  });
});

describe('expectedDosesOn', () => {
  it('daily: todas las horas expandidas, ordenadas', () => {
    const m = med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } });
    expect(expectedDosesOn([m], new Date(2026, 7, 28))).toEqual([
      { medId: 'a', time: '08:00', totalMin: 480 },
      { medId: 'a', time: '20:00', totalMin: 1200 },
    ]);
  });

  it('weekdays: vacío si el día no está en la lista', () => {
    const m = med({ schedule: { freq: 'weekdays', times: ['09:00'], weekdays: [1, 3, 5] } });
    expect(expectedDosesOn([m], new Date(2026, 8, 1))).toEqual([]);  // martes
    expect(expectedDosesOn([m], new Date(2026, 7, 31)).length).toBe(1); // lunes
  });

  it('interval: hereda la expansión de expandTimes', () => {
    const m = med({ id: 'x', schedule: { freq: 'interval', times: ['08:00'], intervalHours: 8 } });
    expect(expectedDosesOn([m], new Date(2026, 7, 28)).map(d => d.time))
      .toEqual(['00:00', '08:00', '16:00']);
  });

  it('excluye una medicina cuyo tratamiento aún no ha empezado', () => {
    const m = med({ duration: { kind: 'ongoing', startedOn: '2026-09-01' } });
    expect(expectedDosesOn([m], new Date(2026, 7, 28))).toEqual([]);
    expect(expectedDosesOn([m], new Date(2026, 8, 1)).length).toBe(1);
  });

  it('excluye una medicina finalizada (duración en días)', () => {
    const m = med({ schedule: { freq: 'daily', times: ['08:00'] },
      duration: { kind: 'days', days: 3, startedOn: '2026-08-20' } });
    expect(expectedDosesOn([m], new Date(2026, 7, 25))).toEqual([]); // día 5 > 3
    expect(expectedDosesOn([m], new Date(2026, 7, 21)).length).toBe(1); // día 1
  });

  it('excluye una medicina pausada', () => {
    const m = med({ paused: true });
    expect(expectedDosesOn([m], new Date(2026, 7, 28))).toEqual([]);
  });

  it('varias medicinas: mezcla ordenada por hora', () => {
    const a = med({ id: 'a', schedule: { freq: 'daily', times: ['12:00'] } });
    const b = med({ id: 'b', schedule: { freq: 'daily', times: ['08:00'] } });
    expect(expectedDosesOn([a, b], new Date(2026, 7, 28)).map(d => `${d.medId}@${d.time}`))
      .toEqual(['b@08:00', 'a@12:00']);
  });
});

describe('buildTodayDoses tras el refactor (regresión)', () => {
  it('produce exactamente lo mismo que antes para el vector estándar', () => {
    const meds = [
      med({ id: 'a', schedule: { freq: 'daily', times: ['20:00', '08:00'] } }),
      med({ id: 'b', schedule: { freq: 'daily', times: ['12:00'] } }),
    ];
    const now = new Date(2026, 7, 28, 12, 15);
    expect(buildTodayDoses(meds, now)).toEqual([
      { id: 'a-2026-08-28-08:00', medId: 'a', time: '08:00', totalMin: 480, status: 'missed' },
      { id: 'b-2026-08-28-12:00', medId: 'b', time: '12:00', totalMin: 720, status: 'now' },
      { id: 'a-2026-08-28-20:00', medId: 'a', time: '20:00', totalMin: 1200, status: 'upcoming' },
    ]);
  });

  it('no genera dosis de una medicina no iniciada', () => {
    const m = med({ id: 'z', duration: { kind: 'ongoing', startedOn: '2026-09-01' } });
    expect(buildTodayDoses([m], new Date(2026, 7, 28, 9, 0))).toEqual([]);
  });
});
