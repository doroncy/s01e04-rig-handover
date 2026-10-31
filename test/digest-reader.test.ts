import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('gives 5 jobs, sorted, and 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest!.badLines).toBe(1);
    expect(digest!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries and keeps times as written', () => {
    const row = digest!.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a row whose owner is null', () => {
    const row = digest!.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, lines: string[]) =>
    writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns a digest with no rows for an empty file', () => {
    write('2026-01-02', []);
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('keeps owner null and takes the last non-null owner', () => {
    write('2026-01-03', [
      JSON.stringify({ at: '2026-01-03T01:00:00+01:00', job: 'a', status: 'ok', owner: null }),
      JSON.stringify({ at: '2026-01-03T02:00:00+01:00', job: 'b', status: 'ok', owner: 'x' }),
      JSON.stringify({ at: '2026-01-03T03:00:00+01:00', job: 'b', status: 'ok', owner: null }),
    ]);
    const rows = readNight(dir, '2026-01-03')!.rows;
    expect(rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', 'x'],
    ]);
  });

  it('counts retries, last status and last error by instant', () => {
    write('2026-01-04', [
      JSON.stringify({ at: '2026-01-04T03:00:00+02:00', job: 'j', status: 'fail', owner: 'o', error: 'boom' }),
      JSON.stringify({ at: '2026-01-04T00:30:00Z', job: 'j', status: 'retry', owner: 'o', error: 'slow' }),
      JSON.stringify({ at: '2026-01-04T00:10:00Z', job: 'j', status: 'retry', owner: 'o' }),
      '',
    ]);
    const [row] = readNight(dir, '2026-01-04')!.rows;
    expect(row).toEqual({
      job: 'j',
      owner: 'o',
      runs: 3,
      retries: 2,
      lastStatus: 'fail',
      lastError: 'boom',
      firstAt: '2026-01-04T00:10:00Z',
      lastAt: '2026-01-04T03:00:00+02:00',
    });
  });

  it('counts lines that parse but have the wrong shape as bad', () => {
    write('2026-01-05', [
      JSON.stringify({ at: '2026-01-05T01:00:00Z', job: 'ok-job', status: 'ok', owner: 'o' }),
      JSON.stringify({ at: '2026-01-05T01:00:00Z', job: 'j', status: 'done', owner: 'o' }),
      JSON.stringify({ at: 'not a time', job: 'j', status: 'ok', owner: 'o' }),
      JSON.stringify({ job: 'j', status: 'ok', owner: 'o' }),
      JSON.stringify([1, 2]),
      '42',
      '{not json',
    ]);
    const digest = readNight(dir, '2026-01-05')!;
    expect(digest.badLines).toBe(6);
    expect(digest.rows.map((r) => r.job)).toEqual(['ok-job']);
  });
});
