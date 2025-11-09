# Dokument wymagań produktu (PRD) - 10x-cards

## 1. Przegląd produktu

1.1 Cel produktu

- Zminimalizowanie czasu potrzebnego na tworzenie wysokiej jakości fiszek edukacyjnych poprzez automatyczne generowanie z wklejonego tekstu oraz prostą edycję przed publikacją.

  1.2 Grupa docelowa

- Studenci uczelni wyższych przygotowujący się do egzaminów i zaliczeń.

  1.3 Propozycja wartości

- Szybkie tworzenie kart z dowolnego tekstu (kopiuj-wklej) z minimalnymi poprawkami.
- Prosty, mobilny interfejs do przeglądania, edycji i nauki kart.
- Stabilny, przewidywalny przebieg sesji nauki (wszystkie karty raz, losowo, bez ocen w MVP).

  1.4 Zakres MVP (skrót)

- Generowanie fiszek przez AI z tekstu wejściowego do 10 000 znaków, z limitem 20 kart w talii.
- Edycja i usuwanie kart w stanie Draft; publikacja batch „all-or-nothing”.
- Prosty system kont (Supabase e-mail/hasło), przechowywanie talii, kart i źródła generacji.
- Tryb nauki wszystkich kart talii w losowej kolejności, flow: pytanie → odpowiedź → „Pomiń”/„Następna”.

  1.5 Platforma i technologia

- Aplikacja web (mobile-first, responsywna na desktop).
- Supabase: uwierzytelnianie e-mail/hasło, baza danych, przechowywanie danych.
- Jeden model LLM w MVP (bez fallbacków).

  1.6 Harmonogram i zasoby

- Solo-dev, 14–28 godzin (1–2 h/dzień przez ~2 tygodnie).

## 2. Problem użytkownika

2.1 Główne bolączki

- Ręczne tworzenie dużych zestawów fiszek jest czasochłonne i zniechęcające, co obniża częstotliwość powtórek.
- Brak prostego, szybkiego narzędzia do przejścia od materiału źródłowego (notatki, skrypty) do gotowej talii kart.
- Rozbudowane aplikacje do fiszek wymagają złożonej konfiguracji (algorytmy powtórek, importy), co wydłuża czas startu.

  2.2 Kontekst użycia

- Student posiada materiał źródłowy (np. notatki), wkleja go do aplikacji i w kilka minut uzyskuje poprawne fiszki.
- Przed nauką wykonuje szybkie korekty w Draft (skraca treści, usuwa słabe pytania) i publikuje całą partię.
- Uczy się w krótkich sesjach, przechodząc raz przez wszystkie karty w losowej kolejności.

## 3. Wymagania funkcjonalne

3.1 Uwierzytelnianie i bezpieczny dostęp

- Rejestracja i logowanie przy użyciu e-mail/hasła (Supabase).
- Wylogowanie i ochrona zasobów: dostęp do talii/kart wyłącznie po zalogowaniu; dane izolowane per użytkownik.
- Sesja użytkownika utrzymywana po odświeżeniu; po wygaśnięciu sesji wymuszone ponowne logowanie.
- Komunikaty błędów generyczne (bez wycieków technicznych szczegółów).

  3.2 Talie i organizacja

- Talia posiada: deck_id (stałe), nazwę unikalną per użytkownik, slug w URL aktualizowany po zmianie nazwy.
- Statusy talii: draft, published, deleted_at (soft delete z timestampem).
- Zmiana nazwy talii aktualizuje slug; unikalność nazwy wymuszana przy tworzeniu i zmianie nazwy.

  3.3 Generowanie fiszek przez AI

- Wejście: wklejony tekst do 10 000 znaków; nadmiar blokowany walidacją (client i server).
- Reguły prompta: wstrzyknięte limity (20 kart/talia, 200 znaków/strona, 5 min na generację) oraz format Q/A.
- Wyjście: do 20 fiszek (front/back); jeśli model zwróci >20, system przycina do pierwszych 20 z jasnym oznaczeniem w UI.
- Limit czasu generacji: 5 minut; po przekroczeniu twardy timeout i komunikat z możliwością ponowienia.
- Jeden równoległy proces generacji na użytkownika; kolejne żądania generacji odrzucane z komunikatem, dopóki trwa bieżąca.
- Sanityzacja: usuwanie zbędnych spacji/HTML przed wysyłką do LLM; zapis sanitized_source_text.
- Zapis generation_session powiązanej z talią (timestamp, sanitized_source_text, parametry, status powodzenia).

  3.4 Zarządzanie fiszkami (Draft)

- Podgląd listy wygenerowanych kart (front/back); oznaczenie przekroczeń limitu 200 znaków.
- Edycja front/back pojedynczej karty; walidacja 200 znaków na stronę (client i server).
- Usuwanie pojedynczej karty z Draft.
- Dodanie nowej karty ręcznie w Draft (minimalna forma manualnego tworzenia bez osobnego widoku).

  3.5 Publikacja talii

- Tryb batch „all-or-nothing”: publikacja możliwa tylko, jeśli wszystkie karty spełniają limity i walidacje.
- Po publikacji karty są tylko do odczytu (brak edycji/usuwania pojedynczych kart w MVP); dopuszczalne usunięcie całej talii (soft delete).

  3.6 Tryb nauki

- Wybór talii do nauki z listy talii opublikowanych użytkownika.
- Kolejność losowa wszystkich kart; każda karta pokazana maksymalnie raz na sesję.
- Flow jednej karty: najpierw pytanie (front), po odsłonięciu odpowiedź (back), następnie akcje „Pomiń” lub „Następna”.
- Sesja kończy się po przejściu przez wszystkie karty; brak ocen 1–3 oraz brak natychmiastowych powtórek w sesji w MVP.

  3.7 Usuwanie

- Soft delete talii (bez UI „Kosz” w MVP); elementy oznaczone deleted_at są niewidoczne w interfejsie.
- Opcjonalny cron do twardego usuwania poza MVP (backlog).

  3.8 Walidacje i limity treści

- Limit 200 znaków na front i 200 znaków na back; przekroczenia blokują publikację.
- Limit 20 fiszek na talię (twardy); generowanie >20 przycinane do 20.
- Limit 10 000 znaków wejścia do generatora; nadmiar blokowany.

  3.9 Interfejs użytkownika i język

- Język interfejsu: polski; treść kart może być w dowolnym języku zależnym od prompta.
- Mobile-first, responsywny na większych ekranach; proste, czytelne komunikaty o błędach (generyczne).

  3.10 Przechowywanie danych

- Supabase: tabele dla użytkowników, talii, kart, sesji generacji; atrybuty m.in. deck_id, name, slug, status, deleted_at, card.front, card.back.
- Zapis sanitized_source_text użytego do generacji; brak szyfrowania kolumn w MVP.

  3.11 Stabilność i błędy

- Brak telemetry i rate limitingów produktowych w MVP; prosta ochrona stabilności: 1 równoległa generacja na użytkownika.
- Błędy LLM i sieci: jedna próba z komunikatem błędu; retry manualnie przez użytkownika.

## 4. Granice produktu

4.1 W zakresie MVP

- Generowanie kart przez AI z wklejonego tekstu, z twardymi limitami (10k znaków, 20 kart, 200 znaków/strona, 5 min).
- Ręczne dodawanie, edycja i usuwanie kart w stanie Draft; publikacja batch „all-or-nothing”.
- Autoryzacja i przechowywanie danych w Supabase; unikalna nazwa talii per użytkownik; slug aktualizowany przy zmianie nazwy.
- Tryb nauki: wszystkie karty raz, losowo, przyciski „Pomiń” i „Następna”, koniec po wyczerpaniu kart.
- Soft delete talii bez UI „Kosz”.

  4.2 Poza zakresem MVP

- Zaawansowane algorytmy powtórek (SuperMemo/Anki) i ocenianie kart.
- Import plików wielu formatów (PDF, DOCX, itp.).
- Współdzielenie talii, publikacja/udostępnianie publiczne, współpraca.
- Integracje z zewnętrznymi platformami i aplikacje mobilne natywne.
- Telemetria, rozbudowane KPI, globalne rate-limity (poza prostym guardem 1 generacja jednocześnie).

  4.3 Założenia i decyzje MVP

- Po publikacji brak edycji/usuwania pojedynczych kart; dozwolone usunięcie całej talii (soft delete).
- Jeśli model zwróci >20 kart, system przycina do pierwszych 20 i informuje użytkownika.
- Generacja dłuższa niż 5 minut kończy się timeoutem; użytkownik może spróbować ponownie.
- Brak przekierowań ze starego slug po zmianie nazwy (URL niepubliczny w MVP).
- Brak szyfrowania kolumn i specjalnej retencji sanitized_source_text w MVP (do doprecyzowania później).
- Walidacja 200 znaków/strona blokuje publikację do czasu korekty.

  4.4 Otwarte kwestie do potwierdzenia (nie blokują implementacji MVP)

- Polityka retencji i opcjonalne szyfrowanie sanitized_source_text (na żądanie twarde usunięcie w przyszłości).
- Harmonogram twardego cleanupu (cron) dla soft-deleted w kolejnych wersjach.
- Ewentualny eksport/import JSON w przyszłości a wpływ na schemat (rezerwa identyfikatorów bez zmian w MVP).

## 5. Historyjki użytkowników

US-001
Tytuł: Rejestracja konta
Opis: Jako student chcę utworzyć konto przy użyciu e-maila i hasła, aby mieć prywatny dostęp do moich talii.
Kryteria akceptacji:

- Given brak konta, When podaję poprawny e-mail i hasło, Then konto zostaje utworzone i jestem zalogowany.
- Given istniejące konto, When spróbuję zarejestrować ten sam e-mail, Then otrzymuję generyczny komunikat o błędzie rejestracji.
- Given błąd sieci, When wysyłam formularz, Then widzę generyczny komunikat i mogę spróbować ponownie.

US-002
Tytuł: Logowanie
Opis: Jako student chcę zalogować się e-mailem i hasłem, aby uzyskać dostęp do moich danych.
Kryteria akceptacji:

- Given poprawne dane, When loguję się, Then trafiam do listy moich talii i sesja jest utrzymana.
- Given błędne dane, When loguję się, Then widzę generyczny komunikat o niepowodzeniu logowania.
- Given wygaśnięta sesja, When odświeżam stronę, Then jestem przekierowany na ekran logowania.

US-003
Tytuł: Wylogowanie
Opis: Jako student chcę móc się wylogować, aby zabezpieczyć dostęp do mojego konta.
Kryteria akceptacji:

- Given jestem zalogowany, When klikam wyloguj, Then sesja zostaje zakończona i widzę ekran logowania.

US-004
Tytuł: Ochrona zasobów
Opis: Jako system chcę ograniczyć dostęp do talii i kart wyłącznie dla ich właściciela.
Kryteria akceptacji:

- Given niezalogowany użytkownik, When wchodzi na zasób wymagający autoryzacji, Then następuje przekierowanie do logowania.
- Given zalogowany użytkownik A, When próbuje otworzyć talię użytkownika B, Then zasób nie jest dostępny (404/redirect) bez ujawniania szczegółów.

US-010
Tytuł: Utworzenie talii przez generację AI
Opis: Jako student chcę wkleić tekst i wygenerować fiszki, aby szybko zbudować talię.
Kryteria akceptacji:

- Given pole wejścia, When wklejam do 10 000 znaków i inicjuję generację, Then system rozpoczyna jedną sesję generacji powiązaną z nową talią w statusie Draft.
- Given trwająca generacja, When próbuję uruchomić kolejną, Then otrzymuję komunikat o zajętości (1 równoległa generacja na użytkownika).
- Given generacja powiedzie się, When otrzymam wynik, Then widzę do 20 kart w Draft wraz z oznaczeniami przekroczeń limitów.

US-011
Tytuł: Walidacja tekstu wejściowego generatora
Opis: Jako student chcę, aby system blokował wejście powyżej 10 000 znaków i informował mnie o limicie.
Kryteria akceptacji:

- Given >10 000 znaków, When próbuję wysłać, Then formularz nie pozwala i widzę komunikat o limicie.
- Given blisko limitu, When edytuję treść, Then UI pokazuje licznik znaków.

US-012
Tytuł: Timeout generacji
Opis: Jako student chcę jasnej informacji, gdy generacja przekroczy 5 minut, abym mógł spróbować ponownie.
Kryteria akceptacji:

- Given generacja trwa >5 min, When upłynie limit, Then system anuluje żądanie i pokazuje generyczny komunikat z opcją ponowienia.

US-013
Tytuł: Przycięcie wyników >20 kart
Opis: Jako student chcę otrzymać maksymalnie 20 kart nawet, jeśli model wygeneruje więcej.
Kryteria akceptacji:

- Given model zwróci >20 kart, When wynik dotrze, Then system zachowuje pierwsze 20 i informuje o przycięciu.

US-014
Tytuł: Zapis sesji generacji
Opis: Jako system chcę zapisać sanitized_source_text i metadane generacji powiązane z talią.
Kryteria akceptacji:

- Given rozpoczęta generacja, When zapisuję, Then powstaje rekord generation_session z sanitized_source_text, timestampem i statusem.

US-015
Tytuł: Podgląd Draft
Opis: Jako student chcę zobaczyć listę kart w Draft z informacją o przekroczeniach limitów.
Kryteria akceptacji:

- Given wynik generacji, When otwieram Draft, Then widzę wszystkie karty z oznaczeniem pól >200 znaków.

US-016
Tytuł: Edycja karty w Draft
Opis: Jako student chcę edytować front/back karty w Draft, aby poprawić jakość.
Kryteria akceptacji:

- Given karta w Draft, When edytuję front/back do 200 znaków, Then zmiany zapisują się i walidacja przechodzi.
- Given przekroczony limit, When próbuję zapisać, Then zapis blokowany z komunikatem.

US-017
Tytuł: Usuwanie karty w Draft
Opis: Jako student chcę usunąć pojedynczą kartę w Draft, aby odrzucić słabe pytanie.
Kryteria akceptacji:

- Given karta w Draft, When usuwam ją, Then znika z listy Draft.

US-018
Tytuł: Dodawanie karty w Draft (manualnie)
Opis: Jako student chcę dodać nową kartę ręcznie w Draft bez osobnego widoku.
Kryteria akceptacji:

- Given Draft, When dodaję kartę z front/back ≤200 znaków, Then karta pojawia się na liście Draft i przechodzi walidacje.

US-019
Tytuł: Publikacja talii (batch all-or-nothing)
Opis: Jako student chcę opublikować całą talię naraz, jeśli wszystkie karty spełniają kryteria.
Kryteria akceptacji:

- Given wszystkie karty spełniają limity, When klikam „Opublikuj”, Then status talii zmienia się na published, karty są tylko do odczytu.
- Given przynajmniej jedna karta przekracza limit, When klikam „Opublikuj”, Then publikacja jest zablokowana z listą problemów.

US-020
Tytuł: Zmiana nazwy talii
Opis: Jako student chcę zmienić nazwę talii, aby lepiej ją opisać.
Kryteria akceptacji:

- Given unikalność nazwy per użytkownik, When zmieniam nazwę na unikalną, Then slug aktualizuje się automatycznie i pozostaje stabilne deck_id.
- Given kolizja nazwy, When zapisuję, Then otrzymuję komunikat o nieunikalnej nazwie i brak zmiany.

US-021
Tytuł: Soft delete talii
Opis: Jako student chcę usunąć całą talię, aby ukryć ją z listy bez bezpowrotnego usunięcia.
Kryteria akceptacji:

- Given talia istnieje, When usuwam ją, Then ustawiane jest deleted_at i talia znika z listy oraz z trybu nauki.

US-022
Tytuł: Przegląd talii opublikowanej
Opis: Jako student chcę móc przeglądać karty opublikowanej talii (read-only).
Kryteria akceptacji:

- Given talia published, When otwieram szczegóły, Then widzę listę kart bez możliwości edycji/usuwania.

US-023
Tytuł: Rozpoczęcie sesji nauki
Opis: Jako student chcę uruchomić naukę wybranej talii w losowej kolejności.
Kryteria akceptacji:

- Given talia published, When klikam „Ucz się”, Then startuje sesja z losową kolejnością wszystkich kart.

US-024
Tytuł: Przebieg pojedynczej karty w nauce
Opis: Jako student chcę widzieć pytanie, następnie odsłonić odpowiedź i przejść dalej.
Kryteria akceptacji:

- Given karta w sesji, When widzę front, Then mogę ujawnić back i wybrać „Następna” lub „Pomiń”.

US-025
Tytuł: Zakończenie sesji nauki
Opis: Jako student chcę zakończyć sesję po przejściu wszystkich kart.
Kryteria akceptacji:

- Given ostatnia karta, When wybieram „Następna” lub „Pomiń”, Then widzę ekran zakończenia sesji i mogę wrócić do talii.

US-026
Tytuł: Losowa kolejność kart
Opis: Jako student chcę, aby kolejność kart w sesji była losowa.
Kryteria akceptacji:

- Given start sesji, When uruchamiam naukę, Then kolejność kart jest permutacją talii bez powtórek w ramach sesji.

US-027
Tytuł: Widoczność po soft delete
Opis: Jako student nie chcę widzieć usuniętych talii w UI i nauce.
Kryteria akceptacji:

- Given talia ma deleted_at, When przeglądam listę, Then talia nie jest wyświetlana ani dostępna w nauce.

US-028
Tytuł: Obsługa błędów LLM/sieci
Opis: Jako student chcę zrozumiały, generyczny komunikat, gdy generacja się nie powiedzie.
Kryteria akceptacji:

- Given błąd generacji, When otrzymam niepowodzenie, Then widzę generyczny komunikat i mogę ponowić próbę.

US-029
Tytuł: Ograniczenie 200 znaków/strona
Opis: Jako student chcę, aby system wymuszał limit 200 znaków na front i back.
Kryteria akceptacji:

- Given edycja karty, When przekroczę 200 znaków, Then widzę walidację i nie mogę opublikować talii.

US-030
Tytuł: Limit 20 kart/talia
Opis: Jako student chcę, aby talia nie przekraczała 20 kart w MVP.
Kryteria akceptacji:

- Given Draft ma 20 kart, When próbuję dodać kolejną, Then UI blokuje i informuje o limicie.

US-031
Tytuł: Widok liczby znaków
Opis: Jako student chcę widzieć licznik znaków dla front/back w edycji.
Kryteria akceptacji:

- Given edycja pola, When wpisuję tekst, Then licznik pokazuje liczbę znaków vs 200.

## 6. Metryki sukcesu

6.1 Kryteria sukcesu produktu (docelowe, poza pomiarem w MVP)

- 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika (mierzony udział kart opublikowanych względem wygenerowanych — plan na kolejne wersje z telemetry).
- Użytkownicy tworzą 75% fiszek z wykorzystaniem AI (udział kart AI vs. manualne — do włączenia po dodaniu telemetry).

  6.2 Sukces operacyjny MVP (testowalny teraz)

- Użytkownik może stabilnie: zalogować się, utworzyć talię, wygenerować do 20 kart z wejścia ≤10k znaków, poprawić przekroczenia, opublikować, uruchomić pełną sesję nauki i ukończyć ją bez błędów.
- Wszystkie limity są egzekwowane: 10k znaków wejścia, 200 znaków/strona, 20 kart/talia, 5 minut na generację.
- Soft delete ukrywa talie i karty w całym UI; dane nie są widoczne w zapytaniach użytkownika.
- Unikalność nazwy talii per użytkownik egzekwowana przy tworzeniu i zmianie nazwy.

  6.3 Jakość techniczna i UX

- Czas generacji „success path” poniżej 5 minut przy typowych danych testowych.
- Brak krytycznych błędów w przepływie: logowanie → generacja → edycja Draft → publikacja → nauka.
- UI czytelne i responsywne (test ręczny na wąskim i szerokim ekranie).
