import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Digest } from '../src/digest/types.js';

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

function line(at: string, job: string, status: string, owner: string | null, error: string | null = null) {
  return JSON.stringify({ at, job, status, owner, error });
}

function writeNight(night: string, lines: string[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n') + (lines.length > 0 ? '\n' : ''));
}

// Jobs are written out of order on purpose: the digest sorts by job.
const NORMAL = [
  line('2026-10-29T01:30:00+01:00', 'zeta/fetch', 'retry', null, 'upstream 503'),
  line('2026-10-29T01:31:00+01:00', 'zeta/fetch', 'retry', null, 'upstream 503'),
  line('2026-10-29T01:32:00+01:00', 'zeta/fetch', 'retry', null, 'upstream 503'),
  line('2026-10-29T01:33:00+01:00', 'zeta/fetch', 'fail', null, 'gave up'),
  line('2026-10-29T02:00:00+01:00', 'alpha/sync', 'ok', 'rook'),
  line('2026-10-29T03:00:00+01:00', 'beta/backup', 'ok', 'sam'),
];

const TRUNCATED = '{"at":"2026-10-29T01:30:00+01:00","job":"trunc';

// The cells of each table row in the page, in page order, tags stripped.
function tableRows(html: string): string[][] {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1]!.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((td) => td[1]!.replace(/<[^>]*>/g, '')),
  );
}

describe('GET /digest/:night', () => {
  it('answers 200 with the night and its jobs', async () => {
    writeNight('2026-10-28', NORMAL);
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('digest · 2026-10-28');
    for (const job of ['alpha/sync', 'beta/backup', 'zeta/fetch']) expect(html).toContain(job);
    expect(html).not.toContain('skipped');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for this night');
  });

  it('answers 200 and says nothing ran for an empty night', async () => {
    writeNight('2026-10-27', []);
    const res = await app().request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('answers 200 and says one line was skipped for a night with a bad line', async () => {
    writeNight('2026-10-28', [NORMAL[4]!, TRUNCATED, NORMAL[5]!]);
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 bad line skipped');
    expect(html).toContain('alpha/sync');
    expect(html).toContain('beta/backup');
  });

  it('renders a null owner as — and marks FAIL and many retries', async () => {
    writeNight('2026-10-28', NORMAL);
    const html = await (await app().request('/digest/2026-10-28')).text();
    const rows = tableRows(html);
    const zeta = rows.find((cells) => cells[0] === 'zeta/fetch');
    expect(zeta).toBeDefined();
    expect(zeta![1]).toBe('—');
    expect(zeta![3]).toBe('3');
    expect(zeta![4]).toBe('fail');
    expect(zeta![5]).toBe('FAIL · MANY RETRIES (3)');
    const alpha = rows.find((cells) => cells[0] === 'alpha/sync');
    expect(alpha![1]).toBe('rook');
    expect(alpha![5]).toBe('ok');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with the digest as JSON, sorted by job', async () => {
    writeNight('2026-10-28', NORMAL);
    const res = await app().request('/api/digest/2026-10-28');
    const digest = (await res.json()) as Digest;
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(digest.night).toBe('2026-10-28');
    expect(digest.badLines).toBe(0);
    expect(digest.rows.map((r) => r.job)).toEqual(['alpha/sync', 'beta/backup', 'zeta/fetch']);
    expect(digest.rows[2]).toEqual({
      job: 'zeta/fetch',
      owner: null,
      runs: 4,
      retries: 3,
      lastStatus: 'fail',
      lastError: 'gave up',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:33:00+01:00',
    });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('answers 200 with no rows for an empty night', async () => {
    writeNight('2026-10-27', []);
    const res = await app().request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
  });

  it('answers 200 with badLines 1 for a night with a bad line', async () => {
    writeNight('2026-10-28', [NORMAL[4]!, TRUNCATED, NORMAL[5]!]);
    const res = await app().request('/api/digest/2026-10-28');
    const digest = (await res.json()) as Digest;
    expect(res.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((r) => r.job)).toEqual(['alpha/sync', 'beta/backup']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order, with the same owners', async () => {
    writeNight('2026-10-28', NORMAL);
    const html = await (await app().request('/digest/2026-10-28')).text();
    const digest = (await (await app().request('/api/digest/2026-10-28')).json()) as Digest;
    const rows = tableRows(html);
    expect(rows.map((cells) => cells[0])).toEqual(digest.rows.map((r) => r.job));
    expect(rows.map((cells) => cells[1])).toEqual(digest.rows.map((r) => r.owner ?? '—'));
    expect(digest.rows.find((r) => r.job === 'zeta/fetch')?.owner).toBeNull();
  });

  it('both report the bad line count', async () => {
    writeNight('2026-10-28', [NORMAL[4]!, 'not json']);
    const html = await (await app().request('/digest/2026-10-28')).text();
    const digest = (await (await app().request('/api/digest/2026-10-28')).json()) as Digest;
    expect(digest.badLines).toBe(1);
    expect(html).toContain('1 bad line skipped');
  });
});
