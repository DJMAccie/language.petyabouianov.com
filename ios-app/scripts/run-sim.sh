#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run sync:web
npx cap sync ios

echo "Open Xcode to run on simulator:"
echo "  npx cap open ios"
