import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunStatus } from './types.js';

// Number of log LINES per status for one night (not jobs).
export type NightCounts = Record<RunStatus, number>;

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Same validity rules as the reader: a line that would not parse there is not counted here.
function lineStatus(text: string): RunStatus | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return status as RunStatus;
}

// Reads `<runsDir>/<night>.jsonl`. Bad lines are skipped, a missing file gives zeros.
export function nightCounts(runsDir: string, night: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT') return counts;
    throw err;
  }
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const status = lineStatus(raw);
    if (status !== null) counts[status] += 1;
  }
  return counts;
}
