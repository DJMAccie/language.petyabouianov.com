<?php
// studio_accounts.php
// Account, session, and per-account storage layer for Language Studio.
//
// Every account owns a private data directory (users/<account-id>/) that holds its
// own lists, scores, word stats, and sync bookkeeping. Nothing in here is web
// readable: .htaccess denies *.json inside users/, and accounts.json is denied
// outright.
//
// Security model:
//   - Passwords are stored only as password_hash() digests, never in plaintext.
//   - Login issues a PHP session; the browser sends the cookie automatically, so
//     no password is ever embedded in page JavaScript.
//   - Sessions are bound to a user agent fingerprint to limit cookie theft reuse.
//   - Registration and login are rate limited per IP and per username.

if (!defined('STUDIO_ACCOUNTS_LOADED')) {
    define('STUDIO_ACCOUNTS_LOADED', 1);

    if (session_status() === PHP_SESSION_NONE) {
        $isHttps = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);

        if (PHP_VERSION_ID >= 70300) {
            session_set_cookie_params([
                'lifetime' => 0,
                'path' => '/',
                'domain' => '',
                'secure' => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        } else {
            session_set_cookie_params(0, '/; samesite=Lax', '', $isHttps, true);
        }
        session_name('STUDIOSESSID');
        @session_start();
    }
}

if (!function_exists('studioAccountsDir')) {
    define('STUDIO_MIN_USERNAME_LENGTH', 3);
    define('STUDIO_MAX_USERNAME_LENGTH', 32);
    define('STUDIO_MIN_PASSWORD_LENGTH', 8);

    function studioAccountsDir() {
        return __DIR__ . '/users';
    }

    // ---------------------------------------------------------------- JSON I/O

    function studioReadJsonFile($filename) {
        if (!file_exists($filename)) return '{}';
        $fp = @fopen($filename, 'r');
        if (!$fp) return '{}';

        flock($fp, LOCK_SH);
        $content = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        if ($content === false || trim($content) === '') return '{}';
        return $content;
    }

    // Atomically read, modify, and write a JSON document under an exclusive lock.
    function studioModifyJsonFile($filename, $callback) {
        $dir = dirname($filename);
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            error_log("Unable to create directory $dir");
            return false;
        }

        if (!file_exists($filename)) {
            @file_put_contents($filename, '{}');
        }

        $fp = fopen($filename, 'c+');
        if (!$fp) {
            error_log("Failed to open $filename for writing.");
            return false;
        }

        if (!flock($fp, LOCK_EX)) {
            error_log("Could not obtain lock on $filename.");
            fclose($fp);
            return false;
        }

        $content = '';
        while (!feof($fp)) {
            $content .= fread($fp, 8192);
        }

        $data = json_decode($content, true);
        if (!is_array($data)) $data = [];

        $data = $callback($data);

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    }

    function studioWriteJsonFile($filename, $payload) {
        $dir = dirname($filename);
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            return false;
        }
        return @file_put_contents(
            $filename,
            json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
            LOCK_EX
        ) !== false;
    }

    // ------------------------------------------------------------------ limits

    // Sliding-window limiter. Returns true when the request is allowed.
    function studioRateLimit($rateLimitFile, $bucketKey, $maxRequests, $windowSeconds) {
        $now = time();
        $windowStart = $now - max(1, $windowSeconds);
        $allowed = true;

        studioModifyJsonFile($rateLimitFile, function ($rootData) use ($bucketKey, $maxRequests, $windowStart, $now, &$allowed) {
            if (!is_array($rootData)) $rootData = [];
            $bucket = (isset($rootData[$bucketKey]) && is_array($rootData[$bucketKey])) ? $rootData[$bucketKey] : [];

            $recent = [];
            foreach ($bucket as $timestamp) {
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

        return $allowed;
    }

    function studioClientIpAddress() {
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

    // ---------------------------------------------------------------- accounts

    function studioAccountsFile() {
        return studioAccountsDir() . '/accounts.json';
    }

    function studioNormalizeUsername($value) {
        $name = trim((string) $value);
        // Collapse internal whitespace; usernames may not contain spaces at all.
        $name = preg_replace('/\s+/', '', $name);
        $name = preg_replace('/[^A-Za-z0-9._-]/', '', $name);
        return substr($name, 0, STUDIO_MAX_USERNAME_LENGTH);
    }

    // True when normalization would have to change the name, i.e. the input held
    // characters that are not allowed in a username.
    function studioUsernameNeedsStripping($value) {
        $raw = trim((string) $value);
        $collapsed = preg_replace('/\s+/', '', $raw);
        return $collapsed !== $raw || $collapsed !== preg_replace('/[^A-Za-z0-9._-]/', '', $collapsed);
    }

    function studioUsernameKey($username) {
        return function_exists('mb_strtolower') ? mb_strtolower($username) : strtolower($username);
    }

    function studioValidateUsername($username, $rawInput = null) {
        $length = strlen($username);
        if ($rawInput !== null && studioUsernameNeedsStripping($rawInput)) {
            return 'Username can only use letters, numbers, dots, dashes, and underscores.';
        }
        if ($length < STUDIO_MIN_USERNAME_LENGTH || $length > STUDIO_MAX_USERNAME_LENGTH) {
            return 'Username must be ' . STUDIO_MIN_USERNAME_LENGTH . '-' . STUDIO_MAX_USERNAME_LENGTH . ' characters.';
        }
        if (!preg_match('/^[A-Za-z0-9._-]+$/', $username)) {
            return 'Username can only use letters, numbers, dots, dashes, and underscores.';
        }
        if (!preg_match('/[A-Za-z0-9]/', $username)) {
            return 'Username must contain at least one letter or number.';
        }
        return null;
    }

    function studioValidatePassword($password) {
        $password = (string) $password;
        if (strlen($password) < STUDIO_MIN_PASSWORD_LENGTH) {
            return 'Password must be at least ' . STUDIO_MIN_PASSWORD_LENGTH . ' characters.';
        }
        if (strlen($password) > 200) {
            return 'Password must be at most 200 characters.';
        }
        return null;
    }

    function studioLoadAccounts() {
        $decoded = json_decode(studioReadJsonFile(studioAccountsFile()), true);
        if (!is_array($decoded)) return [];
        $accounts = $decoded['accounts'] ?? [];
        return is_array($accounts) ? $accounts : [];
    }

    function studioFindAccountByUsername($username) {
        $key = studioUsernameKey(studioNormalizeUsername($username));
        if ($key === '') return null;

        foreach (studioLoadAccounts() as $account) {
            if (!is_array($account)) continue;
            $storedKey = $account['username_key'] ?? studioUsernameKey((string) ($account['username'] ?? ''));
            if ($storedKey === $key) return $account;
        }
        return null;
    }

    function studioFindAccountById($accountId) {
        $accountId = trim((string) $accountId);
        if ($accountId === '') return null;

        foreach (studioLoadAccounts() as $account) {
            if (is_array($account) && ($account['id'] ?? '') === $accountId) return $account;
        }
        return null;
    }

    // ---------------------------------------------------- external identities

    // Accounts may be reached with a password, with a social identity, or both.
    // Identities are matched on the provider's immutable subject id, never on the
    // email address alone.
    function studioFindAccountByIdentity($provider, $subject) {
        $provider = strtolower(trim((string) $provider));
        $subject = trim((string) $subject);
        if ($provider === '' || $subject === '') return null;

        foreach (studioLoadAccounts() as $account) {
            if (!is_array($account)) continue;
            $identities = $account['identities'] ?? [];
            if (!is_array($identities)) continue;

            foreach ($identities as $identity) {
                if (!is_array($identity)) continue;
                if (strtolower((string) ($identity['provider'] ?? '')) === $provider
                    && hash_equals((string) ($identity['subject'] ?? ''), $subject)) {
                    return $account;
                }
            }
        }
        return null;
    }

    function studioAttachIdentity($accountId, $provider, $subject, $email) {
        $now = time();
        $written = studioModifyJsonFile(studioAccountsFile(), function ($rootData) use ($accountId, $provider, $subject, $email, $now) {
            if (!isset($rootData['accounts']) || !is_array($rootData['accounts'])) return $rootData;

            foreach ($rootData['accounts'] as $index => $existing) {
                if (!is_array($existing) || ($existing['id'] ?? '') !== $accountId) continue;

                if (!isset($rootData['accounts'][$index]['identities']) || !is_array($rootData['accounts'][$index]['identities'])) {
                    $rootData['accounts'][$index]['identities'] = [];
                }

                foreach ($rootData['accounts'][$index]['identities'] as $identity) {
                    if (is_array($identity)
                        && strtolower((string) ($identity['provider'] ?? '')) === strtolower($provider)
                        && (string) ($identity['subject'] ?? '') === $subject) {
                        return $rootData; // Already linked.
                    }
                }

                $rootData['accounts'][$index]['identities'][] = [
                    'provider' => strtolower($provider),
                    'subject' => $subject,
                    'email' => $email,
                    'linked_at' => $now,
                ];

                // Keep the account's own email in sync for display purposes.
                if ($email !== '' && trim((string) ($rootData['accounts'][$index]['email'] ?? '')) === '') {
                    $rootData['accounts'][$index]['email'] = $email;
                }
                return $rootData;
            }

            return $rootData;
        });

        return (bool) $written;
    }

    // Derives an available username for a brand new social account. Never reuses
    // an existing name, so two people cannot collide silently.
    function studioSuggestUsername($email, $preferred = '') {
        $base = studioNormalizeUsername($preferred);
        if ($base === '') {
            $local = strstr((string) $email, '@', true);
            $base = studioNormalizeUsername($local !== false ? $local : '');
        }
        if (strlen($base) < STUDIO_MIN_USERNAME_LENGTH) {
            $base = 'user';
        }
        $base = substr($base, 0, STUDIO_MAX_USERNAME_LENGTH - 4);

        if (!studioFindAccountByUsername($base)) return $base;

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $suffix = '-' . bin2hex(random_bytes(2));
            $candidate = substr($base, 0, STUDIO_MAX_USERNAME_LENGTH - strlen($suffix)) . $suffix;
            if (!studioFindAccountByUsername($candidate)) return $candidate;
        }

        return null;
    }

    // Accounts that carry the login credentials every account record needs.
    function studioAccountStoragePath($account) {
        $id = (string) ($account['storage'] ?? '');
        // Defensive: storage folders are always plain generated ids.
        if (!preg_match('/^[A-Za-z0-9_-]{4,64}$/', $id)) return null;
        return studioAccountsDir() . '/' . $id;
    }

    function studioAccountDataFile($account, $basename) {
        $dir = studioAccountStoragePath($account);
        if (!$dir) return null;
        // Basenames are internal constants; refuse anything path-like anyway.
        if (strpos($basename, '/') !== false || strpos($basename, '\\') !== false) return null;
        return $dir . '/' . $basename;
    }

    function studioPublicAccount($account) {
        if (!is_array($account)) return null;

        $providers = [];
        foreach (($account['identities'] ?? []) as $identity) {
            if (is_array($identity) && ($identity['provider'] ?? '') !== '') {
                $providers[] = (string) $identity['provider'];
            }
        }

        return [
            'id' => (string) ($account['id'] ?? ''),
            'username' => (string) ($account['username'] ?? ''),
            'email' => (string) ($account['email'] ?? ''),
            'providers' => array_values(array_unique($providers)),
            'has_password' => trim((string) ($account['password_hash'] ?? '')) !== '',
            'is_admin' => !empty($account['is_admin']),
            'created_at' => (int) ($account['created_at'] ?? 0),
            'last_login_at' => (int) ($account['last_login_at'] ?? 0),
        ];
    }

    function studioCreateAccount($username, $password, $options = []) {
        $rawUsername = (string) $username;
        $username = studioNormalizeUsername($rawUsername);

        $usernameError = studioValidateUsername($username, $rawUsername);
        if ($usernameError) {
            return ['error' => $usernameError, 'status' => 400, 'code' => 'invalid_username'];
        }

        $passwordError = studioValidatePassword($password);
        if ($passwordError) {
            return ['error' => $passwordError, 'status' => 400, 'code' => 'invalid_password'];
        }

        if (studioFindAccountByUsername($username)) {
            return ['error' => 'That username is already taken.', 'status' => 409, 'code' => 'username_taken'];
        }

        $account = [
            'id' => 'u_' . bin2hex(random_bytes(8)),
            'storage' => bin2hex(random_bytes(8)),
            'username' => $username,
            'username_key' => studioUsernameKey($username),
            'password_hash' => password_hash((string) $password, PASSWORD_DEFAULT),
            'email' => '',
            'identities' => [],
            'is_admin' => !empty($options['is_admin']),
            'created_at' => time(),
            'last_login_at' => 0,
        ];

        $written = studioModifyJsonFile(studioAccountsFile(), function ($rootData) use ($account, $username) {
            if (!is_array($rootData)) $rootData = [];
            if (!isset($rootData['accounts']) || !is_array($rootData['accounts'])) {
                $rootData['accounts'] = [];
            }

            $key = studioUsernameKey($username);
            foreach ($rootData['accounts'] as $existing) {
                if (is_array($existing)
                    && ($existing['username_key'] ?? studioUsernameKey((string) ($existing['username'] ?? ''))) === $key) {
                    return $rootData; // Lost a race; caller detects via re-lookup.
                }
            }

            $rootData['accounts'][] = $account;
            return $rootData;
        });

        if (!$written) {
            return ['error' => 'Could not save the account. Please try again.', 'status' => 500, 'code' => 'storage_error'];
        }

        $stored = studioFindAccountByUsername($username);
        if (!$stored || ($stored['id'] ?? '') !== $account['id']) {
            return ['error' => 'That username is already taken.', 'status' => 409, 'code' => 'username_taken'];
        }

        studioEnsureAccountStorage($stored);

        return ['account' => $stored];
    }

    // Creates an account that has no password and is reachable only through its
    // external identity. Deliberately never merges into an existing account.
    function studioCreateSocialAccount($provider, $subject, $email, $options = []) {
        $provider = strtolower(trim((string) $provider));
        $subject = trim((string) $subject);

        if ($provider === '' || $subject === '') {
            return ['error' => 'The provider did not return an account identifier.', 'status' => 400, 'code' => 'missing_subject'];
        }

        $existing = studioFindAccountByIdentity($provider, $subject);
        if ($existing) return ['account' => $existing, 'created' => false];

        $username = studioSuggestUsername($email, $options['preferred_username'] ?? '');
        if ($username === null) {
            return ['error' => 'Could not allocate a username. Please try again.', 'status' => 500, 'code' => 'username_unavailable'];
        }

        $account = [
            'id' => 'u_' . bin2hex(random_bytes(8)),
            'storage' => bin2hex(random_bytes(8)),
            'username' => $username,
            'username_key' => studioUsernameKey($username),
            // Social accounts carry no password; the empty hash can never verify.
            'password_hash' => '',
            'email' => trim((string) $email),
            'identities' => [[
                'provider' => $provider,
                'subject' => $subject,
                'email' => trim((string) $email),
                'linked_at' => time(),
            ]],
            'is_admin' => !empty($options['is_admin']),
            'created_at' => time(),
            'last_login_at' => 0,
        ];

        $written = studioModifyJsonFile(studioAccountsFile(), function ($rootData) use ($account, $provider, $subject) {
            if (!is_array($rootData)) $rootData = [];
            if (!isset($rootData['accounts']) || !is_array($rootData['accounts'])) {
                $rootData['accounts'] = [];
            }

            // Re-check under the write lock so simultaneous callbacks cannot create
            // two accounts for the same identity.
            foreach ($rootData['accounts'] as $existing) {
                if (!is_array($existing)) continue;
                if (($existing['username_key'] ?? '') === $account['username_key']) {
                    return $rootData; // Username taken in the meantime.
                }
                foreach (($existing['identities'] ?? []) as $identity) {
                    if (is_array($identity)
                        && strtolower((string) ($identity['provider'] ?? '')) === $provider
                        && (string) ($identity['subject'] ?? '') === $subject) {
                        return $rootData; // Identity already registered.
                    }
                }
            }

            $rootData['accounts'][] = $account;
            return $rootData;
        });

        if (!$written) {
            return ['error' => 'Could not save the account. Please try again.', 'status' => 500, 'code' => 'storage_error'];
        }

        $stored = studioFindAccountByIdentity($provider, $subject);
        if (!$stored) {
            return ['error' => 'Could not save the account. Please try again.', 'status' => 500, 'code' => 'storage_error'];
        }

        studioEnsureAccountStorage($stored);

        return ['account' => $stored, 'created' => true];
    }

    function studioEnsureAccountStorage($account) {
        $dir = studioAccountStoragePath($account);
        if (!$dir) return false;
        if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
            error_log("Unable to create account storage $dir");
            return false;
        }

        // Direct deny rules so the data stays unreadable even if the parent
        // .htaccess is ever replaced or the folder is served with another config.
        $guard = $dir . '/.htaccess';
        if (!file_exists($guard)) {
            @file_put_contents($guard, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
        }
        $indexGuard = $dir . '/index.html';
        if (!file_exists($indexGuard)) {
            @file_put_contents($indexGuard, "");
        }

        return true;
    }

    function studioAuthenticate($username, $password) {
        $account = studioFindAccountByUsername($username);
        $hash = is_array($account) ? (string) ($account['password_hash'] ?? '') : '';

        if ($hash === '') {
            // Equalize timing so unknown usernames are not distinguishable by speed.
            password_verify('studio-dummy-password', '$2y$10$usesomesillystringforsalt0000000000000000000000000000000');
            return null;
        }

        if (!password_verify((string) $password, $hash)) {
            return null;
        }

        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            $newHash = password_hash((string) $password, PASSWORD_DEFAULT);
            studioModifyJsonFile(studioAccountsFile(), function ($rootData) use ($account, $newHash) {
                if (!isset($rootData['accounts']) || !is_array($rootData['accounts'])) return $rootData;
                foreach ($rootData['accounts'] as $index => $existing) {
                    if (is_array($existing) && ($existing['id'] ?? '') === ($account['id'] ?? '')) {
                        $rootData['accounts'][$index]['password_hash'] = $newHash;
                    }
                }
                return $rootData;
            });
        }

        return $account;
    }

    function studioTouchLogin($account) {
        $now = time();
        studioModifyJsonFile(studioAccountsFile(), function ($rootData) use ($account, $now) {
            if (!isset($rootData['accounts']) || !is_array($rootData['accounts'])) return $rootData;
            foreach ($rootData['accounts'] as $index => $existing) {
                if (is_array($existing) && ($existing['id'] ?? '') === ($account['id'] ?? '')) {
                    $rootData['accounts'][$index]['last_login_at'] = $now;
                }
            }
            return $rootData;
        });
    }

    function studioCountAccounts() {
        return count(studioLoadAccounts());
    }

    // ------------------------------------------------------- per-account data

    // Prepares an account's private data files.
    //
    // The very first account (the site owner) inherits the pre-accounts runtime
    // files that used to be global. Everyone else starts with an empty progress
    // record, optionally seeded with the bundled study lists.
    function studioPrepareAccountData($account, $lang, $basenames) {
        if (!is_array($account) || !studioEnsureAccountStorage($account)) {
            return false;
        }

        // Progress only. Study content now lives in the shared library
        // (nihongo_lists.json), which every visitor reads, so migrating the
        // owner's list file into a private copy would duplicate it and stop the
        // shared library from being the single source of truth.
        $legacySource = [
            'scores' => __DIR__ . '/global_scores.json',
            'stats' => __DIR__ . '/global_word_stats.json',
        ];

        $isOwner = false;
        $owner = studioOwnerAccount();
        if (is_array($owner) && ($owner['id'] ?? '') === ($account['id'] ?? '')) {
            $isOwner = true;
        }

        foreach ($basenames as $key => $basename) {
            $target = studioAccountDataFile($account, $basename);
            if (!$target || file_exists($target)) continue;

            // 1. The owner keeps studying exactly where they left off.
            if ($isOwner && isset($legacySource[$key]) && file_exists($legacySource[$key])) {
                if (!@copy($legacySource[$key], $target)) {
                    error_log("Account migration failed for {$target}");
                }
                continue;
            }

            // 2. Personal lists start empty; the shared library supplies content.
            if ($key === 'lists') {
                studioWriteJsonFile($target, [$lang => []]);
            }
        }

        return true;
    }

    // ---------------------------------------------------------------- sessions

    function studioSessionFingerprint() {
        $agent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
        return substr(hash('sha256', 'studio-session|' . $agent), 0, 32);
    }

    function studioLoginSession($account) {
        // Prevent session fixation: always start from a fresh id on privilege change.
        if (session_status() === PHP_SESSION_ACTIVE) {
            @session_regenerate_id(true);
        }

        $_SESSION['account_id'] = (string) ($account['id'] ?? '');
        $_SESSION['username'] = (string) ($account['username'] ?? '');
        $_SESSION['fingerprint'] = studioSessionFingerprint();
        $_SESSION['issued_at'] = time();
        $_SESSION['last_seen_at'] = time();
    }

    function studioCurrentAccount() {
        if (session_status() !== PHP_SESSION_ACTIVE) return null;

        $accountId = trim((string) ($_SESSION['account_id'] ?? ''));
        if ($accountId === '') return null;

        $fingerprint = (string) ($_SESSION['fingerprint'] ?? '');
        if ($fingerprint === '' || !hash_equals($fingerprint, studioSessionFingerprint())) {
            studioLogoutSession();
            return null;
        }

        // Idle timeout keeps abandoned sessions from living forever.
        $lastSeen = (int) ($_SESSION['last_seen_at'] ?? 0);
        if ($lastSeen > 0 && (time() - $lastSeen) > 60 * 60 * 24 * 30) {
            studioLogoutSession();
            return null;
        }
        $_SESSION['last_seen_at'] = time();

        $account = studioFindAccountById($accountId);
        if (!$account) {
            studioLogoutSession();
            return null;
        }

        return $account;
    }

    function studioLogoutSession() {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $params['path'] ?? '/', $params['domain'] ?? '', !empty($params['secure']), !empty($params['httponly']));
            }
            @session_destroy();
        }
    }

    // ------------------------------------------------- owner / legacy bridge

    // The site owner is the first account created. Used to decide who inherits
    // the pre-accounts runtime data during the one-time migration.
    function studioOwnerAccount() {
        $accounts = studioLoadAccounts();
        $owner = null;
        foreach ($accounts as $account) {
            if (!is_array($account)) continue;
            if ($owner === null || (int) ($account['created_at'] ?? 0) < (int) ($owner['created_at'] ?? PHP_INT_MAX)) {
                $owner = $account;
            }
        }
        return $owner;
    }

    // Transitional bridge: the pre-accounts iOS wrapper and deploy script call the
    // API with no cookie. They may still present the configured sync/write/admin
    // secret to act as the owner account. Disable with:
    //   $allow_legacy_token_owner_access = false;   (studio_api_config.php)
    function studioLegacyOwnerAccount($data, $secrets, $hasAnySecret, $allowLegacyTokenAccess) {
        if (!$allowLegacyTokenAccess || !$hasAnySecret) return null;

        foreach ($secrets as $secret) {
            if (!is_string($secret) || $secret === '') continue;

            $candidates = [
                trim((string) ($data['sync_token'] ?? '')),
                trim((string) ($data['write_token'] ?? '')),
                (string) ($data['password'] ?? ''),
            ];

            foreach ($candidates as $candidate) {
                if ($candidate !== '' && hash_equals($secret, $candidate)) {
                    return studioOwnerAccount();
                }
            }
        }

        return null;
    }
}
