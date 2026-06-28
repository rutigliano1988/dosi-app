import type { Medicine, Caregiver } from './types';

export const INITIAL_MEDS: Medicine[] = [
  {
    id: 'amox', name: 'Amoxicilina', dose: '500 mg', form: 'capsule',
    color: 'coral',
    schedule: { freq: 'daily', times: ['08:00', '14:00', '20:00'] },
    duration: { kind: 'days', days: 10, startedDay: 4 },
    stock: 12, expiry: '2026-09-12',
    notes: 'Tomar con comida.',
  },
  {
    id: 'lev', name: 'Levotiroxina', dose: '75 mcg', form: 'pill',
    color: 'sage',
    schedule: { freq: 'daily', times: ['07:00'] },
    duration: { kind: 'ongoing' },
    stock: 28, expiry: '2027-03-20',
    notes: 'En ayunas, 30 min antes del desayuno.',
  },
  {
    id: 'omep', name: 'Omeprazol', dose: '20 mg', form: 'capsule',
    color: 'ocean',
    schedule: { freq: 'daily', times: ['07:30'] },
    duration: { kind: 'ongoing' },
    stock: 4, expiry: '2026-06-30',
    notes: 'Antes del desayuno.',
  },
  {
    id: 'vitd', name: 'Vitamina D3', dose: '2000 UI', form: 'drops',
    color: 'amber',
    schedule: { freq: 'daily', times: ['09:00'] },
    duration: { kind: 'ongoing' },
    stock: 45, expiry: '2026-11-04',
    notes: '5 gotas en agua.',
  },
  {
    id: 'mela', name: 'Melatonina', dose: '3 mg', form: 'pill',
    color: 'plum',
    schedule: { freq: 'daily', times: ['22:30'] },
    duration: { kind: 'ongoing' },
    stock: 22, expiry: '2026-08-15',
    notes: '30 minutos antes de dormir.',
  },
  {
    id: 'iron', name: 'Hierro + B12', dose: '50 mg', form: 'pill',
    color: 'rose',
    schedule: { freq: 'daily', times: ['12:00'] },
    duration: { kind: 'days', days: 30, startedDay: 18 },
    stock: 8, expiry: '2026-07-22',
    notes: 'No con café ni té.',
  },
];

export const PATIENT_CAREGIVERS: Caregiver[] = [
  {
    id: 'juan', name: 'Juan García', relationKey: 'cgRoleHusband', color: '#5a8fa8',
    permission: 'edit', addedDate: '15 Mar', notifyOnMiss: true, showInventory: true,
  },
  {
    id: 'sofia', name: 'Dra. Sofía R.', relationKey: 'cgRoleDoc', color: '#7c9070',
    permission: 'view', addedDate: '2 Ene', notifyOnMiss: false, showInventory: false,
  },
];
