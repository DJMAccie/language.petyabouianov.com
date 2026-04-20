<?php
// studio_api.php
// Unified API for Language Studios
ob_start();

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);
ini_set('auto_detect_line_endings', true);

// --- HEADERS (Disable Caching & CORS) ---
header('Content-Type: application/json');
$allowedOrigins = ['https://language.petyabouianov.com', 'https://petyabouianov.com'];
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin && in_array($requestOrigin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $requestOrigin");
} else {
    header("Access-Control-Allow-Origin: https://language.petyabouianov.com");
}
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");

// --- LOAD PASSWORD CONFIG ---
$config_path = __DIR__ . '/studio_api_config.php';
$admin_password = getenv('STUDIO_API_ADMIN_PASSWORD') ?: '';
if (file_exists($config_path)) {
    require_once $config_path;
}
$has_admin_password = is_string($admin_password) && $admin_password !== '';

// --- PARSE REQUEST ---
$lang = $_GET['lang'] ?? 'nihongo';
$action = $_GET['action'] ?? '';
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
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
    'sascha' => __DIR__ . '/sascha_lists.json',
];
$allowedLangs = array_keys($listsFilesByLang);
$listsFile = $listsFilesByLang[$lang] ?? null;
$scoresFile = __DIR__ . '/global_scores.json';
$statsFile = __DIR__ . '/global_word_stats.json';
$kanjiMnemonicsFile = __DIR__ . '/kanji_mnemonics.json';

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
    __DIR__ . '/sascha_lists.json' => ['sascha' => []],
    $kanjiMnemonicsFile => ['nihongo' => []],
    $scoresFile => $defaultBuckets,
    $statsFile => $defaultBuckets,
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

        $listName = normalizeListName($data['listName'] ?? 'Unknown');
        $newScore = max(0, min(100, (int) ($data['score'] ?? 0)));
        $mode = $data['mode'] ?? 'jp-en';
        $now = time() * 1000;

        if (!in_array($mode, ['jp-en', 'en-jp', 'speech', 'choice'], true)) {
            outputJSON(["error" => "Invalid score mode"], 400);
        }

        safeModifyJSON($scoresFile, function($rootData) use ($lang, $listName, $newScore, $mode, $now) {
            if (!isset($rootData[$lang])) $rootData[$lang] = [];
            $scores = $rootData[$lang];
            
            $entry = $scores[$listName] ?? [];
            if (!is_array($entry)) { 
                $entry = ['jp-en' => (int) $entry, 'en-jp' => 0, 'last_activity' => 0];
            }
            if ($newScore > ($entry[$mode] ?? 0)) {
                $entry[$mode] = $newScore;
            }
            $entry['last_activity'] = $now;
            $scores[$listName] = $entry;
            $rootData[$lang] = $scores;
            return $rootData;
        });
        outputJSON(["status" => "success"]);
        break;

    case 'update_word_stats':
        requirePostRequest($requestMethod);

        $results = $data['results'] ?? [];
        $isPurification = $data['is_purification'] ?? false; 
        $now = time() * 1000;

        if (!is_array($results)) {
            outputJSON(["error" => "Invalid results payload"], 400);
        }

        $results = array_slice($results, 0, 250);

        safeModifyJSON($statsFile, function($rootData) use ($lang, $results, $isPurification, $now) {
            if (!isset($rootData[$lang])) $rootData[$lang] = [];
            $stats = $rootData[$lang];
            
            foreach ($results as $item) {
                if (!is_array($item)) continue;

                // Determine target word key depending on language
                $word = isset($item['jp']) ? trim((string) $item['jp']) : (isset($item['word']) ? trim((string) $item['word']) : null);
                if (!$word) continue;
                $word = function_exists('mb_substr') ? mb_substr($word, 0, 160) : substr($word, 0, 160);
                $isCorrect = !empty($item['correct']);

                if (!isset($stats[$word])) {
                    $stats[$word] = ['correct' => 0, 'wrong' => 0, 'streak' => 0, 'last_review' => 0, 'next_review' => 0, 'seen' => 0];
                }
                
                $stats[$word]['seen'] = ($stats[$word]['seen'] ?? 0) + 1;
                $stats[$word]['last_review'] = $now;

                if ($isCorrect) {
                    $stats[$word]['correct']++;
                    $stats[$word]['streak']++;
                    if ($isPurification) $stats[$word]['wrong'] = 0;
                    
                    $streak = $stats[$word]['streak'];
                    $days = ($streak == 1) ? 1 : ($streak == 2 ? 3 : ($streak == 3 ? 7 : ($streak == 4 ? 14 : 30)));
                    $stats[$word]['next_review'] = $now + ($days * 86400 * 1000);
                } else {
                    $stats[$word]['wrong']++;
                    $stats[$word]['streak'] = 0;
                    $stats[$word]['next_review'] = $now;
                }
            }
            $rootData[$lang] = $stats;
            return $rootData;
        });
        outputJSON(["status" => "success"]);
        break;

    case 'lookup': // Jisho proxy (Nihongo only really)
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
