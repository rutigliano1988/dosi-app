import type { Medicine, Dose } from './types';
import { pushMed, pushDose, deleteMed } from './sync';

export type OutboxOp =
  | { t: 'med'; med: Medicine }
  | { t: 'dose'; dose: Dose }
  | { t: 'delMed'; id: string };

const KEY = 'dosi:outbox';
const MAX = 300;

function read(): OutboxOp[] {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) as OutboxOp[] : []; }
  catch { return []; }
}
function write(ops: OutboxOp[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ops.slice(-MAX))); } catch { /* ignore */ }
}

export function enqueue(op: OutboxOp): void { write([...read(), op]); }
export function outboxSize(): number { return read().length; }
export function clearOutbox(): void { write([]); }

/** Replay queued ops in order. Stop at the first failure, keeping it and the rest.
 *  Returns the number of ops still pending afterward. */
export async function flushOutbox(userId: string): Promise<number> {
  let ops = read();
  while (ops.length > 0) {
    const op = ops[0];
    try {
      if (op.t === 'med') await pushMed(op.med, userId);
      else if (op.t === 'dose') await pushDose(op.dose, userId);
      else await deleteMed(op.id);
    } catch {
      break; // keep op + remainder for the next flush
    }
    ops = ops.slice(1);
    write(ops);
  }
  return ops.length;
}
