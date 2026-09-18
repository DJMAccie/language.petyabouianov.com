<?php
declare(strict_types=1);

// Verifies that the configured Google OAuth credentials are actually accepted by
// Google before a deploy goes out.
//
// It never follows an authorization flow. It asks Google's token endpoint to
// redeem a deliberately bogus code: a valid client gets "invalid_grant" (the
// code is bad, but the client is fine) while a wrong client id or secret gets
// "invalid_client" (or 401). That distinguishes a typo from a working pair
// without exposing either value.

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function ok(string $message): void
{
    fwrite(STDOUT, $message . PHP_EOL);
}

$clientId = trim((string) (getenv('GOOGLE_CLIENT_ID') ?: ''));
$clientSecret = trim((string) (getenv('GOOGLE_CLIENT_SECRET') ?: ''));
$expectedRedirect = trim((string) (getenv('GOOGLE_REDIRECT_URI') ?: ''));

if ($clientId === '' || $clientSecret === '') {
    ok('Google credentials are not configured; skipping the credential check.');
    exit(0);
}

if (!str_ends_with($clientId, '.apps.googleusercontent.com')) {
    fail('GOOGLE_CLIENT_ID does not look like an OAuth client id (expected it to end with .apps.googleusercontent.com).');
}

if (str_starts_with($clientSecret, 'GOCSPX-') === false) {
    // Older clients used a different prefix; warn rather than block.
    ok('Note: GOOGLE_CLIENT_SECRET does not start with "GOCSPX-". Continuing anyway.');
}

$ch = curl_init('https://oauth2.googleapis.com/token');
if ($ch === false) {
    fail('Failed to initialise cURL.');
}

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query([
        'code' => 'credential-check-invalid-code',
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'redirect_uri' => $expectedRedirect !== '' ? $expectedRedirect : 'https://example.invalid/callback',
        'grant_type' => 'authorization_code',
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_USERAGENT => 'LanguageStudioCredentialCheck/1.0',
]);

$body = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($ch);

if ($body === false) {
    fail('Could not reach Google to verify credentials: ' . $curlError);
}

$decoded = json_decode((string) $body, true);
$error = is_array($decoded) ? (string) ($decoded['error'] ?? '') : '';

// Google's answer for "bad code, good client".
if ($error === 'invalid_grant') {
    ok('Google accepted the client id and secret (bad code rejected as expected).');
    exit(0);
}

if ($error === 'invalid_client' || $status === 401) {
    fail('Google rejected the credentials (invalid_client). '
        . 'Re-copy GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the OAuth client in Google Cloud Console.');
}

if ($error === 'redirect_uri_mismatch') {
    fail('The redirect URI is not registered on this OAuth client. '
        . 'Add https://language.petyabouianov.com/studio_api.php?lang=nihongo&action=auth_google_callback '
        . 'under Authorised redirect URIs.');
}

fail('Unexpected response from Google while checking credentials: HTTP ' . $status . ' ' . substr((string) $body, 0, 300));
