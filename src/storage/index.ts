import { Capacitor } from '@capacitor/core';
import { IndexedDbRepository } from './indexedDbRepository';
import type { Repository } from './repository';

export type { Repository } from './repository';

/** Pick SQLite inside the Android app and IndexedDB in a browser. */
export async function createRepository(): Promise<Repository> {
  let repo: Repository;
  if (Capacitor.isNativePlatform()) {
    const { SqliteRepository } = await import('./sqliteRepository');
    repo = new SqliteRepository();
  } else {
    repo = new IndexedDbRepository();
  }
  await repo.init();
  return repo;
}
