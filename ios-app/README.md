# iOS App Wrapper (Nihongo Studio)

This folder contains a Capacitor iOS wrapper for offline Nihongo practice.

## Structure
- `web/`: local offline web bundle loaded by WKWebView.
- `scripts/sync-web-assets.sh`: refreshes iOS bundle from root web assets.
- `docs/testflight-internal.md`: internal TestFlight flow.

## Commands
```bash
npm install
npm run sync:web
npx cap add ios
npx cap sync ios
npx cap open ios
./scripts/run-sim.sh
./scripts/archive-release.sh
```
