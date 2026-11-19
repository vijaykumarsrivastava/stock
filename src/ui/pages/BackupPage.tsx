import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BackupError, type BackupFile } from '../../services/backupService';
import { Dialog } from '../components/Dialog';
import { useData } from '../DataContext';

export function BackupPage() {
  const { backup, reload, backend, persisted, transactions } = useData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<{ title: string; details: string[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const doExport = async () => {
    setNotice(null);
    try {
      const json = await backup.exportJson();
      const name = `stock-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Capacitor.isNativePlatform()) {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
          import('@capacitor/filesystem'),
          import('@capacitor/share'),
        ]);
        const res = await Filesystem.writeFile({
          path: name,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({ title: 'Stock Tracker backup', url: res.uri, dialogTitle: 'Save backup' });
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }
      setNotice('Backup exported.');
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      // Closing the share sheet is not an error.
      if (!/cancel/i.test(text)) setMessage({ title: 'Export failed.', details: [text] });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    try {
      setPending(backup.parse(await file.text()));
    } catch (e) {
      if (e instanceof BackupError) setMessage({ title: e.message, details: e.details });
      else setMessage({ title: 'Could not read the file.', details: [] });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    const file = pending;
    setPending(null);
    try {
      await backup.importFile(file);
      await reload();
      setNotice(`Imported ${file.transactions.length} transactions.`);
    } catch {
      setMessage({ title: 'Import failed. Your existing data was not changed.', details: [] });
    }
  };

  return (
    <div className="page">
      <h2>Backup</h2>
      <p className="muted">
        Storage: {backend}. {transactions.length} transactions for this user. Export and import cover all users on
        this device.
      </p>
      {persisted === true && <p className="notice">Persistent storage granted by the browser.</p>}
      {persisted === false && (
        <p className="field-error">
          The browser did not grant persistent storage. Clearing site data would delete your records, so export
          backups regularly.
        </p>
      )}

      <button className="btn primary wide" onClick={doExport}>
        Export backup (JSON)
      </button>
      <button className="btn wide" onClick={() => fileInput.current?.click()}>
        Import backup…
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {notice && <div className="notice">{notice}</div>}

      {pending && (
        <Dialog
          title="Replace all data?"
          confirmLabel="Replace"
          danger
          onConfirm={confirmImport}
          onClose={() => setPending(null)}
        >
          <p>
            This file has {pending.transactions.length} transactions (exported {pending.exportedAt.slice(0, 10)}).
            Importing replaces everything currently stored on this device.
          </p>
        </Dialog>
      )}
      {message && <Dialog title={message.title} details={message.details} onClose={() => setMessage(null)} />}
    </div>
  );
}
