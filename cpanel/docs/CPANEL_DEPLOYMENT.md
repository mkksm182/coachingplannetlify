# Coach Center na cPanel

Docelowy adres: `https://coach.michalikstudio.com`

Document Root: `public_html/coach.michalikstudio.com`

## 1. Zbudowanie paczki

Na komputerze deweloperskim:

```bash
npm test
npm run build:cpanel
```

Gotowe pliki:

- katalog `dist/cpanel-coach/`;
- archiwum `dist/coach-michalikstudio-cpanel.zip`.

Paczka nie zawiera klucza Intervals, webhook secretu, cache, backupów, kodu Netlify ani plików źródłowych XLSX.

## 2. Utworzenie subdomeny

1. W cPanel otwórz **Domains** albo **Subdomains**.
2. Utwórz `coach.michalikstudio.com`.
3. Ustaw Document Root dokładnie na `public_html/coach.michalikstudio.com`.
4. Nie kieruj subdomeny do katalogu działającej strony PHP.
5. Włącz certyfikat SSL/AutoSSL dla subdomeny.

## 3. Wgranie przez File Manager

1. Otwórz **File Manager** i przejdź do `public_html/coach.michalikstudio.com`.
2. Jeśli katalog zawiera pliki testowe cPanel, usuń tylko pliki z tego nowego katalogu subdomeny. Nie dotykaj innych katalogów w `public_html`.
3. Wgraj `dist/coach-michalikstudio-cpanel.zip`.
4. Wybierz archiwum i kliknij **Extract** w bieżącym katalogu.
5. Sprawdź, że `index.html`, `.htaccess`, `api/`, `cron/`, `assets/` i `data/` leżą bezpośrednio w Document Root, a nie w dodatkowym podkatalogu.
6. Usuń ZIP z hostingu po poprawnym rozpakowaniu.
7. Typowe uprawnienia: katalogi `755`, pliki `644`.

## 4. Prywatny `config.php`

Plik musi znajdować się poza `public_html`:

`/home/CPANEL_USER/coach-private/config.php`

W File Manager przejdź do katalogu domowego konta, utwórz `coach-private`, a w nim `config.php`. Ustaw katalog na `700`, a plik na `600`, jeżeli hosting na to pozwala.

```php
<?php

return array(
    'intervals_api_key' => 'WKLEJ_PRAWDZIWY_KLUCZ',
    'webhook_secret' => 'WKLEJ_DLUGI_LOSOWY_SEKRET',
    'oldest_date' => '2026-06-01',
    'newest_date' => null,
    'wellness_days' => 120,
    'cache_ttl_seconds' => 7200,
    'allowed_origin' => 'https://coach.michalikstudio.com',
);
```

Sekret można wygenerować w cPanel Terminal poleceniem `openssl rand -hex 32`. Nie wpisuj klucza ani sekretu do repozytorium, JavaScriptu, HTML lub publicznego katalogu.

Cache powstanie automatycznie jako:

`/home/CPANEL_USER/coach-private/cache/latest.json`

## 5. Test po wdrożeniu

1. Otwórz `https://coach.michalikstudio.com/api/health.php`.
2. Oczekuj: `ok: true`, PHP 7.3.x, `curl: true`, `openssl: true`, `configFound: true`, `cacheWritable: true`, `hasIntervalsApiKey: true`.
3. Otwórz `https://coach.michalikstudio.com/api/intervals-sync.php?force=1` i oczekuj `ok: true`, `source: live` oraz snapshotu.
4. Odśwież bez `force`; oczekuj `source: cache`.
5. Otwórz stronę główną i sprawdź Dashboard, Kalendarz, Plan, Szczegóły wykonania oraz Rekomendację trenera.
6. Kliknij **Synchronizuj teraz** i potwierdź odświeżenie danych bez błędów konsoli.
7. Sprawdź widok mobilny przy szerokości 390 px i instalację PWA.
8. Na starej domenie wybierz **Eksportuj dane lokalne**, a na nowej **Importuj dane lokalne**. Zweryfikuj podsumowanie przed zatwierdzeniem i zachowanie RPE/notatek.

## 6. Webhook

URL: `https://coach.michalikstudio.com/api/intervals-webhook.php`

Metoda: `POST`, JSON. Sekret przekaż w nagłówku `X-Coach-Webhook-Secret`, jako `Authorization: Bearer ...` albo w polu JSON `secret`. Nagłówek jest preferowany.

## 7. Opcjonalny cron

W cPanel **Cron Jobs** najpierw sprawdź dokumentację hostingu lub polecenie `which php`, aby ustalić właściwą binarkę PHP. Przykład uruchamiany co dwie godziny:

```text
php -q /home/CPANEL_USER/public_html/coach.michalikstudio.com/cron/refresh-intervals.php
```

Skrypt zwraca kod `0` po sukcesie i `1` po bezpiecznie obsłużonym błędzie; nie wypisuje klucza.

## 8. Wycofanie

Zachowaj poprzedni ZIP aplikacji. W razie problemu podmień wyłącznie zawartość Document Root subdomeny. Prywatny `coach-private/config.php` i cache pozostaw poza katalogiem publicznym.
