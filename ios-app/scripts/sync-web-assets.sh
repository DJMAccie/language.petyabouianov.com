#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_WEB_DIR="$ROOT_DIR/ios-app/web"

cp "$ROOT_DIR/nihongo-studio.html" "$IOS_WEB_DIR/index.html"
cp "$ROOT_DIR/studio-core.js" "$IOS_WEB_DIR/studio-core.js"
cp "$ROOT_DIR/language-configs.js" "$IOS_WEB_DIR/language-configs.js"
cp "$ROOT_DIR/studio.css" "$IOS_WEB_DIR/studio.css"
cp "$ROOT_DIR/nihongo_lists.json" "$IOS_WEB_DIR/nihongo_lists.json"
cp "$ROOT_DIR/global_scores.json" "$IOS_WEB_DIR/global_scores.json"
cp "$ROOT_DIR/global_word_stats.json" "$IOS_WEB_DIR/global_word_stats.json"
cp "$ROOT_DIR/kanji_mnemonics.json" "$IOS_WEB_DIR/kanji_mnemonics.json"

API_URL="${NIHONGO_API_URL:-https://language.petyabouianov.com/studio_api.php?lang=nihongo}"
SYNC_TOKEN="${STUDIO_API_SYNC_TOKEN:-}"
WRITE_TOKEN="${STUDIO_API_WRITE_TOKEN:-}"
cat > "$IOS_WEB_DIR/ios-config.js" <<EOF
window.NIHONGO_IOS_CONFIG = {
  apiUrl: '${API_URL}',
  syncToken: '${SYNC_TOKEN}',
  writeToken: '${WRITE_TOKEN}'
};
EOF

perl -0pi -e 's#<script src="https://cdn\.tailwindcss\.com"></script>#<script src="vendor/tailwindcss.browser.js"></script>#g' "$IOS_WEB_DIR/index.html"
perl -0pi -e 's#<link href="https://cdnjs\.cloudflare\.com/ajax/libs/font-awesome/6\.0\.0/css/all\.min\.css" rel="stylesheet">#<link href="vendor/fontawesome.min.css" rel="stylesheet">#g' "$IOS_WEB_DIR/index.html"
perl -0pi -e 's#<script defer src="https://unpkg\.com/wanakana"></script>#<script defer src="vendor/wanakana.min.js"></script>#g' "$IOS_WEB_DIR/index.html"

if ! rg -q 'ios-config.js' "$IOS_WEB_DIR/index.html"; then
  perl -0pi -e 's#<script src="language-configs.js"></script>#<script src="language-configs.js"></script>\n    <script src="ios-config.js"></script>#' "$IOS_WEB_DIR/index.html"
fi

if ! rg -q 'offlineSeedPaths' "$IOS_WEB_DIR/index.html"; then
  perl -0pi -e 's#StudioCore\.init\(window\.StudioConfigs\.nihongo\);#if (window.StudioConfigs?.nihongo) {\n                window.StudioConfigs.nihongo.apiUrl = (window.NIHONGO_IOS_CONFIG?.apiUrl || window.StudioConfigs.nihongo.apiUrl);\n                window.StudioConfigs.nihongo.syncToken = window.NIHONGO_IOS_CONFIG?.syncToken || \"\";\n                window.StudioConfigs.nihongo.writeToken = window.NIHONGO_IOS_CONFIG?.writeToken || \"\";\n                window.StudioConfigs.nihongo.enableOfflineSync = true;\n                window.StudioConfigs.nihongo.confettiScriptPath = \"vendor/canvas-confetti.browser.min.js\";\n                window.StudioConfigs.nihongo.offlineSeedPaths = {\n                    lists: \"nihongo_lists.json\",\n                    scores: \"global_scores.json\",\n                    stats: \"global_word_stats.json\",\n                    mnemonics: \"kanji_mnemonics.json\"\n                };\n            }\n\n            StudioCore.init(window.StudioConfigs.nihongo);#' "$IOS_WEB_DIR/index.html"
fi

perl -0pi -e "s/background-image: url\\('https:\\/\\/petyabouianov\\.com\\/images\\/fish\\.jpg'\\);\\n    background-size: cover;\\n    background-position: center;/background:\\n        radial-gradient(circle at 10% 10%, rgba(125, 211, 252, 0.25), transparent 45%),\\n        radial-gradient(circle at 90% 90%, rgba(251, 191, 36, 0.2), transparent 40%),\\n        linear-gradient(160deg, #e2e8f0 0%, #f8fafc 45%, #dbeafe 100%);\\n    background-attachment: fixed;/g" "$IOS_WEB_DIR/studio.css"
perl -0pi -e "s/\\.mac-wallpaper \\{\\n    background: url\\('https:\\/\\/4kwallpapers\\.com\\/images\\/wallpapers\\/macos-big-sur-apple-layers-fluidic-colorful-wwdc-2020-5120x2880-1455\\.jpg'\\);\\n    background-size: cover;\\n    background-position: center;\\n\\}/.mac-wallpaper {\\n    background: linear-gradient(160deg, #dbeafe 0%, #eef2ff 50%, #fef3c7 100%);\\n}/g" "$IOS_WEB_DIR/studio.css"

echo "Synced and patched offline web assets into ios-app/web."
