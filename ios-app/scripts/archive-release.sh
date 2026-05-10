#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_DIR="$ROOT_DIR/build"
ARCHIVE_PATH="$ARCHIVE_DIR/NihongoStudio.xcarchive"
EXPORT_PATH="$ARCHIVE_DIR/export"
EXPORT_OPTIONS="$ROOT_DIR/scripts/ExportOptions-AppStore.plist"

mkdir -p "$ARCHIVE_DIR"

cd "$ROOT_DIR"
npm run sync:web
npx cap sync ios

xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  archive

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS"

echo "Archive export complete at: $EXPORT_PATH"
echo "Upload with Xcode Organizer or Transporter for TestFlight internal distribution."
