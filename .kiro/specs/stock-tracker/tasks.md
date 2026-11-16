# Implementation Plan: Stock Tracker

- [ ] 1. Scaffold the project
  - Create a Vite React + TypeScript app in the workspace root, with ESLint and a mobile-first base stylesheet.
  - Add the folder layout from the design (`domain`, `storage`, `services`, `ui`).
  - _Requirements: 8.1, 8.2_

- [ ] 2. Domain layer (pure TypeScript)
  - [ ] 2.1 Define types and helpers
    - `Transaction`, `Allocation`, `TxType`, stock-name normalization (`stockKey`), paise-based money helpers and ₹ formatter.
    - _Requirements: 1.4, 2.6_
  - [ ] 2.2 Validation
    - `validateTx` (positive integer quantity, price > 0, required date, no future date).
    - _Requirements: 1.3, 1.5_
  - [ ] 2.3 Lots, holdings, and last buy/sell
    - `computeLots`, `holdings` (weighted average price, hide zero quantity), `lastBuy`, `lastSell`, `sortLots` (default price descending).
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ] 2.4 Allocation and P/L
    - `validateAllocations` (per-lot limit, total equals sell quantity, same stock, edit-aware) and `realizedPL`.
    - _Requirements: 4.3, 4.4, 4.6, 4.7, 4.9_

- [ ] 3. Storage layer
  - [ ] 3.1 Repository interface
    - Define `Repository` from the design.
    - _Requirements: 6.4_
  - [ ] 3.2 IndexedDB backend (Dexie)
    - Implement all methods with atomic `saveTrade`, `replaceTrade`, `deleteTrade`, `replaceAll`, and `requestPersistence`.
    - _Requirements: 6.1, 6.3, 6.5_
  - [ ] 3.3 SQLite backend (`@capacitor-community/sqlite`)
    - Create the schema, implement all methods with BEGIN/COMMIT/ROLLBACK transactions.
    - _Requirements: 6.2, 6.5_
  - [ ] 3.4 Backend selection
    - `storage/index.ts` picks SQLite when `Capacitor.isNativePlatform()`, else IndexedDB; init and persistence request at startup.
    - _Requirements: 6.2, 6.3_

- [ ] 4. Services
  - [ ] 4.1 TradeService
    - Add buy, add sell with allocations, edit, delete, with the rules for blocked edits and deletes and typed error messages.
    - _Requirements: 4.8, 4.9, 5.2, 5.3, 5.4, 5.5_
  - [ ] 4.2 BackupService
    - Export JSON, validate import (schema and lot consistency), atomic replace.
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 5. UI shell
  - App layout with bottom navigation (Holdings, Trade, Transactions, Backup), routing, and a data context/hooks that load from the service and refresh after writes.
  - _Requirements: 8.1_

- [ ] 6. Holdings page
  - List stock name, average price, total quantity; empty state; tap opens the Trade page for that stock; "+" button.
  - _Requirements: 2.1, 2.4, 2.5, 2.6_

- [ ] 7. Trade page
  - [ ] 7.1 Form
    - Buy/Sell toggle, `StockInput` (autocomplete for Buy, dropdown for Sell), quantity, price, date (default today), inline errors.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 4.1_
  - [ ] 7.2 Last buy / last sell cards
    - Show date, quantity, price, or "NA"; update when the stock changes.
    - _Requirements: 3.1, 3.6_
  - [ ] 7.3 Lot history table
    - Date, price, original quantity, remaining quantity; sortable headers; default price descending; tap again reverses.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_
  - [ ] 7.4 Allocation picker
    - Select lots, editable quantity per lot with defaults, "Allocated X / Sell Y, Z left" summary, Save disabled until Z is 0, show realized P/L after save.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

- [ ] 8. Transactions page
  - List all transactions with realized P/L for sells; edit (reusing the Trade form) and delete with confirmation; show blocked-action messages.
  - _Requirements: 4.9, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 9. Backup page
  - Export and import buttons, replace confirmation, validation error display, persistence status. Use Capacitor Filesystem and Share on Android, Blob download in the browser.
  - _Requirements: 6.3, 7.1, 7.2, 7.3, 7.4_

- [ ] 10. Browser offline support
  - Add `vite-plugin-pwa` with a manifest and asset caching so the browser build works offline.
  - _Requirements: 6.1, 8.2_

- [ ] 11. Android packaging and CI
  - [ ] 11.1 Capacitor setup
    - Add Capacitor and the SQLite, Filesystem, and Share plugins; `npx cap add android`; app id and name; sync script.
    - _Requirements: 6.2, 8.3_
  - [ ] 11.2 GitHub Actions workflow
    - `.github/workflows/build-apk.yml`: Node 20, Java 17, build, `cap sync`, `./gradlew assembleDebug`, upload `app-debug.apk` as an artifact.
    - _Requirements: 8.3_
  - [ ] 11.3 README
    - How to run in the browser, how to trigger the CI build, how to sideload, and the backup-before-uninstall warning.
    - _Requirements: 8.2, 8.3_

- [ ] 12. Final check
  - Run the app in a browser and walk through: buy, partial sell across two lots, edit, delete blocked by dependent sell, export, and import. Confirm every acceptance criterion.
  - _Requirements: all_

- [x] 13. Profit and loss views (added after first review)
  - [x] 13.1 `domain/pnl.ts`: `sellBreakdowns` and `realizedByStock`.
    - _Requirements: 2.7, 2.8, 5.7_
  - [x] 13.2 Holdings page: overall realized P/L card, per-stock P/L, "Fully sold" section.
    - _Requirements: 2.7, 2.8, 2.9_
  - [x] 13.3 Transactions page: linked buy lots with P/L per lot and total for each sell.
    - _Requirements: 5.7_
  - [x] 13.4 Trade page: live P/L column in the lot table and estimated total in the allocation summary.
    - _Requirements: 4.10_

## Notes

- No automated tests are included, as you didn't ask for them. I can add the unit and contract tests described in the design as an extra task.
- The Android build can only be verified once the CI workflow runs on GitHub. I can verify the browser build locally.
