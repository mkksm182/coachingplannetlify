<?php

if (!defined('COACH_INTERNAL')) {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/_bootstrap.php';

define('COACH_INTERVALS_API_BASE', 'https://intervals.icu/api/v1');

function coach_intervals_api_base()
{
    $override = getenv('COACH_INTERVALS_API_BASE');
    if (getenv('COACH_TEST_MODE') === '1' && is_string($override) && $override !== '') {
        return rtrim($override, '/');
    }
    return COACH_INTERVALS_API_BASE;
}

function coach_number($value)
{
    return is_numeric($value) ? (float) $value : 0.0;
}

function coach_first_value($source, $keys)
{
    if (!is_array($source)) {
        return null;
    }
    foreach ($keys as $key) {
        if (array_key_exists($key, $source) && $source[$key] !== null && $source[$key] !== '') {
            return $source[$key];
        }
    }
    return null;
}

function coach_first_number($source, $keys)
{
    $value = coach_first_value($source, $keys);
    return $value === null ? 0.0 : coach_number($value);
}

function coach_iso_date($timestamp)
{
    return gmdate('Y-m-d', $timestamp);
}

function coach_activity_date($activity)
{
    $value = coach_first_value($activity, array('start_date_local', 'start_date', 'date'));
    return is_string($value) ? substr($value, 0, 10) : '';
}

function coach_activity_distance_km($activity)
{
    if (is_array($activity) && array_key_exists('distance', $activity) && $activity['distance'] !== null) {
        $distance = coach_number($activity['distance']);
        return $distance / ($distance > 1000 ? 1000 : 1);
    }
    $value = coach_first_value($activity, array('distance_km', 'Distance'));
    return $value === null ? 0.0 : coach_number($value);
}

function coach_activity_duration_hours($activity)
{
    $hours = coach_first_number($activity, array('hours', 'duration_hours', 'durationHours'));
    if ($hours != 0.0) {
        return $hours;
    }
    $seconds = coach_first_number($activity, array('moving_time', 'movingTime', 'elapsed_time', 'elapsedTime', 'duration', 'time', 'total_timer_time'));
    return $seconds == 0.0 ? 0.0 : $seconds / 3600;
}

function coach_activity_load($activity)
{
    return coach_first_number($activity, array('icu_training_load', 'training_load', 'load', 'tss', 'TSS'));
}

function coach_map_activity($activity)
{
    $name = coach_first_value($activity, array('name', 'title'));
    $type = coach_first_value($activity, array('type', 'sport', 'activity_type', 'activityType'));
    if ($type === null) {
        $type = 'Other';
    }
    if ($name === null) {
        $name = $type !== 'Other' ? $type : 'Aktywność';
    }
    $nullable = function ($keys) use ($activity) {
        $value = coach_first_number($activity, $keys);
        return $value == 0.0 ? null : $value;
    };
    return array(
        'id' => coach_first_value($activity, array('id', 'activity_id', 'activityId', 'icu_activity_id')),
        'external_id' => coach_first_value($activity, array('external_id', 'externalId')),
        'paired_event_id' => coach_first_value($activity, array('paired_event_id', 'pairedEventId', 'event_id', 'eventId', 'icu_event_id')),
        'date' => coach_activity_date($activity),
        'start_date_local' => coach_first_value($activity, array('start_date_local', 'startDateLocal')),
        'start_date' => coach_first_value($activity, array('start_date', 'startDate')),
        'name' => $name,
        'type' => $type,
        'km' => round(coach_activity_distance_km($activity), 2),
        'hours' => round(coach_activity_duration_hours($activity), 3),
        'moving_time' => coach_first_number($activity, array('moving_time', 'movingTime')),
        'elapsed_time' => coach_first_number($activity, array('elapsed_time', 'elapsedTime')),
        'load' => round(coach_activity_load($activity)),
        'avg_hr' => $nullable(array('average_heartrate', 'averageHeartRate', 'avg_hr', 'average_hr', 'avgHeartRate')),
        'max_hr' => $nullable(array('max_heartrate', 'maxHeartRate', 'max_hr', 'maximum_heartrate')),
        'avg_watts' => $nullable(array('average_watts', 'averageWatts', 'avg_watts', 'avgWatts')),
        'normalized_watts' => $nullable(array('normalized_watts', 'normalizedWatts', 'icu_weighted_avg_watts', 'weighted_average_watts', 'weightedAverageWatts')),
        'cadence' => $nullable(array('cadence', 'average_cadence', 'averageCadence', 'avg_cadence', 'avgCadence')),
        'elevation' => $nullable(array('total_elevation_gain', 'totalElevationGain', 'elevation_gain', 'elevationGain', 'elevation')),
        'calories' => $nullable(array('calories', 'calorie_count', 'calorieCount')),
        'speed' => $nullable(array('average_speed', 'averageSpeed', 'avg_speed', 'speed')),
        'pace' => coach_first_value($activity, array('average_pace', 'averagePace', 'pace')),
        'url' => coach_first_value($activity, array('url', 'activity_url', 'activityUrl')),
    );
}

function coach_map_event($event)
{
    $name = coach_first_value($event, array('name', 'title'));
    $type = coach_first_value($event, array('type', 'sport', 'activity_type', 'activityType'));
    return array(
        'id' => coach_first_value($event, array('id', 'event_id', 'eventId', 'icu_event_id')),
        'external_id' => coach_first_value($event, array('external_id', 'externalId')),
        'paired_activity_id' => coach_first_value($event, array('paired_activity_id', 'pairedActivityId', 'activity_id', 'activityId')),
        'start_date_local' => coach_first_value($event, array('start_date_local', 'startDateLocal')),
        'start_date' => coach_first_value($event, array('start_date', 'startDate')),
        'type' => $type === null ? 'Other' : $type,
        'category' => coach_first_value($event, array('category', 'event_category', 'eventCategory')),
        'name' => $name === null ? 'Wydarzenie' : $name,
        'description' => coach_first_value($event, array('description', 'notes')),
        'load' => coach_nullable_number($event, array('icu_training_load', 'icuTrainingLoad', 'training_load', 'trainingLoad', 'load', 'tss')),
        'moving_time' => coach_nullable_number($event, array('moving_time', 'movingTime', 'duration', 'duration_seconds', 'durationSeconds')),
        'distance' => coach_nullable_number($event, array('distance', 'distance_m', 'distanceMeters')),
    );
}

function coach_nullable_number($source, $keys)
{
    $value = coach_first_number($source, $keys);
    return $value == 0.0 ? null : $value;
}

function coach_summarize_activities($activities)
{
    $byType = array();
    $km = 0.0;
    $hours = 0.0;
    $load = 0.0;
    $last = null;
    foreach ($activities as $activity) {
        $type = coach_first_value($activity, array('type', 'sport', 'activity_type'));
        if ($type === null) {
            $type = 'Other';
        }
        $byType[$type] = isset($byType[$type]) ? $byType[$type] + 1 : 1;
        $km += coach_activity_distance_km($activity);
        $hours += coach_activity_duration_hours($activity);
        $load += coach_activity_load($activity);
        $date = coach_activity_date($activity);
        if ($date !== '' && ($last === null || strcmp($date, $last) > 0)) {
            $last = $date;
        }
    }
    return array(
        'count' => count($activities),
        'km' => round($km, 1),
        'hours' => round($hours, 1),
        'load' => round($load),
        'byType' => $byType,
        'lastActivityDate' => $last,
    );
}

function coach_filter_since($activities, $days, $nowTimestamp)
{
    $cutoff = coach_iso_date(strtotime('-' . ($days - 1) . ' days', $nowTimestamp));
    return array_values(array_filter($activities, function ($activity) use ($cutoff) {
        return strcmp(coach_activity_date($activity), $cutoff) >= 0;
    }));
}

function coach_wellness_average($recent, $keys)
{
    $values = array();
    foreach ($recent as $entry) {
        foreach ($keys as $key) {
            $value = isset($entry[$key]) ? coach_number($entry[$key]) : 0.0;
            if ($value > 0) {
                $values[] = $value;
                break;
            }
        }
    }
    return count($values) ? round(array_sum($values) / count($values), 1) : null;
}

function coach_summarize_wellness($wellness)
{
    usort($wellness, function ($left, $right) {
        $a = isset($left['id']) ? $left['id'] : (isset($left['date']) ? $left['date'] : '');
        $b = isset($right['id']) ? $right['id'] : (isset($right['date']) ? $right['date'] : '');
        return strcmp((string) $a, (string) $b);
    });
    $recent = array_slice($wellness, -14);
    return array(
        'count' => count($wellness),
        'avgSleep' => coach_wellness_average($recent, array('sleep_secs', 'sleep_time', 'sleep', 'total_sleep_hours')),
        'avgRestingHR' => coach_wellness_average($recent, array('restingHR', 'resting_hr', 'resting_heartrate')),
        'avgHRV' => coach_wellness_average($recent, array('hrv', 'hrv_rmssd', 'avg_hrv')),
        'last' => count($recent) ? $recent[count($recent) - 1] : null,
    );
}

function coach_date_range($config, $nowTimestamp)
{
    $oldest = isset($config['oldest_date']) && $config['oldest_date'] ? (string) $config['oldest_date'] : '2026-06-01';
    $newest = isset($config['newest_date']) && $config['newest_date'] ? (string) $config['newest_date'] : coach_iso_date(strtotime('+7 days', $nowTimestamp));
    $days = isset($config['wellness_days']) ? max(1, (int) $config['wellness_days']) : 120;
    return array(
        'oldest' => $oldest,
        'newest' => $newest,
        'wellnessOldest' => coach_iso_date(strtotime('-' . $days . ' days', $nowTimestamp)),
        'wellnessNewest' => coach_iso_date(strtotime('+1 day', $nowTimestamp)),
    );
}

function coach_compute_snapshot($activities, $events, $wellness, $config, $nowTimestamp)
{
    usort($activities, function ($left, $right) {
        return strcmp(coach_activity_date($right), coach_activity_date($left));
    });
    return array(
        'syncedAt' => gmdate('Y-m-d\TH:i:s.000\Z', $nowTimestamp),
        'range' => coach_date_range($config, $nowTimestamp),
        'totals' => coach_summarize_activities($activities),
        'last7' => coach_summarize_activities(coach_filter_since($activities, 7, $nowTimestamp)),
        'last14' => coach_summarize_activities(coach_filter_since($activities, 14, $nowTimestamp)),
        'last30' => coach_summarize_activities(coach_filter_since($activities, 30, $nowTimestamp)),
        'wellness' => coach_summarize_wellness($wellness),
        'activities' => array_map('coach_map_activity', $activities),
        'events' => array_map('coach_map_event', $events),
        'eventsCount' => count($events),
    );
}

function coach_intervals_get($path, $config)
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('Intervals.icu is temporarily unavailable.');
    }
    $key = isset($config['intervals_api_key']) ? trim((string) $config['intervals_api_key']) : '';
    if ($key === '' || $key === 'WKLEJ_KLUCZ_TUTAJ') {
        throw new RuntimeException('Intervals API key is missing.');
    }
    $handle = curl_init(coach_intervals_api_base() . $path);
    curl_setopt($handle, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($handle, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($handle, CURLOPT_TIMEOUT, 45);
    curl_setopt($handle, CURLOPT_HTTPHEADER, array('Accept: application/json'));
    curl_setopt($handle, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    curl_setopt($handle, CURLOPT_USERPWD, 'API_KEY:' . $key);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $failed = $body === false || $status < 200 || $status >= 300;
    curl_close($handle);
    if ($failed) {
        throw new RuntimeException('Intervals.icu is temporarily unavailable.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Intervals.icu is temporarily unavailable.');
    }
    return $decoded;
}

function coach_fetch_snapshot($config, $fetcher, $nowTimestamp)
{
    $range = coach_date_range($config, $nowTimestamp);
    if ($fetcher === null) {
        $fetcher = function ($path) use ($config) {
            return coach_intervals_get($path, $config);
        };
    }
    $activities = call_user_func($fetcher, '/athlete/0/activities?oldest=' . rawurlencode($range['oldest']) . '&newest=' . rawurlencode($range['newest']));
    $events = call_user_func($fetcher, '/athlete/0/events?oldest=' . rawurlencode($range['oldest']) . '&newest=' . rawurlencode($range['newest']));
    try {
        $wellness = call_user_func($fetcher, '/athlete/0/wellness?oldest=' . rawurlencode($range['wellnessOldest']) . '&newest=' . rawurlencode($range['wellnessNewest']));
    } catch (Exception $ignored) {
        $wellness = array();
    }
    $snapshot = coach_compute_snapshot(is_array($activities) ? $activities : array(), is_array($events) ? $events : array(), is_array($wellness) ? $wellness : array(), $config, $nowTimestamp);
    coach_write_cache($snapshot);
    return $snapshot;
}

function coach_read_cache()
{
    $path = coach_cache_path();
    if (!is_file($path)) {
        return null;
    }
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return null;
    }
    if (!flock($handle, LOCK_SH)) {
        fclose($handle);
        return null;
    }
    $json = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    $data = json_decode($json, true);
    return is_array($data) ? $data : null;
}

function coach_write_cache($snapshot)
{
    $path = coach_cache_path();
    $directory = dirname($path);
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Cache is unavailable.');
    }
    $lock = @fopen($path . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        throw new RuntimeException('Cache is unavailable.');
    }
    $temporary = @tempnam($directory, 'latest-');
    $json = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $ok = $temporary !== false && $json !== false && @file_put_contents($temporary, $json, LOCK_EX) !== false;
    if ($ok) {
        @chmod($temporary, 0600);
        $ok = @rename($temporary, $path);
    }
    if (!$ok && is_string($temporary) && is_file($temporary)) {
        @unlink($temporary);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    if (!$ok) {
        throw new RuntimeException('Cache is unavailable.');
    }
}

function coach_cache_is_fresh($snapshot, $ttl, $nowTimestamp)
{
    if (!is_array($snapshot) || empty($snapshot['syncedAt'])) {
        return false;
    }
    $time = strtotime($snapshot['syncedAt']);
    return $time !== false && ($nowTimestamp - $time) <= $ttl;
}

function coach_sync_result($config, $force, $fetcher, $nowTimestamp)
{
    $cache = coach_read_cache();
    $ttl = isset($config['cache_ttl_seconds']) ? max(0, (int) $config['cache_ttl_seconds']) : 7200;
    if (!$force && coach_cache_is_fresh($cache, $ttl, $nowTimestamp)) {
        return array('ok' => true, 'source' => 'cache', 'snapshot' => $cache);
    }
    try {
        $snapshot = coach_fetch_snapshot($config, $fetcher, $nowTimestamp);
        return array('ok' => true, 'source' => 'live', 'snapshot' => $snapshot);
    } catch (Exception $error) {
        if (is_array($cache)) {
            return array('ok' => true, 'source' => 'stale-cache', 'stale' => true, 'snapshot' => $cache);
        }
        throw $error;
    }
}
