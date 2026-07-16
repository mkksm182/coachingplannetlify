# Oslo → Poznań Coach Center PRO GARMIN STRUCTURED

## Hosting cPanel

Docelowa paczka działa bez Node.js i bez zależności frontendu od Netlify Functions. Frontend korzysta z `/api/intervals-sync.php`, a klucz Intervals pozostaje poza `public_html`.

Instrukcja wdrożenia: [`cpanel/docs/CPANEL_DEPLOYMENT.md`](cpanel/docs/CPANEL_DEPLOYMENT.md).

```bash
npm run build:cpanel
```

Polecenie tworzy `dist/cpanel-coach/` oraz `dist/coach-michalikstudio-cpanel.zip` bez sekretów, backupów i plików developerskich.

Otwórz `index.html` albo wrzuć cały folder na hosting.

Nowość w tej wersji: zakładka Garmin generuje nie tylko kalendarz, ale szczegółowe structured workouts dla Intervals.icu/Garmin.

Pliki Garmin są w folderze `garmin/`:

- `intervals_payload.json` — główny plik do API Intervals.icu.
- `plan_intervals.ics` — structured calendar.
- `workout_texts/` — każdy trening jako osobny tekst do Workout Builder.
