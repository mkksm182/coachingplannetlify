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

try {
    $config = coach_load_config(true);
    $method = coach_request_method();
    if ($method !== 'GET' && $method !== 'POST') {
        coach_json_response(array('ok' => false, 'error' => 'Use GET or POST.'), 405);
    }
    $force = $method === 'POST' || (isset($_GET['force']) && $_GET['force'] === '1');
    coach_json_response(coach_sync_result($config, $force, null, time()), 200);
} catch (Exception $error) {
    coach_json_response(array('ok' => false, 'error' => coach_safe_error($error->getMessage())), 500);
}
