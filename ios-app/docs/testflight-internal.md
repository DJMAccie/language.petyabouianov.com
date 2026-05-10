# Nihongo Studio iOS TestFlight (Internal)

## 1) One-time setup
- In `ios-app/`, create a local env file from `.env.example` and set:
  - `NIHONGO_API_URL` (optional override)
  - `STUDIO_API_SYNC_TOKEN` (must match server `STUDIO_API_SYNC_TOKEN`)
  - `STUDIO_API_WRITE_TOKEN` (recommended; must match server `STUDIO_API_WRITE_TOKEN` when enabled)
- Then from `ios-app/`, run:

```bash
npm install
npm run sync:web
npx cap add ios
npx cap sync ios
```

## 2) Local simulator verification
- Open Xcode project:

```bash
npx cap open ios
```

- In Xcode:
1. Select `App` scheme.
2. Run on an iPhone simulator.
3. Verify no-network launch by enabling Airplane Mode in simulator and confirming quizzes still work.

## 3) Internal TestFlight upload
1. In Xcode, set your signing team and bundle id for your Apple Developer account.
2. Product -> Archive.
3. Distribute App -> App Store Connect -> Upload.
4. In App Store Connect, open your app -> TestFlight -> Internal Testing.
5. Add only your Apple ID as tester.

## 4) Offline + sync checks
- Practice several sessions in Airplane Mode.
- Disable Airplane Mode and relaunch app.
- Confirm sync queue drains and updated scores appear on the website.
