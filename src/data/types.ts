import type { PillColorKey } from '../theme/tokens';

export type MedForm = 'capsule' | 'pill' | 'syrup' | 'injection' | 'drops';
export type DoseStatus = 'upcoming' | 'now' | 'taken' | 'skipped';
export type FreqKind = 'daily' | 'hours' | 'days';
export type DurationKind = 'ongoing' | 'days';
export type Permission = 'view' | 'edit';

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  form: MedForm;
  color: PillColorKey;
  schedule: {
    freq: FreqKind;
    times: string[];
  };
  duration: {
    kind: DurationKind;
    days?: number;
    startedDay?: number;
  };
  stock: number;
  expiry: string;
  notes?: string;
  paused?: boolean;
}

export interface Dose {
  id: string;
  medId: string;
  time: string;
  totalMin: number;
  status: DoseStatus;
  date?: string; // ISO date — present in historical doses from Supabase
}

export interface Caregiver {
  id: string;
  name: string;
  relationKey: string;
  color: string;
  permission: Permission;
  addedDate: string;
  notifyOnMiss: boolean;
  showInventory: boolean;
}
