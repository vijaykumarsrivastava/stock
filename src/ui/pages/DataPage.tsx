import { BackupPage } from './BackupPage';
import { PricesPage } from './PricesPage';

/** Current prices first (used often), backup below (used rarely). */
export function DataPage() {
  return (
    <>
      <PricesPage />
      <hr className="section-divider" />
      <BackupPage />
    </>
  );
}
