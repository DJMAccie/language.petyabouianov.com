<?php
// Copy this file to studio_api_config.php on the server and set real values.
//
// This file must never be committed or served over the web:
//   - .gitignore excludes it
//   - .htaccess denies *.config.php and config.php
//   - the FTP deploy excludes it
// Keep it at the domain root, next to studio_api.php.

$admin_password = 'change-this-studio-admin-password';
$sync_token = 'change-this-private-sync-token';
$write_token = 'change-this-private-write-token';

// Personal-app default: list create/edit/delete stays seamless on web and iOS.
// Set to true, or set STUDIO_API_REQUIRE_LIST_WRITE_AUTH=1, to require tokens again.
$require_list_write_auth = false;

// --- Sign in with Google (optional) ---
// From Google Cloud Console > APIs & Services > Credentials > OAuth client ID
// (application type: Web application).
//
// Register this exact Authorised redirect URI:
//   https://language.petyabouianov.com/studio_api.php?lang=nihongo&action=auth_google_callback
//
// No APIs need to be enabled in the API Library for sign-in: the OAuth endpoints
// are always available, and the default openid/email/profile scopes are not
// sensitive, so no verification review is required.
//
// Leave both empty to hide the Google button entirely.
$google_client_id = '';
$google_client_secret = '';

// --- Sign in with Apple (optional) ---
// From Apple Developer > Certificates, Identifiers & Profiles:
//   $apple_service_id  the Services ID (Identifiers > Services IDs), e.g.
//                      com.example.web
//   $apple_team_id     Membership details > Team ID
//   $apple_key_id      the Key ID shown next to your Sign in with Apple key
//   $apple_private_key the full contents of the downloaded .p8 file, including
//                      the BEGIN/END PRIVATE KEY lines
//
// Register this exact Return URL on the Services ID:
//   https://language.petyabouianov.com/studio_api.php?lang=nihongo&action=auth_apple_callback
//
// Apple issues no static client secret: it is a JWT signed with the .p8 and is
// generated per request, so nothing here needs rotating by hand.
//
// Leave these empty to hide the Apple button entirely.
$apple_service_id = '';
$apple_team_id = '';
$apple_key_id = '';
$apple_private_key = '';

// Transitional: pre-accounts clients (the iOS wrapper and the deploy-time runtime
// sync) may act as the owner account by presenting one of the secrets above.
// Set to false once every client signs in normally.
$allow_legacy_token_owner_access = true;
