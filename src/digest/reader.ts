import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  instant: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// Parse one log line at the edge. Anything that is not a valid run line is null.
function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || job === '') return null;
  const instant = Date.parse(at);
  if (Number.isNaN(instant)) return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, instant, job, status, owner, error: error ?? null };
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  // Order by actual instant; ties keep file order (sort is stable).
  const sorted = [...lines].sort((a, b) => a.instant - b.instant);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  let owner: string | null = null;
  let lastError: string | null = null;
  let retries = 0;
  for (const line of sorted) {
    if (line.owner !== null) owner = line.owner;
    if (line.status === 'retry') retries += 1;
    if (line.status !== 'ok') lastError = line.error;
  }
  return {
    job,
    owner,
    runs: sorted.length,
    retries,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

function isMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

export const readNight: ReadNight = (runsDir, night) => {
  // A night is a file name, never a path.
  if (night === '' || night.includes('/') || night.includes('\\') || night.includes('..')) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines };
};
