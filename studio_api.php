<?php
// studio_api.php
// API for Nihongo Studio
ob_start();

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// --- HEADERS (Disable Caching & CORS) ---
header('Content-Type: application/json');
$allowedOrigins = [
    'https://language.petyabouianov.com',
    'https://petyabouianov.com',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'http://127.0.0.1',
];
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin && in_array($requestOrigin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $requestOrigin");
} else {
    header("Access-Control-Allow-Origin: https://language.petyabouianov.com");
}
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("Referrer-Policy: no-referrer");

// --- LOAD PASSWORD CONFIG ---
$config_path = __DIR__ . '/studio_api_config.php';
$admin_password = getenv('STUDIO_API_ADMIN_PASSWORD') ?: '';
if (file_exists($config_path)) {
    require_once $config_path;
}
$has_admin_password = is_string($admin_password) && $admin_password !== '';
$sync_token = isset($sync_token) && is_string($sync_token)
    ? $sync_token
    : (getenv('STUDIO_API_SYNC_TOKEN') ?: '');
$has_sync_token = is_string($sync_token) && $sync_token !== '';
$write_token = isset($write_token) && is_string($write_token)
    ? $write_token
    : (getenv('STUDIO_API_WRITE_TOKEN') ?: '');
$has_write_token = is_string($write_token) && $write_token !== '';
$enforce_score_auth = (getenv('STUDIO_API_ENFORCE_SCORE_AUTH') === '1');
$require_list_write_auth = isset($require_list_write_auth)
    ? filter_var($require_list_write_auth, FILTER_VALIDATE_BOOLEAN)
    : (getenv('STUDIO_API_REQUIRE_LIST_WRITE_AUTH') === '1');

// --- EXTERNAL SIGN-IN CONFIG ---
$google_client_id = isset($google_client_id) && is_string($google_client_id)
    ? trim($google_client_id)
    : trim((string) (getenv('STUDIO_GOOGLE_CLIENT_ID') ?: ''));
$google_client_secret = isset($google_client_secret) && is_string($google_client_secret)
    ? trim($google_client_secret)
    : trim((string) (getenv('STUDIO_GOOGLE_CLIENT_SECRET') ?: ''));
$has_google_signin = $google_client_id !== '' && $google_client_secret !== '';

$apple_service_id = isset($apple_service_id) && is_string($apple_service_id)
    ? trim($apple_service_id)
    : trim((string) (getenv('STUDIO_APPLE_SERVICE_ID') ?: ''));
$apple_team_id = isset($apple_team_id) && is_string($apple_team_id)
    ? trim($apple_team_id)
    : trim((string) (getenv('STUDIO_APPLE_TEAM_ID') ?: ''));
$apple_key_id = isset($apple_key_id) && is_string($apple_key_id)
    ? trim($apple_key_id)
    : trim((string) (getenv('STUDIO_APPLE_KEY_ID') ?: ''));
$apple_private_key = isset($apple_private_key) && is_string($apple_private_key)
    ? $apple_private_key
    : (string) (getenv('STUDIO_APPLE_PRIVATE_KEY') ?: '');

// Checked inline: studio_oauth.php is required further down, so its helpers do
// not exist yet at this point.
$has_apple_signin = $apple_service_id !== ''
    && $apple_team_id !== ''
    && $apple_key_id !== ''
    && trim($apple_private_key) !== '';

// --- PARSE REQUEST ---
$lang = $_GET['lang'] ?? 'nihongo';
$action = $_GET['action'] ?? '';
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($requestMethod === 'OPTIONS') {
    http_response_code(204);
    exit;
}
$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 512000) {
    outputJSON(["error" => "Payload too large"], 413);
}
$inputJSON = file_get_contents('php://input');
$data = json_decode($inputJSON, true);
$data = is_array($data) ? $data : [];
$allow_legacy_token_owner_access = isset($allow_legacy_token_owner_access)
    ? filter_var($allow_legacy_token_owner_access, FILTER_VALIDATE_BOOLEAN)
    : (getenv('STUDIO_ALLOW_LEGACY_TOKEN_ACCESS') !== '0');

// --- ACCOUNT LAYER ---
require_once __DIR__ . '/studio_accounts.php';
require_once __DIR__ . '/studio_oauth.php';

// --- ROUTING CONFIG ---
$legacyGlobalListsFile = __DIR__ . '/global_lists.json';
$listsFilesByLang = [
    'nihongo' => 'nihongo_lists.json',
];
$allowedLangs = array_keys($listsFilesByLang);
$defaultListsBasename = $listsFilesByLang[$lang] ?? null;
$scoresBasename = 'global_scores.json';
$statsBasename = 'global_word_stats.json';
$syncEventsBasename = 'sync_processed_events.json';
$prefsBasename = 'prefs.json';

// Shared, read-only reference content (not account data).
$kanjiMnemonicsFile = __DIR__ . '/kanji_mnemonics.json';
$rateLimitFile = __DIR__ . '/api_rate_limits.json';

// --- HELPER FUNCTIONS ---

function outputJSON($data, $statusCode = 200) {
    http_response_code($statusCode);
    ob_clean();
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// Locking JSON helpers live in studio_accounts.php so account directories can be
// created on demand; these wrappers keep the existing call sites unchanged.
function safeRead($filename) {
    return studioReadJsonFile($filename);
}

function safeModifyJSON($filename, $callback) {
    return studioModifyJsonFile($filename, $callback);
}

function hasValidSyncToken($data, $syncToken, $hasSyncToken) {
    if (!$hasSyncToken) return false;
    $clientToken = trim((string) ($data['sync_token'] ?? ''));
    return $clientToken !== '' && hash_equals($syncToken, $clientToken);
}

function hasValidWriteToken($data, $writeToken, $hasWriteToken) {
    if (!$hasWriteToken) return false;
    $clientToken = trim((string) ($data['write_token'] ?? ''));
    if ($clientToken !== '' && hash_equals($writeToken, $clientToken)) {
        return true;
    }
    return hasValidSyncToken($data, $writeToken, $hasWriteToken);
}

function hasValidAdminPassword($data, $adminPassword, $hasAdminPassword) {
    if (!$hasAdminPassword) return false;
    $clientPassword = (string) ($data['password'] ?? '');
    return $clientPassword !== '' && hash_equals($adminPassword, $clientPassword);
}

// Data requests reach this point only with a signed-in account (or the legacy
// owner bridge), so authorization is already established. These checks remain
// to keep the opt-in config switches meaningful.
function requireWriteAuthorization($data, $writeToken, $hasWriteToken, $syncToken, $hasSyncToken, $adminPassword, $hasAdminPassword) {
    if (!empty($GLOBALS['currentAccount'])) return;
    if (hasValidWriteToken($data, $writeToken, $hasWriteToken)) return;
    if (hasValidSyncToken($data, $syncToken, $hasSyncToken)) return;
    if (hasValidAdminPassword($data, $adminPassword, $hasAdminPassword)) return;
    outputJSON(["error" => "Invalid write authorization"], 403);
}

function requireSyncToken($data, $syncToken, $hasSyncToken) {
    if (!empty($GLOBALS['currentAccount'])) return;
    if (!hasValidSyncToken($data, $syncToken, $hasSyncToken)) {
        outputJSON(["error" => "Invalid sync token"], 403);
    }
}

function requirePostRequest($requestMethod) {
    if ($requestMethod !== 'POST') {
        outputJSON(["error" => "This action requires POST"], 405);
    }
}

function requireJsonContentTypeForPost($requestMethod) {
    if ($requestMethod !== 'POST') return;
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if ($contentType === '') return;
    if (strpos($contentType, 'application/json') !== 0) {
        outputJSON(["error" => "Content-Type must be application/json"], 415);
    }
}

function normalizeListName($value) {
    $name = trim((string) $value);
    $name = preg_replace('/\s+/', ' ', $name);
    return function_exists('mb_substr') ? mb_substr($name, 0, 80) : substr($name, 0, 80);
}

// Account preferences are a small, fixed set of keys. Anything unknown is
// dropped rather than stored, so a client typo can never grow the file, and a
// null (or empty string) clears the key instead of persisting a blank value.
function normalizePrefsPayload($data) {
    $prefs = [];
    if (!is_array($data)) return $prefs;

    if (array_key_exists('japanTripDate', $data)) {
        $raw = $data['japanTripDate'];
        if ($raw === null || $raw === '') {
            $prefs['japanTripDate'] = null;
        } else {
            $date = trim((string) $raw);
            $parsed = DateTime::createFromFormat('!Y-m-d', $date);
            if (!$parsed || $parsed->format('Y-m-d') !== $date) {
                outputJSON(["error" => "Trip date must be a YYYY-MM-DD date"], 400);
            }
            $prefs['japanTripDate'] = $date;
        }
    }

    return $prefs;
}

function normalizeWordEntry($item) {
    if (!is_array($item)) return null;

    $jp = trim((string) ($item['jp'] ?? $item['word'] ?? ''));
    $en = trim((string) ($item['en'] ?? ''));

    if ($jp === '' || $en === '') return null;

    $normalized = [
        'jp' => function_exists('mb_substr') ? mb_substr(preg_replace('/\s+/', ' ', $jp), 0, 160) : substr(preg_replace('/\s+/', ' ', $jp), 0, 160),
        'en' => function_exists('mb_substr') ? mb_substr(preg_replace('/\s+/', ' ', $en), 0, 200) : substr(preg_replace('/\s+/', ' ', $en), 0, 200),
    ];

    // Optional calm-lesson fields. Older two-column lists remain fully compatible.
    $optionalFields = [
        'kana' => 160,
        'romaji' => 160,
        'sentence_jp' => 260,
        'sentence_en' => 300,
        'mnemonic' => 360,
    ];

    foreach ($optionalFields as $field => $limit) {
        $value = trim((string) ($item[$field] ?? ''));
        if ($value === '') continue;
        $value = preg_replace('/\s+/', ' ', $value);
        $normalized[$field] = function_exists('mb_substr') ? mb_substr($value, 0, $limit) : substr($value, 0, $limit);
    }

    return $normalized;
}

function normalizeSessionResultEntry($item) {
    if (!is_array($item)) return null;

    $word = isset($item['jp']) ? trim((string) $item['jp']) : (isset($item['word']) ? trim((string) $item['word']) : '');
    if ($word === '') return null;

    $word = function_exists('mb_substr') ? mb_substr($word, 0, 160) : substr($word, 0, 160);

    return [
        'word' => $word,
        'correct' => !empty($item['correct']),
    ];
}

function applyScoreUpdate(&$rootData, $lang, $listName, $newScore, $mode, $timestampMs) {
    if (!isset($rootData[$lang]) || !is_array($rootData[$lang])) $rootData[$lang] = [];

    $scores = $rootData[$lang];
    $entry = $scores[$listName] ?? [];
    if (!is_array($entry)) {
        $entry = ['jp-en' => (int) $entry, 'en-jp' => 0, 'speech' => 0, 'choice' => 0, 'last_activity' => 0];
    }
    if ($newScore > ($entry[$mode] ?? 0)) {
        $entry[$mode] = $newScore;
    }
    $entry['last_activity'] = $timestampMs;
    $scores[$listName] = $entry;
    $rootData[$lang] = $scores;
}

function applyWordStatsUpdate(&$rootData, $lang, $results, $isPurification, $timestampMs) {
    if (!isset($rootData[$lang]) || !is_array($rootData[$lang])) $rootData[$lang] = [];
    $stats = $rootData[$lang];

    foreach ($results as $item) {
        if (!is_array($item)) continue;

        $word = isset($item['word']) ? trim((string) $item['word']) : '';
        if ($word === '') continue;

        if (!isset($stats[$word])) {
            $stats[$word] = ['correct' => 0, 'wrong' => 0, 'streak' => 0, 'last_review' => 0, 'next_review' => 0, 'seen' => 0];
        }

        $isCorrect = !empty($item['correct']);
        $stats[$word]['seen'] = ($stats[$word]['seen'] ?? 0) + 1;
        $stats[$word]['last_review'] = $timestampMs;

        if ($isCorrect) {
            $stats[$word]['correct']++;
            $stats[$word]['streak']++;
            if ($isPurification) $stats[$word]['wrong'] = 0;

            $streak = $stats[$word]['streak'];
            $days = ($streak == 1) ? 1 : ($streak == 2 ? 3 : ($streak == 3 ? 7 : ($streak == 4 ? 14 : 30)));
            $stats[$word]['next_review'] = $timestampMs + ($days * 86400 * 1000);
        } else {
            $stats[$word]['wrong']++;
            $stats[$word]['streak'] = 0;
            $stats[$word]['next_review'] = $timestampMs;
        }
    }

    $rootData[$lang] = $stats;
}

function markSyncEventAsProcessed($processedFile, $eventId, $timestampMs) {
    $isNew = false;

    safeModifyJSON($processedFile, function($rootData) use (&$isNew, $eventId, $timestampMs) {
        if (!is_array($rootData)) $rootData = [];

        $cutoff = $timestampMs - (45 * 86400 * 1000);
        foreach ($rootData as $id => $seenAt) {
            if (!is_numeric($seenAt) || (int) $seenAt < $cutoff) {
                unset($rootData[$id]);
            }
        }

        if (!isset($rootData[$eventId])) {
            $rootData[$eventId] = $timestampMs;
            $isNew = true;
        }

        if (count($rootData) > 25000) {
            asort($rootData, SORT_NUMERIC);
            while (count($rootData) > 20000) {
                array_shift($rootData);
            }
        }

        return $rootData;
    });

    return $isNew;
}

function normalizeMnemonicEntry($item, $fallbackJp = '') {
    if (!is_array($item)) return null;

    $jp = trim((string) ($item['jp'] ?? $fallbackJp));
    if ($jp === '') return null;

    $mnemonic = trim((string) ($item['mnemonic'] ?? ''));
    $readingCue = trim((string) ($item['reading_cue'] ?? ''));
    $travelContext = trim((string) ($item['travel_context'] ?? ''));
    $emoji = trim((string) ($item['emoji'] ?? '🧠'));
    $imageUrl = trim((string) ($item['image_url'] ?? ''));

    if ($mnemonic === '') $mnemonic = 'Use this kanji as a travel sign anchor.';
    if ($readingCue === '') $readingCue = 'No reading cue yet.';
    if ($travelContext === '') $travelContext = 'General travel context.';
    if ($emoji === '') $emoji = '🧠';
    if ($imageUrl !== '' && !preg_match('/^https?:\\/\\//i', $imageUrl)) {
        $imageUrl = '';
    }

    return [
        'jp' => function_exists('mb_substr') ? mb_substr($jp, 0, 16) : substr($jp, 0, 16),
        'mnemonic' => function_exists('mb_substr') ? mb_substr($mnemonic, 0, 300) : substr($mnemonic, 0, 300),
        'reading_cue' => function_exists('mb_substr') ? mb_substr($readingCue, 0, 200) : substr($readingCue, 0, 200),
        'travel_context' => function_exists('mb_substr') ? mb_substr($travelContext, 0, 220) : substr($travelContext, 0, 220),
        'emoji' => function_exists('mb_substr') ? mb_substr($emoji, 0, 16) : substr($emoji, 0, 16),
        'image_url' => $imageUrl,
    ];
}

function normalizeMnemonicPayload($rawPayload) {
    if (!is_array($rawPayload)) return [];

    $normalized = [];
    foreach ($rawPayload as $key => $value) {
        $fallbackJp = is_string($key) ? $key : '';
        $entry = normalizeMnemonicEntry($value, $fallbackJp);
        if (!$entry) continue;
        $normalized[$entry['jp']] = $entry;
    }

    return $normalized;
}

function hasMeaningfulRuntimeData($value) {
    if (is_array($value)) {
        foreach ($value as $item) {
            if (hasMeaningfulRuntimeData($item)) {
                return true;
            }
        }
        return false;
    }

    if (is_string($value)) {
        return trim($value) !== '';
    }

    return $value !== null;
}

function shouldSeedRuntimeFile($targetPath) {
    if (!file_exists($targetPath)) {
        return true;
    }

    $content = @file_get_contents($targetPath);
    if ($content === false) {
        return true;
    }

    $content = trim($content);
    if ($content === '' || $content === '{}' || $content === '[]') {
        return true;
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        return false;
    }

    return !hasMeaningfulRuntimeData($decoded);
}

function migrateBundledRuntimeSnapshot($targets) {
    $seedDir = __DIR__ . '/runtime-migration';
    $sentinelPath = __DIR__ . '/.runtime-seeded';
    $seedMap = [
        'global_lists.json' => 'lists-seed.json',
        'global_scores.json' => 'scores-seed.json',
        'global_word_stats.json' => 'stats-seed.json',
    ];

    if (file_exists($sentinelPath) || !is_dir($seedDir)) {
        return;
    }

    $seededAny = false;

    foreach ($targets as $targetPath) {
        $basename = basename($targetPath);
        $sourceName = $seedMap[$basename] ?? $basename;
        $sourcePath = $seedDir . '/' . $sourceName;

        if (!file_exists($sourcePath)) {
            continue;
        }

        if (!shouldSeedRuntimeFile($targetPath)) {
            continue;
        }

        if (@copy($sourcePath, $targetPath)) {
            $seededAny = true;
        }
    }

    if ($seededAny) {
        @file_put_contents($sentinelPath, gmdate('c'));
    }
}

function seedLangListsFromLegacyGlobal($lang, $targetPath, $legacyGlobalPath) {
    if (!shouldSeedRuntimeFile($targetPath)) {
        return;
    }

    if (!file_exists($legacyGlobalPath)) {
        return;
    }

    $legacy = json_decode(safeRead($legacyGlobalPath), true);
    if (!is_array($legacy)) {
        return;
    }

    $legacyLists = $legacy[$lang] ?? null;
    if (!is_array($legacyLists) || !hasMeaningfulRuntimeData($legacyLists)) {
        return;
    }

    @file_put_contents(
        $targetPath,
        json_encode([$lang => $legacyLists], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
}

if (!in_array($lang, $allowedLangs, true) || !$defaultListsBasename) {
    outputJSON(["error" => "Invalid language"], 400);
}

// --- AUTHENTICATION & ACCOUNT STORAGE ---

$authActions = ['register', 'login', 'logout', 'whoami', 'session', 'providers', 'auth_google_start', 'auth_google_callback', 'auth_apple_start', 'auth_apple_callback'];
$requirePostActions = ['register', 'login', 'logout'];
$currentAccount = studioCurrentAccount();

// Unauthenticated clients may still act as the owner account with a configured
// secret (transitional: pre-accounts iOS wrapper and deploy-time runtime sync).
if (!$currentAccount) {
    $currentAccount = studioLegacyOwnerAccount(
        $data,
        [$sync_token, $write_token, $admin_password],
        $has_sync_token || $has_write_token || $has_admin_password,
        $allow_legacy_token_owner_access
    );
}

// --- EXTERNAL SIGN-IN (Google) ---
//
// Sign-in uses the authorization-code flow with PKCE. Passing a code to
// ?action=auth_google_callback finishes the round trip and starts a session.
// Accounts are matched on the provider's immutable subject id only; a provider
// identity is never merged into an existing account automatically.

function studioSignInRedirect($query) {
    $target = '/login.html?' . $query;
    if (!headers_sent()) {
        header('Location: ' . $target, true, 302);
    } else {
        echo '<!doctype html><meta http-equiv="refresh" content="0;url=' . htmlspecialchars($target, ENT_QUOTES) . '">';
    }
    // The browser is being sent away; stop here so no JSON error is appended.
    exit;
}

function studioGoogleUseRequested($currentAccount, $hasGoogleSignin) {
    if (!$hasGoogleSignin) return false;
    // Already signed in: no need to start a provider round trip.
    return !$currentAccount;
}

// Finds or creates the account for a verified provider identity, then signs in.
// Shared by every provider: identities are matched on the provider's immutable
// subject id and an existing account is never merged automatically.
function studioCompleteProviderSignIn($identity, $currentAccount, $lang, $basenames, $rateLimitFile) {
    $account = studioFindAccountByIdentity($identity['provider'], $identity['subject']);
    if (!$account) {
        if (!studioRateLimit($rateLimitFile, 'oauth_create|' . studioClientIpAddress(), 20, 3600)) {
            return ['error' => 'Too many sign-up attempts. Please try again later.'];
        }

        $created = studioCreateSocialAccount(
            $identity['provider'],
            $identity['subject'],
            $identity['email'],
            [
                'preferred_username' => $identity['name'],
                'is_admin' => studioCountAccounts() === 0,
            ]
        );

        if (isset($created['error'])) return ['error' => $created['error']];
        $account = $created['account'];
    }

    studioPrepareAccountData($account, $lang, $basenames);
    studioLoginSession($account);
    studioTouchLogin($account);

    return ['account' => $account];
}

// Apple POSTs the authorization response back, so read the code from either the
// form body or the query string.
function studioOAuthRequestValue($key) {
    if (isset($_POST[$key]) && is_string($_POST[$key])) return (string) $_POST[$key];
    if (isset($_GET[$key]) && is_string($_GET[$key])) return (string) $_GET[$key];
    return '';
}

function studioHandleAppleCallback($appleServiceId, $appleTeamId, $appleKeyId, $applePrivateKey, $currentAccount, $lang, $basenames) {
    $state = studioOAuthRequestValue('state');
    $code = studioOAuthRequestValue('code');
    $providerError = studioOAuthRequestValue('error');

    if ($providerError !== '') {
        studioSignInRedirect('error=' . urlencode('Apple sign-in was cancelled.'));
        return;
    }

    if (!studioOAuthConsumeState('apple', $state)) {
        studioSignInRedirect('error=' . urlencode('That sign-in link expired. Please try again.'));
        return;
    }

    if ($code === '') {
        studioSignInRedirect('error=' . urlencode('Apple did not return an authorization code.'));
        return;
    }

    $nonce = studioOAuthConsumeNonce();

    $clientSecret = studioAppleClientSecret($appleTeamId, $appleKeyId, $appleServiceId, $applePrivateKey);
    if (!$clientSecret) {
        studioSignInRedirect('error=' . urlencode('Apple sign-in is misconfigured on the server.'));
        return;
    }

    $idToken = studioAppleExchangeCode($appleServiceId, $clientSecret, $code, studioAppleRedirectUri($lang));
    if (!$idToken) {
        studioSignInRedirect('error=' . urlencode('Could not complete sign-in with Apple. Please try again.'));
        return;
    }

    $claims = studioOAuthVerifyWithNonce(
        $idToken,
        STUDIO_APPLE_JWKS_ENDPOINT,
        $appleServiceId,
        STUDIO_APPLE_ISSUER,
        $nonce
    );
    if (!$claims) {
        error_log('Apple ID token failed verification');
        studioSignInRedirect('error=' . urlencode('Apple returned a token we could not verify. Please try again.'));
        return;
    }

    $identity = studioAppleIdentityFromClaims($claims);
    if (!$identity) {
        studioSignInRedirect('error=' . urlencode('Apple did not return an account identifier.'));
        return;
    }

    // Apple only sends the name on the very first authorization. Capture it now
    // or it is gone for good.
    if (trim((string) $identity['name']) === '') {
        $userJson = studioOAuthRequestValue('user');
        if ($userJson !== '') {
            $userData = json_decode($userJson, true);
            $fullName = trim((string) (($userData['name']['firstName'] ?? '') . ' ' . ($userData['name']['lastName'] ?? '')));
            if ($fullName !== '') $identity['name'] = $fullName;
        }
    }

    $result = studioCompleteProviderSignIn($identity, $currentAccount, $lang, $basenames, $GLOBALS['rateLimitFile'] ?? null);
    if (isset($result['error'])) {
        studioSignInRedirect('error=' . urlencode($result['error']));
        return;
    }

    studioSignInRedirect('signedin=1');
}

function studioHandleGoogleCallback($googleClientId, $googleClientSecret, $currentAccount, $lang, $basenames, $rateLimitFile) {
    // The provider redirects the browser here; any failure returns the visitor to
    // the sign-in page with a short reason instead of a bare JSON error.
    $state = (string) ($_GET['state'] ?? '');
    $code = (string) ($_GET['code'] ?? '');
    $providerError = (string) ($_GET['error'] ?? '');

    if ($providerError !== '') {
        studioSignInRedirect('error=' . urlencode('Google sign-in was cancelled.'));
        return;
    }

    if (!studioOAuthConsumeState('google', $state)) {
        studioSignInRedirect('error=' . urlencode('That sign-in link expired. Please try again.'));
        return;
    }

    if ($code === '') {
        studioSignInRedirect('error=' . urlencode('Google did not return an authorization code.'));
        return;
    }

    $nonce = studioOAuthConsumeNonce();
    $verifier = studioOAuthConsumePkce();

    $idToken = studioGoogleExchangeCode($googleClientId, $googleClientSecret, $code, studioGoogleRedirectUri($lang), $verifier);
    if (!$idToken) {
        studioSignInRedirect('error=' . urlencode('Could not complete sign-in with Google. Please try again.'));
        return;
    }

    $claims = studioVerifyIdToken(
        $idToken,
        STUDIO_GOOGLE_JWKS_ENDPOINT,
        $googleClientId,
        STUDIO_GOOGLE_ISSUERS,
        $nonce
    );
    if (!$claims) {
        error_log('Google ID token failed verification');
        studioSignInRedirect('error=' . urlencode('Google returned a token we could not verify. Please try again.'));
        return;
    }

    $identity = studioGoogleIdentityFromClaims($claims);
    if (!$identity) {
        studioSignInRedirect('error=' . urlencode('Google did not return an account identifier.'));
        return;
    }

    // Never merge: an existing account is only reused when this exact provider
    // identity is already linked to it.
    $account = studioFindAccountByIdentity('google', $identity['subject']);
    if (!$account) {
        if (!studioRateLimit($rateLimitFile, 'oauth_create|' . studioClientIpAddress(), 20, 3600)) {
            studioSignInRedirect('error=' . urlencode('Too many sign-up attempts. Please try again later.'));
            return;
        }

        $created = studioCreateSocialAccount('google', $identity['subject'], $identity['email'], [
            'preferred_username' => $identity['name'],
            'is_admin' => studioCountAccounts() === 0,
        ]);

        if (isset($created['error'])) {
            studioSignInRedirect('error=' . urlencode($created['error']));
            return;
        }
        $account = $created['account'];
    }

    studioPrepareAccountData($account, $lang, $basenames);
    studioLoginSession($account);
    studioTouchLogin($account);

    studioSignInRedirect('signedin=1');
}

if (in_array($action, $authActions, true)) {
    if (in_array($action, $requirePostActions, true)) {
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
    }

    $clientIp = studioClientIpAddress();

    switch ($action) {
        case 'register':
            // Open sign-up, but throttled hard per IP to limit abuse.
            if (!studioRateLimit($rateLimitFile, 'register|' . $clientIp, 5, 3600)) {
                outputJSON(["error" => "Too many sign-up attempts. Please try again later.", "code" => "rate_limited"], 429);
            }

            $requestedUsername = studioNormalizeUsername($data['username'] ?? '');
            if ($requestedUsername !== '') {
                $usernameKey = studioUsernameKey($requestedUsername);
                if (!studioRateLimit($rateLimitFile, 'register_user|' . $usernameKey, 3, 3600)) {
                    outputJSON(["error" => "Too many sign-up attempts for that username.", "code" => "rate_limited"], 429);
                }
            }

            $created = studioCreateAccount(
                $data['username'] ?? '',
                (string) ($data['password'] ?? ''),
                ['is_admin' => studioCountAccounts() === 0]
            );

            if (isset($created['error'])) {
                outputJSON(["error" => $created['error'], "code" => $created['code'] ?? 'register_failed'], $created['status'] ?? 400);
            }

            $newAccount = $created['account'];
            studioPrepareAccountData($newAccount, $lang, [
                'lists' => $defaultListsBasename,
                'scores' => $scoresBasename,
                'stats' => $statsBasename,
                'sync_events' => $syncEventsBasename,
            ]);
            studioLoginSession($newAccount);
            studioTouchLogin($newAccount);

            outputJSON([
                "status" => "success",
                "account" => studioPublicAccount($newAccount),
            ]);
            break;

        case 'login':
            if (!studioRateLimit($rateLimitFile, 'login|' . $clientIp, 20, 900)) {
                outputJSON(["error" => "Too many sign-in attempts. Please wait a few minutes.", "code" => "rate_limited"], 429);
            }

            $attemptedUsername = studioNormalizeUsername($data['username'] ?? '');
            if ($attemptedUsername !== '') {
                if (!studioRateLimit($rateLimitFile, 'login_user|' . studioUsernameKey($attemptedUsername), 10, 900)) {
                    outputJSON(["error" => "Too many sign-in attempts for that account.", "code" => "rate_limited"], 429);
                }
            }

            $account = studioAuthenticate($attemptedUsername, (string) ($data['password'] ?? ''));
            if (!$account) {
                outputJSON(["error" => "Incorrect username or password.", "code" => "invalid_credentials"], 401);
            }

            studioPrepareAccountData($account, $lang, [
                'lists' => $defaultListsBasename,
                'scores' => $scoresBasename,
                'stats' => $statsBasename,
                'sync_events' => $syncEventsBasename,
            ]);
            studioLoginSession($account);
            studioTouchLogin($account);

            outputJSON([
                "status" => "success",
                "account" => studioPublicAccount($account),
            ]);
            break;

        case 'logout':
            studioLogoutSession();
            outputJSON(["status" => "success"]);
            break;

        case 'whoami':
        case 'session':
            if (!$currentAccount) {
                outputJSON([
                    "error" => "Not signed in.",
                    "code" => "unauthenticated",
                    "authenticated" => false,
                ], 401);
            }

            outputJSON([
                "status" => "success",
                "authenticated" => true,
                "account" => studioPublicAccount($currentAccount),
            ]);
            break;

        case 'providers':
            // Lets the sign-in page show only the buttons that can actually work.
            // The diagnostics report whether credentials were read and how long
            // they are, never their values, so a misconfigured config file is
            // easy to spot without leaking the secret.
            outputJSON([
                "status" => "success",
                "google" => $has_google_signin,
                "apple" => $has_apple_signin,
                "diagnostics" => [
                    "config_file_present" => file_exists($config_path),
                    "google_client_id_length" => strlen($google_client_id),
                    "google_secret_length" => strlen($google_client_secret),
                    "apple_service_id_length" => strlen($apple_service_id),
                    "apple_private_key_present" => trim($apple_private_key) !== '',
                ],
            ]);
            break;

        case 'auth_google_start':
            if (!$has_google_signin) {
                outputJSON(["error" => "Google sign-in is not configured.", "code" => "provider_not_configured"], 503);
            }

            // The page navigates to this URL itself, so it works the same in a
            // normal browser and inside the iOS wrapper.
            $state = studioOAuthBeginState('google');
            $nonce = studioOAuthNonce();
            list(, $challenge) = studioOAuthPkcePair();

            outputJSON([
                "status" => "success",
                "authorize_url" => studioGoogleAuthorizeUrl(
                    $google_client_id,
                    studioGoogleRedirectUri($lang),
                    $state,
                    $challenge,
                    $nonce
                ),
            ]);
            break;

        case 'auth_apple_start':
            if (!$has_apple_signin) {
                outputJSON(["error" => "Apple sign-in is not configured.", "code" => "provider_not_configured"], 503);
            }

            $appleState = studioOAuthBeginState('apple');
            $appleNonce = studioOAuthNonce();

            outputJSON([
                "status" => "success",
                "authorize_url" => studioAppleAuthorizeUrl(
                    $apple_service_id,
                    studioAppleRedirectUri($lang),
                    $appleState,
                    $appleNonce
                ),
            ]);
            break;

        case 'auth_apple_callback':
            if (!$has_apple_signin) {
                studioSignInRedirect('error=' . urlencode('Apple sign-in is not configured.'));
                return;
            }

            studioHandleAppleCallback(
                $apple_service_id,
                $apple_team_id,
                $apple_key_id,
                $apple_private_key,
                $currentAccount,
                $lang,
                [
                    'lists' => $defaultListsBasename,
                    'scores' => $scoresBasename,
                    'stats' => $statsBasename,
                    'sync_events' => $syncEventsBasename,
                ]
            );
            break;

        case 'auth_google_callback':
            if (!$has_google_signin) {
                studioSignInRedirect('error=' . urlencode('Google sign-in is not configured.'));
                return;
            }

            studioHandleGoogleCallback($google_client_id, $google_client_secret, $currentAccount, $lang, [
                'lists' => $defaultListsBasename,
                'scores' => $scoresBasename,
                'stats' => $statsBasename,
                'sync_events' => $syncEventsBasename,
            ], $rateLimitFile);
            break;
    }

    outputJSON(["error" => "Invalid action requested"], 400);
}

// --- SHARED LIBRARY ---
//
// The studio is open to everyone: study content is public and read-only, while
// progress is private to an account (or kept in the browser for guests).
$sharedListsFile = __DIR__ . '/' . $defaultListsBasename;

if (!file_exists($sharedListsFile)) {
    file_put_contents(
        $sharedListsFile,
        json_encode([$lang => []], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
    );
}

function readSharedLists($sharedListsFile, $lang) {
    $decoded = json_decode(safeRead($sharedListsFile), true);
    $lists = is_array($decoded) ? ($decoded[$lang] ?? []) : [];
    return is_array($lists) ? $lists : [];
}

// Actions a visitor may use without an account. get_prefs is here because the
// honest answer for a guest is an empty set, not a refusal: the studio has to be
// able to ask what settings exist without being bounced to a sign-in screen.
$publicActions = ['get_shared_lists', 'get_kanji_mnemonics', 'lookup', 'get_prefs'];
$isPublicAction = in_array($action, $publicActions, true);

// Everything else reads or writes account-owned files.
if (!$currentAccount && !$isPublicAction) {
    outputJSON([
        "error" => "Please sign in to continue.",
        "code" => "unauthenticated",
    ], 401);
}

// Account-owned paths (only resolved when a session exists).
$listsFile = null;
$scoresFile = null;
$statsFile = null;
$processedSyncEventsFile = null;
$prefsFile = null;

if ($currentAccount) {
    studioPrepareAccountData($currentAccount, $lang, [
        'lists' => $defaultListsBasename,
        'scores' => $scoresBasename,
        'stats' => $statsBasename,
        'sync_events' => $syncEventsBasename,
    ], false);

    $listsFile = studioAccountDataFile($currentAccount, $defaultListsBasename);
    $scoresFile = studioAccountDataFile($currentAccount, $scoresBasename);
    $statsFile = studioAccountDataFile($currentAccount, $statsBasename);
    $processedSyncEventsFile = studioAccountDataFile($currentAccount, $syncEventsBasename);
    $prefsFile = studioAccountDataFile($currentAccount, $prefsBasename);

    if (!$listsFile || !$scoresFile || !$statsFile || !$processedSyncEventsFile || !$prefsFile) {
        error_log('Account storage path resolution failed for account ' . ($currentAccount['id'] ?? 'unknown'));
        outputJSON(["error" => "Account storage is unavailable."], 500);
    }
}

$isOwner = false;
if ($currentAccount) {
    $ownerAccount = studioOwnerAccount();
    $isOwner = is_array($ownerAccount) && ($ownerAccount['id'] ?? '') === ($currentAccount['id'] ?? '');
}

$defaultBuckets = [];
foreach ($allowedLangs as $allowedLang) {
    $defaultBuckets[$allowedLang] = [];
}

$defaultFileContents = [
    $kanjiMnemonicsFile => ['nihongo' => []],
    $rateLimitFile => [],
];

foreach ($defaultFileContents as $path => $defaults) {
    if (!file_exists($path)) {
        file_put_contents($path, json_encode($defaults, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
}


// --- MAIN LOGIC ---

switch ($action) {
    // Public: the shared study library every visitor can read.
    case 'get_shared_lists':
        studioRateLimit($rateLimitFile, 'get_shared_lists|' . $lang . '|' . studioClientIpAddress(), 120, 60);
        outputJSON(readSharedLists($sharedListsFile, $lang));
        break;

    // The account's own lists. A personal list with the same name as a shared one
    // overrides it for that account only; the shared copy is untouched.
    case 'get_lists':
        outputJSON(readSharedLists($listsFile, $lang));
        break;

    // Combined view: shared library plus this account's personal lists.
    case 'get_visible_lists':
        $shared = readSharedLists($sharedListsFile, $lang);
        $personal = readSharedLists($listsFile, $lang);

        $sharedNames = array_map('strval', array_keys($shared));
        $personalNames = array_map('strval', array_keys($personal));

        $merged = $personal + $shared; // personal wins on a name collision

        outputJSON([
            'lists' => (object) $merged,
            'shared_names' => $sharedNames,
            'personal_names' => $personalNames,
            'is_owner' => $isOwner,
        ]);
        break;

    case 'get_scores':
        $data = json_decode(safeRead($scoresFile), true) ?? [];
        outputJSON($data[$lang] ?? []);
        break;

    case 'get_word_stats':
        $data = json_decode(safeRead($statsFile), true) ?? [];
        outputJSON($data[$lang] ?? []);
        break;

    case 'get_kanji_mnemonics':
        $mnemonicData = json_decode(safeRead($kanjiMnemonicsFile), true) ?? [];
        $langPayload = $mnemonicData[$lang] ?? [];
        outputJSON(normalizeMnemonicPayload($langPayload));
        break;

    // Account settings. A guest keeps their own copy in the browser, so this
    // answers 200 with signedIn=false rather than 401: the client has to be able
    // to ask without being bounced to the sign-in screen mid-session.
    case 'get_prefs':
        studioRateLimit($rateLimitFile, 'get_prefs|' . $lang . '|' . studioClientIpAddress(), 120, 60);
        $storedPrefs = null;
        if ($prefsFile) {
            $decodedPrefs = json_decode(safeRead($prefsFile), true);
            if (is_array($decodedPrefs)) $storedPrefs = $decodedPrefs;
        }
        outputJSON([
            "signedIn" => (bool) $currentAccount,
            "prefs" => $storedPrefs ?: new stdClass(),
        ]);
        break;

    case 'save_prefs':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        if (!$currentAccount || !$prefsFile) {
            outputJSON(["error" => "Sign in to sync settings across devices."], 401);
        }
        studioRateLimit($rateLimitFile, 'save_prefs|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 120, 60);
        if ($enforce_score_auth) {
            requireWriteAuthorization($data, $write_token, $has_write_token, $sync_token, $has_sync_token, $admin_password, $has_admin_password);
        }

        // Accepts either {prefs:{...}} or a flat patch; unknown keys are dropped.
        $normalizedPrefs = normalizePrefsPayload($data['prefs'] ?? $data);

        safeModifyJSON($prefsFile, function($stored) use ($normalizedPrefs) {
            if (!is_array($stored)) $stored = [];
            foreach ($normalizedPrefs as $key => $value) {
                if ($value === null) {
                    unset($stored[$key]);
                    continue;
                }
                $stored[$key] = $value;
            }
            $stored['updatedAt'] = time() * 1000;
            return $stored;
        });

        $savedPrefs = json_decode(safeRead($prefsFile), true);
        outputJSON([
            "status" => "success",
            "prefs" => is_array($savedPrefs) ? $savedPrefs : new stdClass(),
        ]);
        break;

    case 'save_list':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        studioRateLimit($rateLimitFile, 'save_list|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 30, 60);
        if ($require_list_write_auth) {
            requireWriteAuthorization($data, $write_token, $has_write_token, $sync_token, $has_sync_token, $admin_password, $has_admin_password);
        }

        $name = normalizeListName($data['name'] ?? '');
        $rawWords = $data['words'] ?? [];
        $now = time() * 1000;

        if ($name === '') {
            outputJSON(["error" => "List name is required"], 400);
        }

        if (!is_array($rawWords) || count($rawWords) === 0) {
            outputJSON(["error" => "At least one word is required"], 400);
        }

        $words = [];
        $seen = [];
        foreach (array_slice($rawWords, 0, 500) as $item) {
            $normalized = normalizeWordEntry($item);
            if (!$normalized) continue;

            $keyBase = $normalized['jp'] . '|' . $normalized['en'];
            $key = function_exists('mb_strtolower') ? mb_strtolower($keyBase) : strtolower($keyBase);
            if (isset($seen[$key])) continue;

            $seen[$key] = true;
            $words[] = $normalized;
        }

        if (count($words) === 0) {
            outputJSON(["error" => "No valid words were provided"], 400);
        }

        // The shared library is owner-curated; everyone else writes personal
        // lists only. Personal lists never touch the shared copy.
        $scope = ($data['scope'] ?? 'personal') === 'shared' ? 'shared' : 'personal';
        if ($scope === 'shared' && !$isOwner) {
            outputJSON(["error" => "Only the owner can edit the shared library.", "code" => "forbidden"], 403);
        }
        $targetListsFile = $scope === 'shared' ? $sharedListsFile : $listsFile;

        safeModifyJSON($targetListsFile, function($rootData) use ($lang, $name, $words) {
            if (!isset($rootData[$lang])) $rootData[$lang] = [];
            $rootData[$lang][$name] = $words;
            return $rootData;
        });

        // Editing a shared list must not create progress for the curator.
        if ($scope === 'shared') {
            outputJSON(["status" => "success", "scope" => "shared"]);
        }

        safeModifyJSON($scoresFile, function($rootData) use ($lang, $name, $now) {
            if (!isset($rootData[$lang])) $rootData[$lang] = [];
            $scores = $rootData[$lang];
            
            if (!isset($scores[$name]) || !is_array($scores[$name])) {
                $oldScore = (isset($scores[$name]) && is_numeric($scores[$name])) ? $scores[$name] : 0;
                $scores[$name] = ['jp-en' => $oldScore, 'en-jp' => 0, 'last_activity' => $now];
            } else {
                $scores[$name]['last_activity'] = $now;
            }
            $rootData[$lang] = $scores;
            return $rootData;
        });
        
        outputJSON(["status" => "success", "scope" => "personal"]);
        break;

    case 'delete_list':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        studioRateLimit($rateLimitFile, 'delete_list|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 30, 60);
        if ($require_list_write_auth) {
            requireWriteAuthorization($data, $write_token, $has_write_token, $sync_token, $has_sync_token, $admin_password, $has_admin_password);
        }

        $name = normalizeListName($data['name'] ?? '');
        if ($name === '') {
            outputJSON(["error" => "List name is required"], 400);
        }

        // Shared lists are owner-curated; anyone may delete their own copy.
        $scope = ($data['scope'] ?? 'personal') === 'shared' ? 'shared' : 'personal';
        if ($scope === 'shared' && !$isOwner) {
            outputJSON(["error" => "Only the owner can edit the shared library.", "code" => "forbidden"], 403);
        }
        $targetListsFile = $scope === 'shared' ? $sharedListsFile : $listsFile;

        safeModifyJSON($targetListsFile, function($rootData) use ($lang, $name) {
            if (isset($rootData[$lang][$name])) unset($rootData[$lang][$name]);
            return $rootData;
        });

        if ($scope === 'personal') {
            safeModifyJSON($scoresFile, function($rootData) use ($lang, $name) {
                if (isset($rootData[$lang][$name])) unset($rootData[$lang][$name]);
                return $rootData;
            });
        }

        outputJSON(["status" => "success", "scope" => $scope]);
        break;

    case 'save_score':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        studioRateLimit($rateLimitFile, 'save_score|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 180, 60);
        if ($enforce_score_auth) {
            requireWriteAuthorization($data, $write_token, $has_write_token, $sync_token, $has_sync_token, $admin_password, $has_admin_password);
        }

        $listName = normalizeListName($data['listName'] ?? 'Unknown');
        $newScore = max(0, min(100, (int) ($data['score'] ?? 0)));
        $mode = $data['mode'] ?? 'jp-en';
        $now = time() * 1000;

        if (!in_array($mode, ['jp-en', 'en-jp', 'speech', 'choice'], true)) {
            outputJSON(["error" => "Invalid score mode"], 400);
        }

        safeModifyJSON($scoresFile, function($rootData) use ($lang, $listName, $newScore, $mode, $now) {
            applyScoreUpdate($rootData, $lang, $listName, $newScore, $mode, $now);
            return $rootData;
        });
        outputJSON(["status" => "success"]);
        break;

    case 'update_word_stats':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        studioRateLimit($rateLimitFile, 'update_word_stats|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 180, 60);
        if ($enforce_score_auth) {
            requireWriteAuthorization($data, $write_token, $has_write_token, $sync_token, $has_sync_token, $admin_password, $has_admin_password);
        }

        $results = $data['results'] ?? [];
        $isPurification = $data['is_purification'] ?? false; 
        $now = time() * 1000;

        if (!is_array($results)) {
            outputJSON(["error" => "Invalid results payload"], 400);
        }

        $results = array_slice($results, 0, 250);
        $normalizedResults = [];
        foreach ($results as $item) {
            $normalized = normalizeSessionResultEntry($item);
            if ($normalized) $normalizedResults[] = $normalized;
        }

        safeModifyJSON($statsFile, function($rootData) use ($lang, $normalizedResults, $isPurification, $now) {
            applyWordStatsUpdate($rootData, $lang, $normalizedResults, $isPurification, $now);
            return $rootData;
        });
        outputJSON(["status" => "success"]);
        break;

    case 'sync_progress_batch':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        studioRateLimit($rateLimitFile, 'sync_progress_batch|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 120, 60);
        requireSyncToken($data, $sync_token, $has_sync_token);

        $requestLang = trim((string) ($data['lang'] ?? $lang));
        if ($requestLang !== $lang) {
            outputJSON(["error" => "Language mismatch"], 400);
        }

        $events = $data['events'] ?? [];
        if (!is_array($events)) {
            outputJSON(["error" => "Invalid events payload"], 400);
        }

        $events = array_slice($events, 0, 400);
        $appliedEventIds = [];
        $skippedEventIds = [];

        foreach ($events as $event) {
            if (!is_array($event)) continue;

            $eventId = trim((string) ($event['event_id'] ?? ''));
            if ($eventId === '' || strlen($eventId) > 160) {
                continue;
            }

            $eventTs = (int) ($event['event_ts'] ?? (time() * 1000));
            if ($eventTs <= 0) $eventTs = time() * 1000;

            $isNewEvent = markSyncEventAsProcessed($processedSyncEventsFile, $eventId, $eventTs);
            if (!$isNewEvent) {
                $skippedEventIds[] = $eventId;
                continue;
            }

            $listName = normalizeListName($event['listName'] ?? 'Unknown');
            $mode = (string) ($event['mode'] ?? 'jp-en');
            $newScore = max(0, min(100, (int) ($event['score'] ?? 0)));
            $isPurification = !empty($event['is_purification']);
            $rawResults = is_array($event['results'] ?? null) ? $event['results'] : [];

            if (!in_array($mode, ['jp-en', 'en-jp', 'speech', 'choice'], true)) {
                $mode = 'jp-en';
            }

            $normalizedResults = [];
            foreach (array_slice($rawResults, 0, 250) as $item) {
                $normalized = normalizeSessionResultEntry($item);
                if ($normalized) $normalizedResults[] = $normalized;
            }

            safeModifyJSON($scoresFile, function($rootData) use ($lang, $listName, $newScore, $mode, $eventTs) {
                applyScoreUpdate($rootData, $lang, $listName, $newScore, $mode, $eventTs);
                return $rootData;
            });

            safeModifyJSON($statsFile, function($rootData) use ($lang, $normalizedResults, $isPurification, $eventTs) {
                applyWordStatsUpdate($rootData, $lang, $normalizedResults, $isPurification, $eventTs);
                return $rootData;
            });

            $appliedEventIds[] = $eventId;
        }

        outputJSON([
            "status" => "success",
            "applied_event_ids" => $appliedEventIds,
            "skipped_event_ids" => $skippedEventIds,
            "remaining_queue_hint" => 0
        ]);
        break;

    case 'lookup': // Jisho proxy (Nihongo only really)
        studioRateLimit($rateLimitFile, 'lookup|' . $lang . '|' . $currentAccount['id'] . '|' . studioClientIpAddress(), 120, 60);
        $word = $_GET['word'] ?? '';
        if (empty($word)) outputJSON(["error" => "No word provided"]);
        $url = "https://jisho.org/api/v1/search/words?keyword=" . urlencode($word);
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_USERAGENT, 'NihongoStudio/2.0');
        $response = curl_exec($ch);
        if (curl_errno($ch)) {
            outputJSON(["error" => curl_error($ch)]);
        } else {
            outputJSON($response);
        }
        curl_close($ch);
        break;

    default:
        outputJSON(["error" => "Invalid action requested"]);
        break;
}
?>
