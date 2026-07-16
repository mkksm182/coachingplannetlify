<?php

define('COACH_INTERNAL', true);
require_once dirname(dirname(__DIR__)) . '/cpanel/public/api/_intervals-core.php';

$fixture = json_decode(file_get_contents($argv[1]), true);
$timestamp = (int) $argv[2];
$config = array(
    'oldest_date' => '2026-06-01',
    'newest_date' => null,
    'wellness_days' => 120,
    'cache_ttl_seconds' => 7200,
);
echo json_encode(coach_compute_snapshot($fixture['activities'], $fixture['events'], $fixture['wellness'], $config, $timestamp), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
