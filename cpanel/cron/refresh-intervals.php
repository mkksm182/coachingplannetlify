<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('COACH_INTERNAL', true);
require_once dirname(__DIR__) . '/public/api/_intervals-core.php';

try {
    $config = coach_load_config(true);
    coach_fetch_snapshot($config, null, time());
    fwrite(STDOUT, "Coach Center cache refreshed.\n");
    exit(0);
} catch (Exception $error) {
    fwrite(STDERR, "Coach Center cache refresh failed safely.\n");
    exit(1);
}
