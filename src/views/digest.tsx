import type { Digest, DigestRow } from '../digest/types.js';

const RETRY_LIMIT = 3;

// Missing data is `—`, never an empty cell (styleguide).
function text(value: string | number | null): string | number {
  return value === null || value === '' ? '—' : value;
}

// Marks are words, not only colour, and need no client JS.
function marks(row: DigestRow): string[] {
  const found: string[] = [];
  if (row.lastStatus === 'fail') found.push('FAIL');
  if (row.retries >= RETRY_LIMIT) found.push(`MANY RETRIES (${row.retries})`);
  return found;
}

function Row({ row }: { row: DigestRow }) {
  const flagged = marks(row);
  return (
    <tr>
      <td>{text(row.job)}</td>
      <td>{text(row.owner)}</td>
      <td>{row.runs}</td>
      <td>{row.retries}</td>
      <td>{text(row.lastStatus)}</td>
      <td>{flagged.length > 0 ? <strong class="warn">{flagged.join(' · ')}</strong> : <span class="mute">ok</span>}</td>
      <td>{text(row.lastError)}</td>
      <td>{text(row.firstAt)}</td>
      <td>{text(row.lastAt)}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: Digest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">
          {digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      )}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>flag</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="mute">no run log for this night</p>
    </>
  );
}
