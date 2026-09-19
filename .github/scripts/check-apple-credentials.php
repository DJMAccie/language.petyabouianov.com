<?php
declare(strict_types=1);

// Verifies that the configured Apple credentials work, before a deploy goes out.
//
// Apple has no static client secret: it is a JWT signed with the .p8 key. This
// script builds that secret and asks Apple's token endpoint to redeem a bogus
// code. A valid client id plus correctly signed secret answers "invalid_grant"
// (the code is bad, the client is fine). A wrong id, key id, team id or key
// answers "invalid_client". Nothing secret is ever printed.
//
// Requires studio_oauth.php for the client-secret helper.

require_once __DIR__ . '/../../studio_oauth.php';

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function ok(string $message): void
{
    fwrite(STDOUT, $message . PHP_EOL);
}

$serviceId = trim((string) (getenv('APPLE_SERVICE_ID') ?: ''));
$teamId = trim((string) (getenv('APPLE_TEAM_ID') ?: ''));
$keyId = trim((string) (getenv('APPLE_KEY_ID') ?: ''));
$privateKey = (string) (getenv('APPLE_PRIVATE_KEY') ?: '');

if ($serviceId === '' || $teamId === '' || $keyId === '' || trim($privateKey) === '') {
    ok('Apple credentials are not fully configured; skipping the credential check.');
    exit(0);
}

// A .p8 that lost its newlines when stored cannot be parsed, and would fail at
// sign-in time with no useful signal. Catch that here.
if (strpos($privateKey, 'BEGIN PRIVATE KEY') === false) {
    fail('APPLE_PRIVATE_KEY does not contain a PEM header. '
        . 'Re-add it with: gh secret set APPLE_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8');
}

$key = @openssl_pkey_get_private($privateKey);
if (!$key) {
    fail('APPLE_PRIVATE_KEY could not be parsed as a private key.');
}

$details = openssl_pkey_get_details($key);
if (($details['type'] ?? null) !== OPENSSL_KEYTYPE_EC) {
    fail('APPLE_PRIVATE_KEY is not an EC key; Apple\'s .p8 files are P-256.');
}

$secret = studioAppleClientSecret($teamId, $keyId, $serviceId, $privateKey);
if (!$secret) {
    fail('Could not build the Apple client secret from the supplied key.');
}

// A JWS ES256 signature is the raw 64-byte r||s, not DER.
$parts = explode('.', $secret);
if (count($parts) !== 3) {
    fail('The generated Apple client secret is not a well-formed JWT.');
}
$signature = studioOAuthBase64UrlDecode($parts[2]);
if (strlen((string) $signature) !== 64) {
    fail('The Apple client secret signature is not the 64 bytes ES256 requires. '
        . 'Apple rejects a DER-encoded ECDSA signature.');
}

$response = studioHttpPostForm(STUDIO_APPLE_TOKEN_ENDPOINT, [
    'client_id' => $serviceId,
    'client_secret' => $secret,
    'code' => 'credential-check-invalid-code',
    'grant_type' => 'authorization_code',
    'redirect_uri' => 'https://language.petyabouianov.com/studio_api.php?lang=nihongo&action=auth_apple_callback',
]);

if (isset($response['error'])) {
    fail('Could not reach Apple to verify credentials: ' . $response['error']);
}

$error = (string) ($response['data']['error'] ?? '');

if ($error === 'invalid_grant') {
    ok('Apple accepted the service id, team id and key (bad code rejected as expected).');
    exit(0);
}

if ($error === 'invalid_client') {
    fail('Apple rejected the credentials (invalid_client). Check APPLE_SERVICE_ID, '
        . 'APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY against the Apple Developer portal.');
}

fail('Unexpected response from Apple while checking credentials: HTTP '
    . ($response['status'] ?? '?') . ' ' . substr(json_encode($response['data'] ?? []), 0, 300));
