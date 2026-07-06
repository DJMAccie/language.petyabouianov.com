<?php
// studio_api.php
// Unified API for Language Studios
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
$client_password = $data['password'] ?? '';

// --- ROUTING CONFIG ---
$legacyGlobalListsFile = __DIR__ . '/global_lists.json';
$listsFilesByLang = [
    'nihongo' => __DIR__ . '/nihongo_lists.json',
    'bahasa' => __DIR__ . '/bahasa_lists.json',
    'italia' => __DIR__ . '/italia_lists.json',
    'nederlands' => __DIR__ . '/nederlands_lists.json',
];
$allowedLangs = array_keys($listsFilesByLang);
$listsFile = $listsFilesByLang[$lang] ?? null;
$scoresFile = __DIR__ . '/global_scores.json';
$statsFile = __DIR__ . '/global_word_stats.json';
$kanjiMnemonicsFile = __DIR__ . '/kanji_mnemonics.json';
$processedSyncEventsFile = __DIR__ . '/sync_processed_events.json';
$rateLimitFile = __DIR__ . '/api_rate_limits.json';

// --- HELPER FUNCTIONS ---

function outputJSON($data, $statusCode = 200) {
    http_response_code($statusCode);
    ob_clean();
    echo is_string($data) ? $data : json_encode($data);
    exit;
}

// Atomically reads checking for locks
function safeRead($filename) {
    if (!file_exists($filename)) return '{}';
    $fp = fopen($filename, 'r');
    if (!$fp) return '{}';
    
    // Wait for a shared lock (allows multiple readers, blocks writers)
    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    
    if ($content === false || trim($content) === '') return '{}';
    return $content;
}

// Atomically read, modify, and write
function safeModifyJSON($filename, $callback) {
    if (!file_exists($filename)) file_put_contents($filename, '{}');
    $fp = fopen($filename, 'c+'); // Open for read/write, pointer at beginning
    if (!$fp) {
        error_log("Failed to open $filename for writing.");
        return false;
    }

    // Wait for an exclusive lock (blocks readers and writers)
    if (flock($fp, LOCK_EX)) {
        // Read current content
        $content = '';
        while (!feof($fp)) {
            $content .= fread($fp, 8192);
        }
        
        $data = json_decode($content, true) ?? [];
        
        // Apply modification callback
        $data = $callback($data);
        
        // Write back
        ftruncate($fp, 0); // Clear file
        rewind($fp);      // Reset pointer
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
        
        // Flush and unlock
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    } else {
        error_log("Could not obtain lock on $filename.");
        fclose($fp);
        return false;
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

function requireWriteAuthorization($data, $writeToken, $hasWriteToken, $syncToken, $hasSyncToken, $adminPassword, $hasAdminPassword) {
    $hasAnyAuthConfig = $hasWriteToken || $hasSyncToken || $hasAdminPassword;
    if (!$hasAnyAuthConfig) {
        outputJSON(["error" => "Write authorization is not configured"], 503);
    }
    if (hasValidWriteToken($data, $writeToken, $hasWriteToken)) return;
    if (hasValidSyncToken($data, $syncToken, $hasSyncToken)) return;
    if (hasValidAdminPassword($data, $adminPassword, $hasAdminPassword)) return;
    outputJSON(["error" => "Invalid write authorization"], 403);
}

function requireSyncToken($data, $syncToken, $hasSyncToken) {
    if (!$hasSyncToken) {
        outputJSON(["error" => "Sync endpoint is not configured"], 503);
    }
    if (!hasValidSyncToken($data, $syncToken, $hasSyncToken)) {
        outputJSON(["error" => "Invalid sync token"], 403);
    }
}

function getClientIpAddress() {
    $cloudflareIp = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
    if ($cloudflareIp !== '') return $cloudflareIp;

    $forwardedFor = trim((string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
    if ($forwardedFor !== '') {
        $parts = explode(',', $forwardedFor);
        $first = trim((string) ($parts[0] ?? ''));
        if ($first !== '') return $first;
    }

    $remoteAddr = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    return $remoteAddr !== '' ? $remoteAddr : 'unknown';
}

function enforceRateLimit($rateLimitFile, $bucketKey, $maxRequests, $windowSeconds) {
    $now = time();
    $windowStart = $now - max(1, $windowSeconds);
    $allowed = true;

    safeModifyJSON($rateLimitFile, function($rootData) use ($bucketKey, $maxRequests, $windowStart, $now, &$allowed) {
        if (!is_array($rootData)) $rootData = [];
        if (!isset($rootData[$bucketKey]) || !is_array($rootData[$bucketKey])) {
            $rootData[$bucketKey] = [];
        }

        $recent = [];
        foreach ($rootData[$bucketKey] as $timestamp) {
            $ts = (int) $timestamp;
            if ($ts >= $windowStart) $recent[] = $ts;
        }

        if (count($recent) >= $maxRequests) {
            $allowed = false;
            $rootData[$bucketKey] = $recent;
            return $rootData;
        }

        $recent[] = $now;
        $rootData[$bucketKey] = $recent;

        if (count($rootData) > 2000) {
            $trimmed = [];
            foreach ($rootData as $key => $values) {
                if (!is_array($values)) continue;
                $clean = [];
                foreach ($values as $value) {
                    $ts = (int) $value;
                    if ($ts >= $windowStart) $clean[] = $ts;
                }
                if (!empty($clean)) $trimmed[$key] = $clean;
            }
            $rootData = $trimmed;
        }

        return $rootData;
    });

    if (!$allowed) {
        outputJSON(["error" => "Too many requests"], 429);
    }
}

function normalizeListName($value) {
    $name = trim((string) $value);
    $name = preg_replace('/\s+/', ' ', $name);
    return function_exists('mb_substr') ? mb_substr($name, 0, 80) : substr($name, 0, 80);
}

function normalizeWordEntry($item) {
    if (!is_array($item)) return null;

    $jp = trim((string) ($item['jp'] ?? $item['word'] ?? ''));
    $en = trim((string) ($item['en'] ?? ''));

    if ($jp === '' || $en === '') return null;

    return [
        'jp' => function_exists('mb_substr') ? mb_substr(preg_replace('/\s+/', ' ', $jp), 0, 160) : substr(preg_replace('/\s+/', ' ', $jp), 0, 160),
        'en' => function_exists('mb_substr') ? mb_substr(preg_replace('/\s+/', ' ', $en), 0, 200) : substr(preg_replace('/\s+/', ' ', $en), 0, 200),
    ];
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

if (!in_array($lang, $allowedLangs, true) || !$listsFile) {
    outputJSON(["error" => "Invalid language"], 400);
}

migrateBundledRuntimeSnapshot([$listsFile, $scoresFile, $statsFile]);

$defaultBuckets = [];
foreach ($allowedLangs as $allowedLang) {
    $defaultBuckets[$allowedLang] = [];
}

$defaultFileContents = [
    __DIR__ . '/nihongo_lists.json' => ['nihongo' => []],
    __DIR__ . '/bahasa_lists.json' => ['bahasa' => []],
    __DIR__ . '/italia_lists.json' => ['italia' => []],
    __DIR__ . '/nederlands_lists.json' => ['nederlands' => []],
    $kanjiMnemonicsFile => ['nihongo' => []],
    $scoresFile => $defaultBuckets,
    $statsFile => $defaultBuckets,
    $processedSyncEventsFile => [],
    $rateLimitFile => [],
];

foreach ($defaultFileContents as $path => $defaults) {
    if (!file_exists($path)) {
        file_put_contents($path, json_encode($defaults, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }
}

seedLangListsFromLegacyGlobal($lang, $listsFile, $legacyGlobalListsFile);


// --- MAIN LOGIC ---

switch ($action) {
    case 'get_lists':
        $data = json_decode(safeRead($listsFile), true) ?? [];
        outputJSON($data[$lang] ?? []);
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

    case 'save_list':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        enforceRateLimit($rateLimitFile, 'save_list|' . $lang . '|' . getClientIpAddress(), 30, 60);
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

        safeModifyJSON($listsFile, function($rootData) use ($lang, $name, $words) {
            if (!isset($rootData[$lang])) $rootData[$lang] = [];
            $rootData[$lang][$name] = $words;
            return $rootData;
        });

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
        
        outputJSON(["status" => "success"]);
        break;

    case 'delete_list':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        enforceRateLimit($rateLimitFile, 'delete_list|' . $lang . '|' . getClientIpAddress(), 30, 60);
        if ($require_list_write_auth) {
            requireWriteAuthorization($data, $write_token, $has_write_token, $sync_token, $has_sync_token, $admin_password, $has_admin_password);
        }

        $name = normalizeListName($data['name'] ?? '');
        if ($name === '') {
            outputJSON(["error" => "List name is required"], 400);
        }

        safeModifyJSON($listsFile, function($rootData) use ($lang, $name) {
            if (isset($rootData[$lang][$name])) unset($rootData[$lang][$name]);
            return $rootData;
        });
        safeModifyJSON($scoresFile, function($rootData) use ($lang, $name) {
            if (isset($rootData[$lang][$name])) unset($rootData[$lang][$name]);
            return $rootData;
        });
        outputJSON(["status" => "success"]);
        break;

    case 'save_score':
        requirePostRequest($requestMethod);
        requireJsonContentTypeForPost($requestMethod);
        enforceRateLimit($rateLimitFile, 'save_score|' . $lang . '|' . getClientIpAddress(), 180, 60);
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
        enforceRateLimit($rateLimitFile, 'update_word_stats|' . $lang . '|' . getClientIpAddress(), 180, 60);
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
        enforceRateLimit($rateLimitFile, 'sync_progress_batch|' . $lang . '|' . getClientIpAddress(), 120, 60);
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
        enforceRateLimit($rateLimitFile, 'lookup|' . $lang . '|' . getClientIpAddress(), 120, 60);
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
