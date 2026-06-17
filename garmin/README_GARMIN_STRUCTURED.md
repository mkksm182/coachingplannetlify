# Garmin detailed structured workouts

Ta wersja jest przygotowana tak, żeby treningi były **szczegółowe na zegarku**, a nie tylko jako opis w kalendarzu.

## Co jest w środku

- `plan_intervals.ics` — kalendarz dla Intervals.icu z workout builder text dla treningów.
- `intervals_payload.json` — najważniejszy plik: payload do API Intervals.icu z native workout text w polu `description`.
- `workout_texts/` — każdy trening osobno jako plik `.txt`, do ręcznego wklejenia w Workout Builder, jeśli chcesz coś sprawdzić.
- `plan_google.ics` — zwykły kalendarz, z notatkami i dniami wolnymi.

## Najpewniejsza metoda

1. W Intervals.icu połącz Garmin Connect.
2. W Settings włącz `Upload planned workouts`.
3. Użyj `intervals_payload.json` przez API Intervals.icu albo importuj `plan_intervals.ics` jako kalendarz.
4. Po synchronizacji Garmin dostaje najbliższe planowane structured workouts.

## Ważne

Dni typu `Rower długi + T2` są rozbite na dwa treningi tego samego dnia:

- rower jako `Ride`,
- bieg po rowerze jako `Run`.

Dni `Bieg + Basen` są rozbite na dwa osobne treningi:

- bieg rano,
- pływanie wieczorem.

To zwiększa szansę, że Garmin pokaże prawidłowy sport i kroki treningu na zegarku.

## Liczby

- Wszystkie wydarzenia: 562
- Workouty do Intervals/Garmin: 465
- Notatki/dni wolne: 97
