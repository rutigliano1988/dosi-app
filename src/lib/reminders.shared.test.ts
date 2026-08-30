import { describe, it, expect } from 'vitest';
import {
  dueReminder, daysLeft, stockAlertDecision, expiryAlertDecision, caregiverMissDue,
} from '../../supabase/functions/_shared/reminders';
import type { Medicine } from '../../supabase/functions/_shared/types';

function med(over: Partial<Medicine> = {}): Medicine {
  return {
    id: 'm1', name: 'X', dose: '1 pastilla', form: 'pill', color: 'coral',
    schedule: { freq: 'daily', times: ['08:00'] },
    duration: { kind: 'ongoing', startedOn: '2026-08-01' },
    stock: 30,
    ...over,
  };
}

describe('dueReminder', () => {
  const at = (h: number, m: number) => new Date(2026, 7, 28, h, m);

  it('1er aviso: en punto y hasta +59 min', () => {
    expect(dueReminder({ time: '08:00', status: 'upcoming', reminded_count: 0, reminded_at: null }, at(8, 0))).toBe(true);
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 0, reminded_at: null }, at(8, 59))).toBe(true);
  });

  it('1er aviso: no antes de la hora, no pasados 60 min', () => {
    expect(dueReminder({ time: '08:00', status: 'upcoming', reminded_count: 0, reminded_at: null }, at(7, 59))).toBe(false);
    expect(dueReminder({ time: '08:00', status: 'missed', reminded_count: 0, reminded_at: null }, at(9, 0))).toBe(false);
  });

  it('no avisa dosis ya tomada o saltada', () => {
    expect(dueReminder({ time: '08:00', status: 'taken', reminded_count: 0, reminded_at: null }, at(8, 5))).toBe(false);
    expect(dueReminder({ time: '08:00', status: 'skipped', reminded_count: 0, reminded_at: null }, at(8, 5))).toBe(false);
  });

  it('2º aviso: 15 min después del 1º y dentro de la ventana de 60', () => {
    const remindedAt = new Date(2026, 7, 28, 8, 3).toISOString();
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 1, reminded_at: remindedAt }, at(8, 18))).toBe(true);
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 1, reminded_at: remindedAt }, at(8, 17))).toBe(false);
  });

  it('2º aviso: no si ya pasaron 60 min de la hora de la toma', () => {
    const remindedAt = new Date(2026, 7, 28, 8, 3).toISOString();
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 1, reminded_at: remindedAt }, at(9, 1))).toBe(false);
  });

  it('no hay 3er aviso', () => {
    const remindedAt = new Date(2026, 7, 28, 8, 20).toISOString();
    expect(dueReminder({ time: '08:00', status: 'now', reminded_count: 2, reminded_at: remindedAt }, at(8, 40))).toBe(false);
  });
});

describe('daysLeft', () => {
  it('divide stock entre tomas por día', () => {
    expect(daysLeft(med({ stock: 30, schedule: { freq: 'daily', times: ['08:00'] } }))).toBe(30);
    expect(daysLeft(med({ stock: 30, schedule: { freq: 'daily', times: ['08:00', '20:00'] } }))).toBe(15);
    expect(daysLeft(med({ stock: 10, schedule: { freq: 'interval', times: ['06:00'], intervalHours: 8 } }))).toBe(3);
  });
});

describe('stockAlertDecision', () => {
  it('send cuando ≤3 días y no avisado', () => {
    expect(stockAlertDecision(med({ stock: 3 }), false)).toBe('send');
  });
  it('none cuando ≤3 días y ya avisado', () => {
    expect(stockAlertDecision(med({ stock: 3 }), true)).toBe('none');
  });
  it('clear cuando repuesto por encima del umbral y había aviso', () => {
    expect(stockAlertDecision(med({ stock: 20 }), true)).toBe('clear');
  });
  it('none cuando hay de sobra y nunca se avisó', () => {
    expect(stockAlertDecision(med({ stock: 20 }), false)).toBe('none');
  });
});

describe('expiryAlertDecision', () => {
  const today = new Date(2026, 7, 28);
  it('send cuando caduca dentro de 7 días y no avisado', () => {
    expect(expiryAlertDecision(med({ expiry: '2026-09-02' }), today, false)).toBe('send');
  });
  it('none cuando ya avisado', () => {
    expect(expiryAlertDecision(med({ expiry: '2026-09-02' }), today, true)).toBe('none');
  });
  it('clear cuando ya caducó (o se alejó) y había aviso', () => {
    expect(expiryAlertDecision(med({ expiry: '2026-08-20' }), today, true)).toBe('clear');
    expect(expiryAlertDecision(med({ expiry: '2026-12-01' }), today, true)).toBe('clear');
  });
  it('sin expiry: none, o clear si había aviso viejo', () => {
    expect(expiryAlertDecision(med({ expiry: undefined }), today, false)).toBe('none');
    expect(expiryAlertDecision(med({ expiry: undefined }), today, true)).toBe('clear');
  });
});

describe('caregiverMissDue', () => {
  const at = (h: number, m: number) => new Date(2026, 7, 28, h, m);
  const base = { time: '08:00', status: 'upcoming', reminded_count: 1, reminded_at: null } as const;

  it('true solo en la 2ª hora tras la toma', () => {
    expect(caregiverMissDue({ ...base }, at(8, 59))).toBe(false);  // 59 min
    expect(caregiverMissDue({ ...base }, at(9, 0))).toBe(true);    // 60 min
    expect(caregiverMissDue({ ...base }, at(9, 59))).toBe(true);   // 119 min
    expect(caregiverMissDue({ ...base }, at(10, 0))).toBe(false);  // 120 min
  });

  it('false si el paciente ni recibió sus avisos', () => {
    expect(caregiverMissDue({ ...base, reminded_count: 0 }, at(9, 30))).toBe(false);
  });

  it('false si ya está tomada o saltada', () => {
    expect(caregiverMissDue({ ...base, status: 'taken' }, at(9, 30))).toBe(false);
    expect(caregiverMissDue({ ...base, status: 'skipped' }, at(9, 30))).toBe(false);
  });

  it('toma tardía (23:30): la ventana cruza medianoche con daysAgo=1', () => {
    const late = { ...base, time: '23:30' };
    // mismo día, antes de medianoche: aún no toca (0..29 min)
    expect(caregiverMissDue(late, at(23, 45), 0)).toBe(false);
    // madrugada del día siguiente → daysAgo=1
    expect(caregiverMissDue(late, at(0, 29), 1)).toBe(false); // 59 min
    expect(caregiverMissDue(late, at(0, 30), 1)).toBe(true);  // 60 min
    expect(caregiverMissDue(late, at(1, 29), 1)).toBe(true);  // 119 min
    expect(caregiverMissDue(late, at(1, 30), 1)).toBe(false); // 120 min
  });

  it('toma de las 22:30: parte de la ventana ya cruza medianoche', () => {
    const late = { ...base, time: '22:30' };
    expect(caregiverMissDue(late, at(23, 45), 0)).toBe(true);  // 75 min, mismo día
    expect(caregiverMissDue(late, at(0, 15), 1)).toBe(true);   // 105 min, día siguiente
    expect(caregiverMissDue(late, at(0, 31), 1)).toBe(false);  // 121 min
  });
});
