<?php

define('COACH_INTERNAL', true);
require_once __DIR__ . '/_bootstrap.php';

$configFound = false;
$hasKey = false;
try {
    $configFound = is_file(coach_config_path());
    $config = coach_load_config(false);
    $key = isset($config['intervals_api_key']) ? trim((string) $config['intervals_api_key']) : '';
    $hasKey = $key !== '' && $key !== 'WKLEJ_KLUCZ_TUTAJ';
} catch (Exception $ignored) {
    $config = array();
}
coach_apply_cors($config);

$cacheDirectory = dirname(coach_cache_path());
$writable = is_dir($cacheDirectory) ? is_writable($cacheDirectory) : is_writable(dirname($cacheDirectory));
coach_json_response(array(
    'ok' => true,
    'php' => PHP_VERSION,
    'curl' => function_exists('curl_init'),
    'openssl' => extension_loaded('openssl'),
    'configFound' => $configFound,
    'cacheWritable' => $writable,
    'hasIntervalsApiKey' => $hasKey,
    'now' => gmdate('c'),
), 200);
