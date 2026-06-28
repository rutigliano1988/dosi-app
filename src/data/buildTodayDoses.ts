import type { Medicine, Dose } from './types';

interface BuildOptions {
  autoMarkTaken?: boolean;
}

export function buildTodayDoses(
  meds: Medicine[],
  nowHour = 13,
  { autoMarkTaken = false }: BuildOptions = {},
): Dose[] {
  const doses: Dose[] = [];

  meds.forEach(m => {
    if (m.paused) return;
    m.schedule.times.forEach(t => {
      const [h, mi] = t.split(':').map(Number);
      const totalMin = h * 60 + mi;
      const nowMin = nowHour * 60;

      let status: Dose['status'] = 'upcoming';
      if (autoMarkTaken && totalMin < nowMin - 30) status = 'taken';
      else if (totalMin >= nowMin - 30 && totalMin < nowMin + 30) status = 'now';

      doses.push({ id: `${m.id}-${t}`, medId: m.id, time: t, totalMin, status });
    });
  });

  return doses.sort((a, b) => a.totalMin - b.totalMin);
}

export function shiftTime(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const nm = String(total % 60).padStart(2, '0');
  return `${nh}:${nm}`;
}
