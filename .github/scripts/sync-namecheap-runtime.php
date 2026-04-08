<?php
declare(strict_types=1);

$repoRoot = dirname(__DIR__, 2);
$baseUrl = getenv('STUDIO_SYNC_BASE_URL') ?: 'https://language.petyabouianov.com/studio_api.php';
$timeoutSeconds = (int) (getenv('STUDIO_SYNC_TIMEOUT') ?: '30');
$langs = ['nihongo', 'bahasa', 'italia', 'nederlands', 'sascha'];

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function fetchRemoteJson(string $baseUrl, string $action, string $lang, int $timeoutSeconds): array
{
    $url = $baseUrl . '?' . http_build_query([
        'action' => $action,
        'lang' => $lang,
    ]);

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

$listsByLang = [];
$scoresByLang = [];
$statsByLang = [];

foreach ($langs as $lang) {
    $listsByLang[$lang] = fetchRemoteJson($baseUrl, 'get_lists', $lang, $timeoutSeconds);
    $scoresByLang[$lang] = fetchRemoteJson($baseUrl, 'get_scores', $lang, $timeoutSeconds);
    $statsByLang[$lang] = fetchRemoteJson($baseUrl, 'get_word_stats', $lang, $timeoutSeconds);
}

$globalLists = [
    'nihongo' => $listsByLang['nihongo'],
    'bahasa' => $listsByLang['bahasa'],
    'italia' => $listsByLang['italia'],
];

$nederlandsLists = ['nederlands' => $listsByLang['nederlands']];
$saschaLists = ['sascha' => $listsByLang['sascha']];
$globalScores = ensureLangKeys($langs, $scoresByLang);
$globalWordStats = ensureLangKeys($langs, $statsByLang);

writeJson($repoRoot . '/global_lists.json', $globalLists);
writeJson($repoRoot . '/nederlands_lists.json', $nederlandsLists);
writeJson($repoRoot . '/sascha_lists.json', $saschaLists);
writeJson($repoRoot . '/global_scores.json', $globalScores);
writeJson($repoRoot . '/global_word_stats.json', $globalWordStats);

$listCounts = [];
foreach ($langs as $lang) {
    $listCounts[] = "{$lang}=" . count($listsByLang[$lang]);
}

fwrite(STDOUT, 'Synced runtime JSON from ' . $baseUrl . PHP_EOL);
fwrite(STDOUT, 'List counts: ' . implode(', ', $listCounts) . PHP_EOL);
