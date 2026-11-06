import { useEffect, useState } from 'react';
import { isPlanningMounted, readPageToken, setPlanningView } from '../page';
import { loadPopupTab, savePopupTab } from '../storage';
import type { PopupTab } from '../storage';

// Called directly by a button click to retain clipboard user activation.
export async function copyToken(token: string): Promise<void> {
  if (!token.trim()) throw new Error('No token is available to copy.');
  try {
    await navigator.clipboard.writeText(token);
  } catch {
    throw new Error('Clipboard access failed. Select the token and copy it manually.');
  }
}

export function Popup() {
  const [tab, setTab] = useState<PopupTab>('planning');
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preferenceError, setPreferenceError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      let selected: PopupTab = 'planning';
      try {
        selected = await loadPopupTab();
      } catch {
        if (!cancelled) setPreferenceError('Could not restore the popup tab preference.');
      }
      if (cancelled) return;
      setTab(selected);
      try {
        if (selected === 'token') {
          const value = await readPageToken();
          if (!cancelled) setToken(value);
        } else {
          const value = await isPlanningMounted();
          if (!cancelled) setMounted(value);
        }
      } catch (error) {
        if (!cancelled)
          setError(error instanceof Error ? error.message : 'Cannot access this page.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectTab(selected: PopupTab) {
    setTab(selected);
    setToken('');
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await savePopupTab(selected);
      setPreferenceError('');
    } catch {
      setPreferenceError('Could not save the popup tab preference.');
    }
    try {
      if (selected === 'token') setToken(await readPageToken());
      else setMounted(await isPlanningMounted());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Cannot access this page.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePlanning(enabled: boolean) {
    setBusy(true);
    setError('');
    try {
      setMounted(await setPlanningView(enabled));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update Planning View.');
      // Refresh actual DOM state instead of persisting an optimistic switch.
      try {
        setMounted(await isPlanningMounted());
      } catch {
        setMounted(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function refreshToken() {
    setToken('');
    setError('');
    setNotice('');
    setBusy(true);
    try {
      setToken(await readPageToken());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Cannot read the token.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Page tools</h1>
      <div className="tabs" role="tablist" aria-label="Page tools">
        <button
          id="planning-tab"
          role="tab"
          aria-selected={tab === 'planning'}
          aria-controls="planning-panel"
          disabled={busy}
          onClick={() => void selectTab('planning')}
        >
          Planning
        </button>
        <button
          id="token-tab"
          role="tab"
          aria-selected={tab === 'token'}
          aria-controls="token-panel"
          disabled={busy}
          onClick={() => void selectTab('token')}
        >
          Token
        </button>
      </div>
      {tab === 'planning' ? (
        <section id="planning-panel" role="tabpanel" aria-labelledby="planning-tab">
          <label className="switch-row">
            <span>Display planning view</span>
            <input
              type="checkbox"
              role="switch"
              checked={mounted}
              disabled={busy}
              onChange={(event) => void togglePlanning(event.target.checked)}
            />
          </label>
          <p>
            A page-scoped placeholder beside the configured target. Enabling checks the page's
            GraphQL connection.
          </p>
        </section>
      ) : (
        <section id="token-panel" role="tabpanel" aria-labelledby="token-tab">
          <label htmlFor="page-token">Current page idToken</label>
          <textarea
            id="page-token"
            readOnly
            value={token}
            spellCheck={false}
            autoComplete="off"
            placeholder={busy ? 'Reading token…' : 'No token available'}
          />
          <div className="actions">
            <button
              disabled={busy || !token}
              onClick={() => {
                setNotice('');
                setError('');
                void copyToken(token).then(
                  () => setNotice('Token copied.'),
                  (error: unknown) =>
                    setError(error instanceof Error ? error.message : 'Could not copy the token.'),
                );
              }}
            >
              Copy token
            </button>
            <button disabled={busy} onClick={() => void refreshToken()}>
              Refresh
            </button>
          </div>
          <p>
            The token stays in popup memory. Copy only when needed; your clipboard will contain the
            full token.
          </p>
        </section>
      )}
      {busy && <p role="status">Working…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preferenceError && <p role="alert">{preferenceError}</p>}
      {notice && <p role="status">{notice}</p>}
    </main>
  );
}
