# NEXTREP 1.0 — rejestr decyzji

Wersja 1 · 11.10.2026 · gałąź `release/1.0`

Rejestr zbiera decyzje 1.0: podjęte (z datą i źródłem) i otwarte. Decyzja jest „podjęta” tylko wtedy,
gdy padła wprost od Ciebie. Rekomendacja w dokumencie nie jest decyzją. Ten plik zastępuje sekcję F
„Decyzje do podjęcia” w `NEXTREP_1_0_MASTER_PLAN.md` (wersja 1).

## 1. Decyzje po audycie MASTER PLAN (11.10.2026)

| # | Decyzja | Skutek w dokumentach | Status |
| --- | --- | --- | --- |
| F-0 | `NEXTREP_1_0_MASTER_PLAN.md` przyjęty jako baza planowania, z zastrzeżeniem uzupełnienia decyzji i specyfikacji | MASTER PLAN v2 | przyjęta |
| F-1 | 4A.10 odtworzyć jako trzy obszary („Moje dane”, „Przenoszenie danych”, „Kopie i odzyskiwanie”), z zasadami bezpieczeństwa starego systemu; w v2 automatyczna synchronizacja i łączenie po UUID; „Zapisz dane w chmurze” usuwane dopiero po bezpiecznym zastąpieniu | `SPEC_4A10_MOJE_DANE.md` (pytania P1–P6 otwarte) | przyjęta |
| F-2 | Google Stitch — projektowanie ekranów; `DESIGN.md` — zasady wizualne; Claude — implementacja. Najpierw wskazać konflikt z §17, bez zmiany wartości Design Systemu | `docs/design/decisions/2026-10-11-design-tool-google-stitch.md` (konflikty K1–K8, zmiany tekstu do akceptacji). Zastępuje kierunek z §17 (10.10) | przyjęta; zmiany tekstu otwarte |
| F-3 | Reporting Engine szerszy niż PE-F i PE-G: progresja, regresja, objętość, rekordy, trendy, stagnacja, realizacja planu, rekomendacje; mapa zależności z PE bez zgadywania statusu | `REPORTING_ENGINE_MAP.md` (pytania RE-1–RE-6 otwarte) | przyjęta |
| F-4 | Monitoring Androida: Crashlytics, pod warunkiem potwierdzenia zgodności ze stosem Capacitor; propozycja monitoringu synchronizacji | MASTER PLAN §2.11 (weryfikacja zgodności i propozycja) | przyjęta warunkowo; warunek: test na buildzie (sekcja 3) |
| F-5 | Kod 4A.4 / F-5 usuwany w 1.0; SQL F-5 nie trafia na produkcję; wymagane zachowania gościa i konta przez model v2 | MASTER PLAN §2.2, §3; SPEC 4A.10 §4.1 | przyjęta |
| F-6 | Nie zmieniać teraz `main`; błąd przecinka do osobnego rejestru ryzyk starej produkcji | `LEGACY_PRODUCTION_RISKS.md` (L01–L10) | przyjęta |
| F-7 | Decyzje wymagające kosztów lub wyborów biznesowych pozostają otwarte; nie zakładać ich zatwierdzenia | sekcja 2 (O-01–O-10) | przyjęta |
| F-8 | `app.nextrep` jest kandydatem na identyfikator pakietu; zweryfikować przed zatwierdzeniem | sekcja 4 | kandydat; weryfikacja częściowa |
| F-9 | PRO+ po premierze i starcie marketingu; próg użytkowników z rzeczywistych danych | MASTER PLAN sekcja E | przyjęta; próg otwarty (O-19) |
| F-10 | Brak zgody na płatny projekt `nextrep-dev` | MASTER PLAN sekcja C (F2.4 tylko lokalnie), O-13 | przyjęta |

## 2. Decyzje otwarte

| # | Decyzja | Rodzaj | Blokuje | Uwagi |
| --- | --- | --- | --- | --- |
| O-01 | STORE FIRST D1: konto Google Play — osobiste (test 12 testerów przez 14 dni) czy organizacji (D-U-N-S) | biznes / koszt | F7, harmonogram testu zamkniętego | |
| O-02 | STORE FIRST D2: ceny i produkty PRO | biznes | F5 | ceny w UI starej wersji nie są decyzją 1.0 |
| O-03 | STORE FIRST D3: reklamy (AdMob + zgoda UMP) czy brak reklam | biznes | F5, Data safety | |
| O-04 | STORE FIRST D4: czy PRO wymaga konta | biznes | F3, F5 | w MASTER PLAN v1 opisane jako rekomendacja; brak potwierdzenia |
| O-05 | STORE FIRST D6: plan Supabase dla produkcji 1.0 | koszt | F6, kopie bazy (SPEC 4A.10 §7 pkt 5) | |
| O-06 | STORE FIRST D7: domena | koszt | e-mail z domeny (OTP), strona WWW, polityka prywatności; wpływa na O-11 | |
| O-07 | STORE FIRST D8: plan Vercel | koszt | F6 | |
| O-08 | STORE FIRST D9: termin i sposób wyłączenia starej wersji | biznes | D.3 MASTER PLAN | dotyczy `LEGACY_PRODUCTION_RISKS.md` |
| O-09 | STORE FIRST D10: panel administratora w aplikacji Android | produkt | F3 | |
| O-10 | STORE FIRST D11: magazyn lokalny (IndexedDB) | technika | F3, SPEC 4A.10 §5.1 | rekomendacja STORE FIRST: IndexedDB |
| O-11 | Ostateczny identyfikator pakietu (kandydat `app.nextrep`) | stała na zawsze | Firebase, RevenueCat, Play Console, F7.0 | sekcja 4 |
| O-12 | Nazwa w sklepie i znak „NextRep” wobec istniejących aplikacji o tej nazwie | biznes / prawo | karta sklepu, marketing | sekcja 4, pkt 4 |
| O-13 | Backend testowy dla F3 i toru wewnętrznego bez `nextrep-dev`: lokalny Supabase (CLI / Docker w CI, bez kosztu), wolne miejsce po usunięciu `nextrep-f5-test` (wymaga zgody) albo projekt płatny (wymaga zgody kosztowej) | koszt / technika | F3 (testy E2E na prawdziwym backendzie), D.1 | F2.4 może iść lokalnie (PGlite) bez tej decyzji |
| O-14 | Projekt Firebase dla Crashlytics (plan bezpłatny, ale to nowy zasób) i test zgodności na buildzie | zasób | F6 | sekcja 3 |
| O-15 | Monitoring błędów wersji web (Crashlytics nie obejmuje przeglądarki): brak / własny zapis błędów w Supabase / Sentry tylko dla web | technika / prywatność | F6 | MASTER PLAN §2.11 |
| O-16 | Analityka produktowa: narzędzie i zakres zgód | prywatność | F6, Data safety | |
| O-17 | 4A.10: pytania P1–P5 (kosz, tryby „zastąp”, opróżnianie gościa, retencja, „Zachowaj obie”) | produkt | F3 | `SPEC_4A10_MOJE_DANE.md` §9 |
| O-18 | Logowanie offline: „gość + komunikat” (decyzja z rozmów) czy „zapisana sesja otwiera przestrzeń konta” (STORE FIRST, 4A.6) | produkt | F3 | SPEC 4A.10 P6; ryzyko L07 |
| O-19 | Próg użytkowników do startu PRO+ | biznes | sekcja E | z danych po publikacji (F-9) |
| O-20 | Reporting Engine: RE-1–RE-6 (eksport raportu, raport tygodniowy, realizacja planu na poziomie planu, wykresy FREE, „Progres %”, etykiety statusów) | produkt | PE-F, PE-G | `REPORTING_ENGINE_MAP.md` §5 |
| O-21 | Design: zmiany tekstu 1–6 (oznaczenie §17 jako zastąpionego, `STITCH.md` a krój Barlow Condensed, `DESIGN_STATUS.md`, przeniesienie `DESIGN.md` z `main` do `release/1.0`, zrzuty wzorcowe) | dokumentacja | D1 | decyzja projektowa z 11.10 |

## 3. F-4: zgodność Crashlytics ze stosem Capacitor (stan weryfikacji)

| Sprawdzenie | Wynik | Źródło |
| --- | --- | --- |
| Wtyczka | `@capacitor-firebase/crashlytics` 8.5.2 (Capawesome, wtyczka nieoficjalna, aktywnie wspierana) | rejestr npm, 11.10.2026 |
| Wymagana wersja Capacitor | `@capacitor/core >= 8.0.0`; linia 8.x = „Active support” | rejestr npm, README wtyczki |
| Nasz stos | `@capacitor/core` 8.5.3, `@capacitor/android` 8.5.3 | `package.json` |
| Zgodność deklarowana | **tak** | — |
| Zgodność potwierdzona buildem | **nie** — wymaga projektu Firebase i pliku `google-services.json` (O-14) | — |
| Zakres | tylko Android i iOS; wszystkie metody „Only available for Android and iOS” | README wtyczki |
| Awarie natywne | automatycznie | README |
| Błędy JavaScript w WebView | **nie automatycznie**: potrzebne globalne `window.onerror` i `unhandledrejection` → `recordException` ze stosem ze `stacktrace.js`; dziś aplikacja nie ma globalnej obsługi błędów | README, `grep` w `src/` |
| Czytelność stosów JS | bundel jest minifikowany bez map źródeł (`tools/build-web.mjs`: `minify: true`, `sourcemap: false`); stosy JS w Crashlytics będą trudne do odczytania bez osobnego rozwiązania | kod |
| Prywatność | `setEnabled` pozwala sterować zbieraniem; Data safety: dane o awariach i identyfikator instalacji | README |

Warunek przyjęcia F-4: spike na osobnej gałęzi (po Twojej zgodzie i po O-14) — build APK z wtyczką,
awaria testowa i błąd JS widoczne w konsoli Firebase, bez danych treningowych i osobowych.

## 4. F-8: weryfikacja identyfikatora `app.nextrep`

| # | Sprawdzenie | Wynik |
| --- | --- | --- |
| 1 | Format nazwy pakietu Androida (segmenty od litery, małe litery, bez słów zastrzeżonych Javy) | ✅ poprawny |
| 2 | Czy identyfikator jest wolny w Google Play | ⚠ nie sprawdzono: strona `play.google.com/store/apps/details?id=app.nextrep` jest niedostępna z tego środowiska. Ostatecznie potwierdza to dopiero utworzenie aplikacji w Play Console (O-01) |
| 3 | Zgodność z domeną (konwencja: odwrócona domena, którą posiadasz — `app.nextrep` ↔ `nextrep.app`) | ⚠ nie sprawdzono (zapytanie RDAP zablokowane w tym środowisku); domena to decyzja O-06. Jeśli wybierzesz inną domenę (np. `nextrep.pl`), spójniejszy będzie `pl.nextrep` |
| 4 | Inne aplikacje o nazwie „NextRep” | ⚠ istnieją: w Google Play m.in. „NextRep” (`com.thomassalisbury265.nextrep`) i „NextRep: AI Workout Planner” (`com.appstackx.fitness.nextrep`); w App Store m.in. „NextRep”, „NextRep Pro”, „NextRep AI”, „NextRep Challenge”. Nie blokuje to identyfikatora pakietu, ale dotyczy nazwy w sklepie i marki (O-12) |
| 5 | Zależności | identyfikator wiąże Firebase (Crashlytics), RevenueCat, Play Console i podpis; zmiana po pierwszym wydaniu = nowa aplikacja |
| 6 | Wpływ na dane | zmiana z `app.nextrep.spike` to nowa instalacja z pustymi danymi — zgodne z czystym startem 1.0 |

Wniosek: `app.nextrep` jest poprawnym kandydatem. Przed zatwierdzeniem potrzebne: decyzja o domenie
(O-06), sprawdzenie dostępności w Play Console (O-01) i decyzja o nazwie w sklepie (O-12).

## 5. Wcześniejsze decyzje 1.0 (indeks)

| Obszar | Decyzje | Gdzie zapisane |
| --- | --- | --- |
| STORE FIRST | strategia: Android najpierw, czysty start danych, bez migracji starych danych | dokument projektu „NEXTREP 1.0 STORE FIRST” (10.10) |
| S1 | Capacitor 8, APK debug z CI | MASTER PLAN §2.1 |
| F1 | modularizacja bez zmiany zachowania (8/8) | dokument „F1: raport końcowy i plan PE-A” |
| Progress Engine | D1–D14 (10.10), PE-01–PE-32 jako kryteria odbioru | „Progress Engine 2.0: audyt i specyfikacja” |
| PE-A | P1–P4 (w tym uniwersalny silnik bez ręcznego przeglądu 68 ćwiczeń); A4.5 z pełną równoważnością; kolejność A4.5 → F2 → A5 | dokumenty F1 / A4.5 |
| F2 | F2-1 (zastąpione), F2-2 (bez projektu i kosztów), F2-3 (A5 na końcu F3 z osobną bramką), F2-4 (snapshot obowiązkowy, brak = usterka z ostrzeżeniem), F2-5 (jawna korekta z historią) | „F2: projekt struktury atlasu” v2 |
| Atlas | treść wyłącznie z zatwierdzonych partii „Standaryzacji ćwiczeń NextRep”; K2 (pola techniczne proponuję per partia), K3 (warianty z własnym id), K4 (wiele mięśni głównych z różnych grup); walidator v2 pkt 1–5 | `docs/atlas/README.md`, dokument F2 |
