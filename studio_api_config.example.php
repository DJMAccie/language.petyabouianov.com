<?php
// Copy this file to studio_api_config.php on the server and set a real password.
$admin_password = 'change-this-studio-admin-password';
$sync_token = 'change-this-private-sync-token';
$write_token = 'change-this-private-write-token';

// Personal-app default: list create/edit/delete stays seamless on web and iOS.
// Set to true, or set STUDIO_API_REQUIRE_LIST_WRITE_AUTH=1, to require tokens again.
$require_list_write_auth = false;
