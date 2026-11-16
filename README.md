# Stock Tracker

Offline app to record stock buys and sells, pick which buy lots each sale comes from, and see holdings with weighted average price. Amounts are in ₹. Specs are in `.kiro/specs/stock-tracker/`.

It runs in two ways from one codebase (React, TypeScript, Vite):

| Where | Storage |
|---|---|
| Browser (desktop or Android Chrome) | IndexedDB, with persistent storage requested |
| Android APK (Capacitor) | Native SQLite in the app's private storage |

## Develop in the browser

```powershell
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
```

On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd` instead.

## Build the APK with GitHub Actions

1. Push this repo to GitHub (branch `main` or `master`).
2. The workflow `.github/workflows/build-apk.yml` runs on every push. You can also run it from the Actions tab (Run workflow).
3. When it finishes, open the run and download the artifact `stock-tracker-debug-apk`. It contains `app-debug.apk`.

## Install on your phone

1. Copy `app-debug.apk` to the phone and open it. Allow "Install unknown apps" for the app you opened it from.
2. Updates must use the same signing key. Debug builds from GitHub Actions use a new debug key per runner, so an update may require uninstalling first.
3. **Uninstalling the app or clearing its data deletes all records.** Use Backup > Export first, and Import after reinstalling.

## Backup

The Backup tab exports all data as JSON (on Android it opens the share sheet so you can save it to Drive or Files) and imports a previous export. Import validates the file and replaces all data after confirmation.

## Browser caveats

Clearing Chrome's site data deletes browser-stored records. Export backups regularly if you use the browser build for real data.

## Optional: build locally

Needs JDK 21 and the Android SDK (Android Studio):

```powershell
npm run build
npx cap sync android
cd android; .\gradlew.bat assembleDebug
```
