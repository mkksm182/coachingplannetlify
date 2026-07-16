<?php

define('COACH_INTERNAL', true);
require_once __DIR__ . '/_intervals-core.php';

$config = array();
try {
    $config = coach_load_config(false);
} catch (Exception $ignored) {
    $config = array();
}
coach_apply_cors($config);

if (coach_request_method() === 'OPTIONS') {
    coach_json_response(array('ok' => true), 200);
}
if (coach_request_method() !== 'POST') {
    coach_json_response(array('ok' => false, 'error' => 'Use POST.'), 405);
}

try {
    $config = coach_load_config(true);
    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($contentLength > 65536) {
        coach_json_response(array('ok' => false, 'error' => 'Request body is too large.'), 413);
    }
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if ($raw === false || strlen($raw) > 65536) {
        coach_json_response(array('ok' => false, 'error' => 'Request body is too large.'), 413);
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        coach_json_response(array('ok' => false, 'error' => 'Invalid JSON body.'), 400);
    }
    $expected = isset($config['webhook_secret']) ? (string) $config['webhook_secret'] : '';
    $provided = isset($_SERVER['HTTP_X_COACH_WEBHOOK_SECRET']) ? (string) $_SERVER['HTTP_X_COACH_WEBHOOK_SECRET'] : '';
    if ($provided === '' && isset($_SERVER['HTTP_AUTHORIZATION']) && strpos($_SERVER['HTTP_AUTHORIZATION'], 'Bearer ') === 0) {
        $provided = substr($_SERVER['HTTP_AUTHORIZATION'], 7);
    }
    if ($provided === '' && isset($body['secret'])) {
        $provided = (string) $body['secret'];
    }
    if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
        coach_json_response(array('ok' => false, 'error' => 'Unauthorized webhook secret.'), 401);
    }
    $snapshot = coach_fetch_snapshot($config, null, time());
    $received = isset($body['events']) && is_array($body['events']) ? count($body['events']) : 0;
    coach_json_response(array('ok' => true, 'reason' => 'webhook', 'received' => $received, 'snapshot' => $snapshot), 200);
} catch (Exception $error) {
    coach_json_response(array('ok' => false, 'error' => coach_safe_error($error->getMessage())), 500);
}
