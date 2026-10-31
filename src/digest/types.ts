// The contract for the morning digest (plan.md § 1). Everything in section 2 builds against this file.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  // `null` when the log line has no owner. The row stays; views show `—`.
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // The error on the job's last failing or retrying line, or null.
  lastError: string | null;
  // Times keep the offset from the log, as written. Never converted to UTC.
  firstAt: string;
  lastAt: string;
};

export type Digest = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that did not parse. Counted, never thrown.
  badLines: number;
};

// Reads `<runsDir>/<night>.jsonl`. Returns null when the night has no file (the page answers 404).
// An empty file returns a digest with no rows.
export type ReadNight = (runsDir: string, night: string) => Digest | null;
