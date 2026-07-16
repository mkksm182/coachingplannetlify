<?php

if (!defined('COACH_INTERNAL')) {
    http_response_code(404);
    exit;
}

date_default_timezone_set('UTC');

function coach_home_dir()
{
    $home = isset($_SERVER['HOME']) ? $_SERVER['HOME'] : getenv('HOME');
    if (!is_string($home) || $home === '') {
        throw new RuntimeException('Private configuration is unavailable.');
    }
    return rtrim($home, '/');
}

function coach_config_path()
{
    $override = getenv('COACH_CONFIG_PATH');
    if (is_string($override) && $override !== '') {
        return $override;
    }
    return coach_home_dir() . '/coach-private/config.php';
}

function coach_cache_path()
{
    $override = getenv('COACH_CACHE_PATH');
    if (is_string($override) && $override !== '') {
        return $override;
    }
    return coach_home_dir() . '/coach-private/cache/latest.json';
}

function coach_load_config($required)
{
    $path = coach_config_path();
    if (!is_file($path)) {
        if ($required) {
            throw new RuntimeException('Private configuration is missing.');
        }
        return array();
    }
    $config = require $path;
    if (!is_array($config)) {
        throw new RuntimeException('Private configuration is invalid.');
    }
    return $config;
}

function coach_apply_security_headers()
{
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
}

function coach_apply_cors($config)
{
    $allowed = isset($config['allowed_origin']) ? (string) $config['allowed_origin'] : 'https://coach.michalikstudio.com';
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin !== '' && hash_equals($allowed, $origin)) {
        header('Access-Control-Allow-Origin: ' . $allowed);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Coach-Webhook-Secret, Authorization');
    header('Access-Control-Max-Age: 600');
}

function coach_json_response($payload, $status)
{
    coach_apply_security_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        http_response_code(500);
        $json = '{"ok":false,"error":"Response encoding failed."}';
    }
    echo $json;
    exit;
}

function coach_request_method()
{
    return isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
}

function coach_safe_error($message)
{
    $allowed = array(
        'Private configuration is missing.',
        'Private configuration is invalid.',
        'Intervals API key is missing.',
        'Intervals.icu is temporarily unavailable.',
        'Cache is unavailable.',
    );
    return in_array($message, $allowed, true) ? $message : 'Synchronization failed safely.';
}
