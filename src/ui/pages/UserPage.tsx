import { useState } from 'react';
import { MAX_USER_NAME } from '../../domain/user';
import { useSession } from '../DataContext';

/** First page: pick an existing user or add a new one. */
export function UserPage() {
  const { users, selectUser, addUser } = useSession();
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setError(null);
    setBusy(true);
    try {
      await addUser(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page user-page">
      <h1>Stock Tracker</h1>

      {users.length > 0 && (
        <>
          <h2>Select user</h2>
          <label className="field">
            <span>User</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Choose a user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary wide" disabled={!selected} onClick={() => selectUser(selected)}>
            Continue
          </button>
          <div className="divider">or</div>
        </>
      )}

      <h2>{users.length > 0 ? 'Add new user' : 'Create your first user'}</h2>
      <label className="field">
        <span>User name</span>
        <input
          value={name}
          maxLength={MAX_USER_NAME}
          placeholder="e.g. Vijay"
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim() && !busy) void add();
          }}
        />
        {error && <div className="field-error">{error}</div>}
      </label>
      <button className="btn wide" disabled={!name.trim() || busy} onClick={add}>
        Add and continue
      </button>
    </main>
  );
}
