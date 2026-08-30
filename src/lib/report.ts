import type { Medicine, Dose } from '../data/types';
import { buildAdherence, type AdherenceSummary } from './adherence';
import { expandTimes, expectedDosesOn } from './schedule';

export interface ReportIncident {
  dateISO: string;
  time: string;
  medName: string;
  kind: 'missed' | 'skipped';
}

export interface ReportMedLine {
  name: string;
  scheduleText: string;
  taken: number;
  missed: number;
  skipped: number;
  rate: number | null;
}

export interface ReportData {
  userName: string;
  fromISO: string;
  toISO: string;
  generatedISO: string;
  summary: AdherenceSummary;
  medLines: ReportMedLine[];
  incidents: ReportIncident[];
  activeMedCount: number;
}

const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function scheduleText(med: Medicine): string {
  const times = expandTimes(med).join(', ');
  if (med.schedule.freq === 'weekdays' && med.schedule.weekdays?.length) {
    const days = [...med.schedule.weekdays].sort((a, b) => a - b).map((d) => WD[d - 1]).join(', ');
    return `${days} · ${times}`;
  }
  return times;
}

export function reportFileName(userName: string, fromISO: string, toISO: string): string {
  const slug = userName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita diacríticos
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'paciente';
  return `dosi-informe-${slug}-${fromISO}-${toISO}.pdf`;
}

export function buildReport(
  meds: Medicine[],
  rows: Dose[],
  fromISO: string,
  toISO: string,
  now: Date,
  userName: string,
): ReportData {
  const summary = buildAdherence(meds, rows, fromISO, toISO, now);
  const nameById = new Map(meds.map((m) => [m.id, m.name]));

  const medLines: ReportMedLine[] = summary.perMed.map((pm) => {
    const med = meds.find((m) => m.id === pm.medId)!;
    return {
      name: med.name,
      scheduleText: scheduleText(med),
      taken: pm.taken,
      missed: pm.missed,
      skipped: pm.skipped,
      rate: pm.rate,
    };
  });

  // Incidencias: recorrer día a día el horario esperado y clasificar cada
  // toma no-tomada. (perDay da conteos, no fecha·hora exacta — por eso se
  // recorre aquí en vez de derivarlo del summary.)
  const incidents: ReportIncident[] = [];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const end = isoToLocal(toISO).getTime();
  for (let d = isoToLocal(fromISO); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const dISO = localToISO(d);
    for (const { medId, time } of expectedDosesOn(meds, d)) {
      const row = rowById.get(`${medId}-${dISO}-${time}`);
      if (row?.status === 'taken') continue;
      const medName = nameById.get(medId) ?? '';
      if (row?.status === 'skipped') {
        incidents.push({ dateISO: dISO, time, medName, kind: 'skipped' });
        continue;
      }
      const [h, m] = time.split(':').map(Number);
      const dt = isoToLocal(dISO);
      dt.setHours(h, m, 0, 0);
      if (dt.getTime() < now.getTime()) {
        incidents.push({ dateISO: dISO, time, medName, kind: 'missed' });
      }
    }
  }
  incidents.sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time));

  return {
    userName,
    fromISO,
    toISO,
    generatedISO: localToISO(now),
    summary,
    medLines,
    incidents,
    activeMedCount: summary.perMed.length,
  };
}

function isoToLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function localToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
