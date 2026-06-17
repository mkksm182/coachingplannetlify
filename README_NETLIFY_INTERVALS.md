# Coach Center + Intervals.icu live sync

Ta wersja ma backend Netlify Functions. Klucz API Intervals.icu NIE jest w kodzie strony i nie trafia do przeglądarki.

## 1. W Netlify ustaw zmienne środowiskowe

Netlify → Site configuration / Site settings → Environment variables → Add variable:

- `INTERVALS_API_KEY` = nowy klucz API z Intervals.icu
- `INTERVALS_OLDEST_DATE` = `2026-06-01`
- opcjonalnie `INTERVALS_WEBHOOK_SECRET` = dowolny długi losowy tekst, jeśli skonfigurujesz webhook

Po dodaniu zmiennych zrób redeploy.

## 2. Co działa automatycznie

- `/.netlify/functions/intervals-sync` — ręczna / live synchronizacja z aplikacji
- `/.netlify/functions/intervals-scheduled` — automatyczny sync 3 razy dziennie: 05:00, 13:00, 21:00 UTC
- `/.netlify/functions/intervals-webhook` — opcjonalny webhook, kiedy Intervals wyśle event o nowej aktywności

Dane są zapisywane w Netlify Blobs jako snapshot, a strona pobiera je bez ujawniania API key.

## 3. Jak sprawdzić

Po redeployu wejdź na stronę i kliknij w Dashboardzie `Synchronizuj teraz`.
Jeśli wszystko jest OK, pojawi się panel `Intervals.icu live sync` z aktywnościami, loadem, dystansem i wellness.

## 4. Ważne bezpieczeństwo

Jeśli klucz API był gdziekolwiek wklejony publicznie, wygeneruj nowy w Intervals.icu → Settings → Developer Settings.
Stary usuń/wyczyść.
