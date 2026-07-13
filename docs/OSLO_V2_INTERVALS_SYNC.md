# Bezpieczna synchronizacja Oslo V2 z Intervals.icu

Skrypt `scripts/sync-oslo-v2-to-intervals.mjs` synchronizuje wyłącznie zakres 2026-07-15–2026-09-12. Domyślnie działa jako DRY RUN i nie zmienia Intervals.icu.

## 1. Podgląd zmian

Ustaw klucz tylko w bieżącej sesji terminala, bez zapisywania go w repozytorium:

```bash
export INTERVALS_API_KEY='...'
npm run intervals:oslo-v2:dry-run
```

Skrypt pobiera wydarzenia kalendarza, a następnie pokazuje osobne listy: usunięcie, aktualizacja, dodanie i brak zmian. Do autoryzacji używa konta własnego (`athlete/0`). Innego sportowca można wskazać przez `--athlete`.

Offline można porównać plan z zapisanym eksportem wydarzeń:

```bash
node scripts/sync-oslo-v2-to-intervals.mjs --events-file /ścieżka/events.json
```

Tryb offline nigdy nie zezwala na `--apply`.

## 2. Co może zostać usunięte

Usuwane są wyłącznie wydarzenia w podanym zakresie, których `external_id` zaczyna się od `opcoach-` albo `opcoach-safe-`. Są to identyfikatory starego eksportu projektu. Skrypt nie usuwa aktywności, wydarzeń sprzed 15.07, Fazy 2, ręcznych wydarzeń bez identyfikatora projektu ani rekordów innej aplikacji.

Nowe rekordy mają stabilny prefiks `cc-v2-oslo-2026-`. Upload używa endpointu bulk z `upsert=true`, dlatego ponowne uruchomienie aktualizuje istniejące rekordy zamiast tworzyć duplikaty.

## 3. Wykonanie po akceptacji DRY RUN

Najpierw zapisz wynik podglądu. Dopiero po sprawdzeniu każdej pozycji uruchom:

```bash
INTERVALS_API_KEY='...' node scripts/sync-oslo-v2-to-intervals.mjs --apply
```

Flaga `--apply` jest obowiązkowa. Bez niej nie jest wykonywany żaden zapis ani usunięcie.

## 4. Weryfikacja

1. Otwórz kalendarz Intervals.icu i ustaw zakres 15.07–12.09.2026.
2. Sprawdź 18.07 (12 km), 15.08 (18–20 km), 22.08 (22–24 km) i decyzję 02.09.
3. Sprawdź, że środowe rowery mają etykietę ALT, przed 10.08 nie ma piątego biegu, a basen nie jest obowiązkowy.
4. Ponownie uruchom DRY RUN. Oczekiwany wynik po poprawnej synchronizacji: 0 usunięć, 0 aktualizacji, 0 dodań; wszystkie rekordy w „Bez zmian”.
5. Sprawdź, że wykonane aktywności i wydarzenia poza zakresem pozostały nietknięte.

## 5. Cofnięcie

Przed `--apply` wyeksportuj kalendarz lub zachowaj JSON pobranych wydarzeń. Aby cofnąć operację:

1. usuń wyłącznie wydarzenia z `external_id` zaczynającym się od `cc-v2-oslo-2026-` w zakresie 15.07–12.09;
2. wgraj zachowany eksport starych wydarzeń przez Intervals.icu;
3. uruchom DRY RUN i zweryfikuj wynik.

Nie używaj cofania do aktywności wykonanych ani wydarzeń ręcznych.
