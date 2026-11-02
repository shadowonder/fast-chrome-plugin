import { useState } from 'react';
import { DEMO_KEY, runPageAction } from '../page';

export function Popup() {
  const [area, setArea] = useState<'local' | 'session'>('local');
  const [result, setResult] = useState('Choose an action on the current webpage.');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: 'title' | 'get' | 'set' | 'remove') {
    setBusy(true);
    setError(false);
    try {
      const value = await runPageAction(action, area);
      setResult(value === null ? 'The demo key is not set.' : value || '(empty value)');
    } catch (error) {
      setError(true);
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Page tools</h1>
      <button disabled={busy} onClick={() => void run('title')}>
        Read page title
      </button>
      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading">Webpage storage</h2>
        <label htmlFor="storage-area">Storage location</label>
        <select
          id="storage-area"
          value={area}
          disabled={busy}
          onChange={(event) => setArea(event.target.value as 'local' | 'session')}
        >
          <option value="local">localStorage</option>
          <option value="session">sessionStorage</option>
        </select>
        <p>
          Only <code>{DEMO_KEY}</code> is read or changed. This value is visible to the website.
        </p>
        <div className="actions">
          <button disabled={busy} onClick={() => void run('set')}>
            Save demo
          </button>
          <button disabled={busy} onClick={() => void run('get')}>
            Read demo
          </button>
          <button disabled={busy} onClick={() => void run('remove')}>
            Remove demo
          </button>
        </div>
      </section>
      <output aria-live="polite" aria-busy={busy} className={error ? 'result error' : 'result'}>
        {busy ? 'Working…' : result}
      </output>
    </main>
  );
}
