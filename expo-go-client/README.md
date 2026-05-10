# Expo Go Client (Online)

This is a lightweight Expo Go wrapper that loads your live Nihongo Studio site.

## Run

```bash
cd expo-go-client
npm install
cp .env.example .env.local
npm start
```

Then scan the QR code with Expo Go on your iPhone.

## Behavior

- Loads `https://language.petyabouianov.com/nihongo-studio` in a native WebView.
- Uses your existing live server API, so progress updates remain shared between web and phone when online.
- This Expo Go wrapper is for online testing convenience; your full offline airplane implementation remains in `ios-app/`.
