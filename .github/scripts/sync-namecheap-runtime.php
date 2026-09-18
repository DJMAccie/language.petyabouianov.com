<?php
declare(strict_types=1);

$repoRoot = dirname(__DIR__, 2);
$baseUrl = getenv('STUDIO_SYNC_BASE_URL') ?: 'https://language.petyabouianov.com/studio_api.php';
$timeoutSeconds = (int) (getenv('STUDIO_SYNC_TIMEOUT') ?: '30');
$langs = ['nihongo'];

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function fetchRemoteJson(string $baseUrl, string $action, string $lang, int $timeoutSeconds): array
{
    $query = [
        'action' => $action,
        'lang' => $lang,
    ];

    // The API requires the owner's credentials for account data; the preflight
    // above guarantees a token is present by the time we get here.
    $syncToken = trim((string) (getenv('STUDIO_API_SYNC_TOKEN') ?: ''));
    if ($syncToken !== '') {
        $query['sync_token'] = $syncToken;
    }

    $url = $baseUrl . '?' . http_build_query($query);

    $ch = curl_init($url);
    if ($ch === false) {
        fail("Failed to initialize cURL for {$action} ({$lang}).");
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => $timeoutSeconds,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_FAILONERROR => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'LanguageStudioRuntimeSync/1.0',
    ]);

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        fail("Failed to fetch {$action} ({$lang}) from {$url}: {$error}");
    }

    $statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        fail("Unexpected JSON payload for {$action} ({$lang}) with HTTP {$statusCode}.");
    }

    return $decoded;
}

function writeJson(string $path, array $payload): void
{
    $encoded = json_encode(
        $payload,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    if (!is_string($encoded)) {
        fail("Failed to encode JSON for {$path}.");
    }

    $bytes = file_put_contents($path, $encoded . PHP_EOL);
    if ($bytes === false) {
        fail("Failed to write {$path}.");
    }
}

function ensureLangKeys(array $langs, array $source): array
{
    $normalized = [];
    foreach ($langs as $lang) {
        $value = $source[$lang] ?? [];
        $normalized[$lang] = is_array($value) ? $value : [];
    }
    return $normalized;
}

function loadLocalKanjiMnemonics(string $path): array
{
    if (!file_exists($path)) {
        return [];
    }

    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) {
        return [];
    }

    $nihongo = $decoded['nihongo'] ?? [];
    return is_array($nihongo) ? $nihongo : [];
}

function isValidKanjiMnemonicPayload(array $payload): bool
{
    if (isset($payload['error'])) {
        return false;
    }

    if (count($payload) < 20) {
        return false;
    }

    foreach ($payload as $entry) {
        if (!is_array($entry)) {
            return false;
        }
        foreach (['jp', 'mnemonic', 'reading_cue', 'travel_context', 'emoji'] as $field) {
            if (!isset($entry[$field]) || trim((string) $entry[$field]) === '') {
                return false;
            }
        }
    }

    return true;
}

// Since accounts were introduced, runtime data is private and the API answers 401
// to anonymous callers. Without a token there is nothing to mirror, so skip the
// step entirely: failing here would block the code deploy, and continuing would
// rewrite the committed JSON with empty payloads.
if (trim((string) (getenv('STUDIO_API_SYNC_TOKEN') ?: '')) === '') {
    fwrite(STDOUT, "Skipping runtime sync: STUDIO_API_SYNC_TOKEN is not set." . PHP_EOL);
    fwrite(STDOUT, "Set it as a repository secret to keep the committed runtime JSON current." . PHP_EOL);
    exit(0);
}

$listsByLang = [];
$scoresByLang = [];
$statsByLang = [];
$kanjiMnemonics = [];

foreach ($langs as $lang) {
    $listsByLang[$lang] = fetchRemoteJson($baseUrl, 'get_lists', $lang, $timeoutSeconds);
    $scoresByLang[$lang] = fetchRemoteJson($baseUrl, 'get_scores', $lang, $timeoutSeconds);
    $statsByLang[$lang] = fetchRemoteJson($baseUrl, 'get_word_stats', $lang, $timeoutSeconds);
}
$kanjiMnemonics = fetchRemoteJson($baseUrl, 'get_kanji_mnemonics', 'nihongo', $timeoutSeconds);
if (!isValidKanjiMnemonicPayload($kanjiMnemonics)) {
    $kanjiMnemonics = loadLocalKanjiMnemonics($repoRoot . '/kanji_mnemonics.json');
}

$nihongoLists = ['nihongo' => $listsByLang['nihongo']];
$globalScores = ensureLangKeys($langs, $scoresByLang);
$globalWordStats = ensureLangKeys($langs, $statsByLang);

writeJson($repoRoot . '/nihongo_lists.json', $nihongoLists);
writeJson($repoRoot . '/kanji_mnemonics.json', ['nihongo' => $kanjiMnemonics]);
writeJson($repoRoot . '/global_scores.json', $globalScores);
writeJson($repoRoot . '/global_word_stats.json', $globalWordStats);

$listCounts = [];
foreach ($langs as $lang) {
    $listCounts[] = "{$lang}=" . count($listsByLang[$lang]);
}

fwrite(STDOUT, 'Synced runtime JSON from ' . $baseUrl . PHP_EOL);
fwrite(STDOUT, 'List counts: ' . implode(', ', $listCounts) . PHP_EOL);
