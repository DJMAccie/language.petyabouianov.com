<?php
// studio_oauth.php
// External sign-in (Google, and Apple on the same plumbing).
//
// Design notes:
//   - Authorization-code flow with PKCE, so a stolen code cannot be redeemed
//     without the verifier that never leaves the session.
//   - A signed-in user is never inferred from an email address. Accounts are
//     matched on the provider's immutable subject id only, and an existing
//     account is never merged with a provider identity automatically.
//   - The identity token is verified against the provider's published keys
//     (signature + alg + iss + aud + exp + nonce) before it is trusted.
//   - No dependencies: plain curl + openssl, so FTP deployment keeps working.

if (!function_exists('studioOAuthBase64UrlDecode')) {
    define('STUDIO_GOOGLE_AUTHORIZE_ENDPOINT', 'https://accounts.google.com/o/oauth2/v2/auth');
    define('STUDIO_GOOGLE_TOKEN_ENDPOINT', 'https://oauth2.googleapis.com/token');
    define('STUDIO_GOOGLE_JWKS_ENDPOINT', 'https://www.googleapis.com/oauth2/v3/certs');
    define('STUDIO_GOOGLE_ISSUERS', 'https://accounts.google.com,accounts.google.com');
    define('STUDIO_APPLE_AUTHORIZE_ENDPOINT', 'https://appleid.apple.com/auth/authorize');
    define('STUDIO_APPLE_TOKEN_ENDPOINT', 'https://appleid.apple.com/auth/token');
    define('STUDIO_APPLE_JWKS_ENDPOINT', 'https://appleid.apple.com/auth/keys');
    define('STUDIO_APPLE_ISSUER', 'https://appleid.apple.com');
    define('STUDIO_OAUTH_STATE_TTL', 600);

    function studioOAuthBase64UrlDecode($value) {
        $value = strtr((string) $value, '-_', '+/');
        $remainder = strlen($value) % 4;
        if ($remainder) $value .= str_repeat('=', 4 - $remainder);
        return base64_decode($value, true);
    }

    function studioOAuthBase64UrlEncode($value) {
        return rtrim(strtr(base64_encode((string) $value), '+/', '-_'), '=');
    }

    function studioOAuthEnsureSession() {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            @session_start();
        }
    }

    // ------------------------------------------------------------ CSRF / state

    function studioOAuthBeginState($provider) {
        studioOAuthEnsureSession();
        $state = studioOAuthBase64UrlEncode(random_bytes(32));
        $_SESSION['oauth_state'] = [
            'value' => $state,
            'provider' => strtolower((string) $provider),
            'created_at' => time(),
        ];
        return $state;
    }

    // Consumes the pending state exactly once, so a replayed callback fails.
    function studioOAuthConsumeState($provider, $candidate) {
        studioOAuthEnsureSession();

        $pending = $_SESSION['oauth_state'] ?? null;
        unset($_SESSION['oauth_state']);

        if (!is_array($pending)) return false;
        if ((int) ($pending['created_at'] ?? 0) < time() - STUDIO_OAUTH_STATE_TTL) return false;
        if (strtolower((string) ($pending['provider'] ?? '')) !== strtolower((string) $provider)) return false;

        $expected = (string) ($pending['value'] ?? '');
        $candidate = (string) $candidate;
        if ($expected === '' || $candidate === '') return false;

        return hash_equals($expected, $candidate);
    }

    function studioOAuthPkcePair() {
        studioOAuthEnsureSession();
        $verifier = studioOAuthBase64UrlEncode(random_bytes(48));
        $_SESSION['oauth_pkce'] = $verifier;
        $challenge = studioOAuthBase64UrlEncode(hash('sha256', $verifier, true));
        return [$verifier, $challenge];
    }

    function studioOAuthConsumePkce() {
        studioOAuthEnsureSession();
        $verifier = (string) ($_SESSION['oauth_pkce'] ?? '');
        unset($_SESSION['oauth_pkce']);
        return $verifier;
    }

    function studioOAuthNonce() {
        studioOAuthEnsureSession();
        $nonce = studioOAuthBase64UrlEncode(random_bytes(16));
        $_SESSION['oauth_nonce'] = $nonce;
        return $nonce;
    }

    function studioOAuthConsumeNonce() {
        studioOAuthEnsureSession();
        $nonce = (string) ($_SESSION['oauth_nonce'] ?? '');
        unset($_SESSION['oauth_nonce']);
        return $nonce;
    }

    // --------------------------------------------------------------- transport

    function studioHttpPostForm($url, $fields, $timeoutSeconds = 15) {
        $ch = curl_init($url);
        if ($ch === false) return ['error' => 'curl_init failed'];

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_USERAGENT => 'NihongoStudio/2.0',
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);

        if ($body === false) return ['error' => $error !== '' ? $error : 'request failed'];

        $decoded = json_decode((string) $body, true);
        if (!is_array($decoded)) return ['error' => 'Unexpected token response', 'status' => $status];

        return ['data' => $decoded, 'status' => $status];
    }

    function studioHttpGetJson($url, $timeoutSeconds = 15) {
        $ch = curl_init($url);
        if ($ch === false) return ['error' => 'curl_init failed'];

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_USERAGENT => 'NihongoStudio/2.0',
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);

        if ($body === false) return ['error' => $error !== '' ? $error : 'request failed'];

        $decoded = json_decode((string) $body, true);
        if (!is_array($decoded)) return ['error' => 'Unexpected JWKS response', 'status' => $status];

        return ['data' => $decoded, 'status' => $status];
    }

    // ------------------------------------------------------- id token checking

    function studioJwksCacheFile() {
        return __DIR__ . '/oauth_jwks_cache.json';
    }

    // Provider keys are cached briefly; on any cache problem we simply refetch.
    function studioOAuthJwks($endpoint, $forceRefresh = false) {
        $cacheFile = studioJwksCacheFile();
        $now = time();

        if (!$forceRefresh && file_exists($cacheFile)) {
            $cached = json_decode((string) @file_get_contents($cacheFile), true);
            if (is_array($cached)
                && ($cached['endpoint'] ?? '') === $endpoint
                && (int) ($cached['fetched_at'] ?? 0) > $now - 21600
                && is_array($cached['keys'] ?? null)) {
                return $cached['keys'];
            }
        }

        $response = studioHttpGetJson($endpoint);
        if (!isset($response['data']['keys']) || !is_array($response['data']['keys'])) {
            return null;
        }

        @file_put_contents($cacheFile, json_encode([
            'endpoint' => $endpoint,
            'fetched_at' => $now,
            'keys' => $response['data']['keys'],
        ]), LOCK_EX);

        return $response['data']['keys'];
    }

    // Wraps a JWK RSA key as an X.509 SubjectPublicKeyInfo PEM, which is what
    // openssl_verify expects for a "BEGIN PUBLIC KEY" block.
    function studioJwkToPem($jwk) {
        if (!is_array($jwk) || ($jwk['kty'] ?? '') !== 'RSA') return null;
        $modulus = studioOAuthBase64UrlDecode($jwk['n'] ?? '');
        $exponent = studioOAuthBase64UrlDecode($jwk['e'] ?? '');
        if ($modulus === false || $exponent === false || $modulus === '' || $exponent === '') return null;

        // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
        // DER INTEGERs are signed, so a high bit needs a leading zero byte.
        if ((ord($modulus[0]) & 0x80) !== 0) $modulus = "\x00" . $modulus;
        if ((ord($exponent[0]) & 0x80) !== 0) $exponent = "\x00" . $exponent;

        $rsaPublicKey = studioDerSequence(
            studioDerInteger($modulus) . studioDerInteger($exponent)
        );

        // AlgorithmIdentifier ::= SEQUENCE { OID rsaEncryption, NULL }
        $algorithm = studioDerSequence(
            studioDerTag(0x06, "\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01") . "\x05\x00"
        );

        // SubjectPublicKeyInfo ::= SEQUENCE { algorithm, BIT STRING }
        $subjectPublicKeyInfo = studioDerSequence(
            $algorithm . studioDerTag(0x03, "\x00" . $rsaPublicKey)
        );

        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($subjectPublicKeyInfo), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }

    // Apple publishes EC keys rather than RSA, so an ES256 JWK needs its own
    // conversion. The uncompressed point is 0x04 || x || y, each coordinate
    // left-padded to the curve size (32 bytes for P-256).
    function studioEcJwkToPem($jwk) {
        if (!is_array($jwk) || ($jwk['kty'] ?? '') !== 'EC') return null;
        if (($jwk['crv'] ?? '') !== 'P-256') return null;

        $x = studioOAuthBase64UrlDecode($jwk['x'] ?? '');
        $y = studioOAuthBase64UrlDecode($jwk['y'] ?? '');
        if ($x === false || $y === false || $x === '' || $y === '') return null;

        $x = str_pad($x, 32, "\x00", STR_PAD_LEFT);
        $y = str_pad($y, 32, "\x00", STR_PAD_LEFT);
        $point = "\x04" . $x . $y;

        // AlgorithmIdentifier ::= SEQUENCE { OID ecPublicKey, OID prime256v1 }
        $algorithm = studioDerSequence(
            studioDerTag(0x06, "\x2a\x86\x48\xce\x3d\x02\x01")   // id-ecPublicKey
            . studioDerTag(0x06, "\x2a\x86\x48\xce\x3d\x03\x01\x07") // prime256v1
        );

        $subjectPublicKeyInfo = studioDerSequence(
            $algorithm . studioDerTag(0x03, "\x00" . $point)
        );

        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($subjectPublicKeyInfo), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }

    // Picks the right conversion for the key type the provider published.
    function studioJwkToPemAny($jwk) {
        $kty = is_array($jwk) ? ($jwk['kty'] ?? '') : '';
        if ($kty === 'EC') return studioEcJwkToPem($jwk);
        return studioJwkToPem($jwk);
    }

    function studioDerTag($tag, $value) {
        return chr($tag) . studioDerLength(strlen($value)) . $value;
    }

    function studioDerSequence($value) {
        return studioDerTag(0x30, $value);
    }

    function studioDerInteger($value) {
        return studioDerTag(0x02, $value);
    }

    function studioDerLength($length) {
        if ($length < 0x80) return chr($length);
        $bytes = '';
        while ($length > 0) {
            $bytes = chr($length & 0xFF) . $bytes;
            $length >>= 8;
        }
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    // Verifies a JWT and returns its claims, or null when anything is off.
    function studioVerifyIdToken($idToken, $jwksEndpoint, $expectedAudience, $expectedIssuers, $expectedNonce = '') {
        $parts = explode('.', (string) $idToken);
        if (count($parts) !== 3) return null;

        $headerJson = studioOAuthBase64UrlDecode($parts[0]);
        if ($headerJson === false) return null;
        $header = json_decode($headerJson, true);
        if (!is_array($header)) return null;

        // Pin the algorithm: never let the token choose "none" or an HMAC alg.
        $alg = (string) ($header['alg'] ?? '');
        if (!in_array($alg, ['RS256', 'ES256'], true)) return null;

        $payloadJson = studioOAuthBase64UrlDecode($parts[1]);
        if ($payloadJson === false) return null;
        $claims = json_decode($payloadJson, true);
        if (!is_array($claims)) return null;

        $kid = (string) ($header['kid'] ?? '');
        if ($kid === '') return null;

        $signature = studioOAuthBase64UrlDecode($parts[2]);
        if ($signature === false) return null;

        $signingInput = $parts[0] . '.' . $parts[1];

        $verified = false;
        foreach ([false, true] as $forceRefresh) {
            $keys = studioOAuthJwks($jwksEndpoint, $forceRefresh);
            if (!is_array($keys)) continue;

            foreach ($keys as $jwk) {
                if (!is_array($jwk) || (string) ($jwk['kid'] ?? '') !== $kid) continue;
                $pem = studioJwkToPemAny($jwk);
                if (!$pem) continue;

                $ok = @openssl_verify($signingInput, $signature, $pem, OPENSSL_ALGO_SHA256);
                if ($ok === 1) {
                    $verified = true;
                    break 2;
                }
            }
        }

        if (!$verified) return null;

        // Standard claim checks.
        $now = time();
        if ((int) ($claims['exp'] ?? 0) < $now - 60) return null;
        if ((int) ($claims['iat'] ?? 0) > $now + 300) return null;

        $issuer = (string) ($claims['iss'] ?? '');
        $issuerOk = false;
        foreach (explode(',', (string) $expectedIssuers) as $allowed) {
            if ($issuer !== '' && hash_equals(trim($allowed), $issuer)) {
                $issuerOk = true;
                break;
            }
        }
        if (!$issuerOk) return null;

        $audienceOk = false;
        $aud = $claims['aud'] ?? '';
        foreach (is_array($aud) ? $aud : [$aud] as $candidate) {
            if (is_string($candidate) && hash_equals((string) $expectedAudience, $candidate)) {
                $audienceOk = true;
                break;
            }
        }
        if (!$audienceOk) return null;

        if ($expectedNonce !== '') {
            $nonce = (string) ($claims['nonce'] ?? '');
            if ($nonce === '' || !hash_equals($expectedNonce, $nonce)) return null;
        }

        return $claims;
    }

    // ------------------------------------------------------------ google flow

    function studioGoogleConfigured($clientId, $clientSecret) {
        return is_string($clientId) && $clientId !== '' && is_string($clientSecret) && $clientSecret !== '';
    }

    // Must match the Authorised redirect URI registered in Google Cloud exactly,
    // so the provider sends the browser straight back to the callback route.
    function studioGoogleRedirectUri($lang = 'nihongo') {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if ($host === '') return '/studio_api.php';
        $isHttps = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
        $path = '/studio_api.php?lang=' . rawurlencode($lang) . '&action=auth_google_callback';
        return ($isHttps ? 'https://' : 'http://') . $host . $path;
    }

    function studioGoogleAuthorizeUrl($clientId, $redirectUri, $state, $challenge, $nonce) {
        $params = [
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
            'prompt' => 'select_account',
            'access_type' => 'online',
        ];
        return STUDIO_GOOGLE_AUTHORIZE_ENDPOINT . '?' . http_build_query($params);
    }

    function studioGoogleExchangeCode($clientId, $clientSecret, $code, $redirectUri, $verifier) {
        $response = studioHttpPostForm(STUDIO_GOOGLE_TOKEN_ENDPOINT, [
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
            'code_verifier' => $verifier,
        ]);

        if (isset($response['error'])) {
            error_log('Google token exchange failed: ' . $response['error']);
            return null;
        }

        $data = $response['data'];
        if (isset($data['error'])) {
            error_log('Google token exchange rejected: ' . (string) ($data['error_description'] ?? $data['error']));
            return null;
        }

        $idToken = (string) ($data['id_token'] ?? '');
        return $idToken !== '' ? $idToken : null;
    }

    // Returns the claims when the token verifies and its nonce matches the one we
    // issued. Apple's documentation is ambiguous about whether the ID token carries
    // the nonce or a SHA-256 of it, so both forms are accepted; every other
    // provider uses the raw value, which is tried first.
    function studioOAuthVerifyWithNonce($idToken, $jwksEndpoint, $audience, $issuers, $nonce) {
        if ($nonce === '') {
            return studioVerifyIdToken($idToken, $jwksEndpoint, $audience, $issuers, '');
        }

        $claims = studioVerifyIdToken($idToken, $jwksEndpoint, $audience, $issuers, $nonce);
        if ($claims) return $claims;

        $hashed = hash('sha256', $nonce);
        return studioVerifyIdToken($idToken, $jwksEndpoint, $audience, $issuers, $hashed);
    }

    // ------------------------------------------------------------- apple flow

    function studioAppleConfigured($serviceId, $teamId, $keyId, $privateKey) {
        return trim((string) $serviceId) !== ''
            && trim((string) $teamId) !== ''
            && trim((string) $keyId) !== ''
            && trim((string) $privateKey) !== '';
    }

    // Apple has no static client secret: it is a JWT this server signs with the
    // .p8 key, and Apple caps its lifetime at six months. It is generated per
    // request rather than stored, so it can never be stale.
    function studioAppleClientSecret($teamId, $keyId, $serviceId, $privateKey, $lifetimeSeconds = 15552000) {
        $key = @openssl_pkey_get_private((string) $privateKey);
        if (!$key) {
            error_log('Apple client secret: the private key could not be read');
            return null;
        }

        $header = ['alg' => 'ES256', 'kid' => (string) $keyId, 'typ' => 'JWT'];
        $claims = [
            'iss' => (string) $teamId,
            'iat' => time(),
            'exp' => time() + max(60, min((int) $lifetimeSeconds, 15777000)),
            'aud' => 'https://appleid.apple.com',
            'sub' => (string) $serviceId,
        ];

        $input = studioOAuthBase64UrlEncode(json_encode($header))
            . '.' . studioOAuthBase64UrlEncode(json_encode($claims));

        if (!openssl_sign($input, $derSignature, $key, OPENSSL_ALGO_SHA256)) {
            error_log('Apple client secret: signing failed');
            return null;
        }

        return $input . '.' . studioOAuthBase64UrlEncode(studioEcdsaDerToRaw($derSignature));
    }

    // OpenSSL emits ECDSA signatures as DER SEQUENCE{INTEGER r, INTEGER s}, but a
    // JWS ES256 signature must be the raw 64-byte r||s. Apple rejects DER, so this
    // conversion is required rather than cosmetic.
    function studioEcdsaDerToRaw($der) {
        if ($der === '' || ord($der[0]) !== 0x30) return $der;

        $offset = 2;
        if ((ord($der[1]) & 0x80) !== 0) {
            $offset += ord($der[1]) & 0x7F; // long-form length
        }

        $raw = '';
        for ($i = 0; $i < 2; $i++) {
            if (!isset($der[$offset]) || ord($der[$offset]) !== 0x02) return $der;
            $offset++;
            $length = ord($der[$offset]);
            $offset++;
            $value = substr($der, $offset, $length);
            $offset += $length;
            $value = ltrim($value, "\x00");
            $raw .= str_pad($value, 32, "\x00", STR_PAD_LEFT);
        }

        return $raw;
    }

    function studioAppleRedirectUri($lang = 'nihongo') {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if ($host === '') return '/studio_api.php?lang=nihongo&action=auth_apple_callback';
        $isHttps = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
        $path = '/studio_api.php?lang=' . rawurlencode($lang) . '&action=auth_apple_callback';
        return ($isHttps ? 'https://' : 'http://') . $host . $path;
    }

    // Apple wants form_post: it POSTs the authorization code back to the callback
    // rather than appending it to the query string.
    function studioAppleAuthorizeUrl($serviceId, $redirectUri, $state, $nonce) {
        $params = [
            'client_id' => $serviceId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'name email',
            'state' => $state,
            'nonce' => $nonce,
            'response_mode' => 'form_post',
        ];
        return STUDIO_APPLE_AUTHORIZE_ENDPOINT . '?' . http_build_query($params);
    }

    function studioAppleExchangeCode($serviceId, $clientSecret, $code, $redirectUri) {
        $response = studioHttpPostForm(STUDIO_APPLE_TOKEN_ENDPOINT, [
            'client_id' => $serviceId,
            'client_secret' => $clientSecret,
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => $redirectUri,
        ]);

        if (isset($response['error'])) {
            error_log('Apple token exchange failed: ' . $response['error']);
            return null;
        }

        $data = $response['data'];
        if (isset($data['error'])) {
            error_log('Apple token exchange rejected: ' . (string) ($data['error'] ?? ''));
            return null;
        }

        $idToken = (string) ($data['id_token'] ?? '');
        return $idToken !== '' ? $idToken : null;
    }

    function studioAppleIdentityFromClaims($claims) {
        $subject = trim((string) ($claims['sub'] ?? ''));
        if ($subject === '') return null;

        $email = trim((string) ($claims['email'] ?? ''));
        $emailVerified = filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
        // Apple relay addresses hide the real one, but it is still a deliverable,
        // verified address, so it is kept when Apple says it is verified.
        if (!$emailVerified) $email = '';

        return [
            'provider' => 'apple',
            'subject' => $subject,
            'email' => $email,
            'name' => '',
        ];
    }

    function studioGoogleIdentityFromClaims($claims) {
        $subject = trim((string) ($claims['sub'] ?? ''));
        if ($subject === '') return null;

        $email = trim((string) ($claims['email'] ?? ''));
        // Google reports whether it has verified the address; treat unverified as
        // absent rather than trusting it.
        $emailVerified = filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$emailVerified) $email = '';

        return [
            'provider' => 'google',
            'subject' => $subject,
            'email' => $email,
            'name' => trim((string) ($claims['name'] ?? '')),
        ];
    }
}
