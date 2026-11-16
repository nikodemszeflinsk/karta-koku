"""Starter Academy content (level: advanced cook) written by Claude.

General culinary / food-science knowledge only — no restaurant (KOKU) recipes.
Everything is imported with status 'needs_verification' and an 'ai_draft' source,
per the owner's decision: AI drafts are reviewed before being marked confirmed.

Generate SQL:  python3 seed/academy_v1.py > seed/academy-v1.sql
"""

SOURCE_ID = "src_claude_academy_v1"
SOURCE_TITLE = "Szkic AI: pakiet startowy Akademii v1 (Claude, 2026-11-16)"
SOURCE_NOTES = "Ogólna wiedza kulinarna i technologiczna przygotowana przez Claude. Wymaga weryfikacji przed oznaczeniem jako potwierdzona. Nie zawiera receptur KOKU."

# (module_id, category_id, title, description)
MODULES = [
    ("mod_ryz_v1", "cat_ryz", "Ryż do sushi — podstawy technologii", "Skrobia, przygotowanie, zaprawa i schładzanie."),
    ("mod_nori_v1", "cat_nori", "Nori w praktyce", "Właściwości, wilgoć i przechowywanie."),
    ("mod_higiena_v1", "cat_higiena", "Bezpieczeństwo surowej ryby", "Pasożyty, mrożenie, histamina, łańcuch chłodniczy."),
    ("mod_panierki_v1", "cat_panierki", "Tempura i smażenie", "Ciasto, olej, chrupkość, typowe błędy."),
    ("mod_sosy_v1", "cat_sosy", "Sosy i emulsje w kuchni sushi", "Majonez, emulsje, redukcje na bazie sosu sojowego."),
    ("mod_jakosc_v1", "cat_jakosc", "Kontrola jakości stanowiska sushi", "Temperatury, FIFO, standard porcji, kontrola wizualna."),
]

LESSONS = []  # (id, module_id, title, body, [competency_keys])
QUESTIONS = []  # dicts


def lesson(lid, mid, title, comps, body):
    LESSONS.append((lid, mid, title, body.strip(), comps))


def q(lesson_id, cat, qtype, prompt, explanation, comps, difficulty=2, options=None):
    QUESTIONS.append(
        dict(lesson=lesson_id, cat=cat, type=qtype, prompt=prompt.strip(), explanation=explanation.strip(), comps=comps, difficulty=difficulty, options=options or [])
    )


# ---------------------------------------------------------------------------
lesson("les_ryz_v1_01", "mod_ryz_v1", "Ryż do sushi: skrobia, gotowanie, zaprawa i schładzanie", ["ac_raw_materials", "ac_technology", "ac_processes"], """
Po co to wiedzieć
Ryż to ponad połowa masy większości rolek. Jeśli jest za twardy, za klejący, za kwaśny albo za zimny, nie uratuje go najlepsza ryba. Kucharz, który rozumie, co dzieje się ze skrobią, potrafi poprawić ryż w trakcie zmiany, zamiast tylko „robić jak zawsze”.

Skrobia: amyloza i amylopektyna
Skrobia w ziarnie ryżu składa się z dwóch rodzajów cząsteczek. Amyloza ma budowę prostą (liniową), amylopektyna — silnie rozgałęzioną. Ryż japoński krótkoziarnisty (japonica) ma dużo amylopektyny i stosunkowo mało amylozy, dlatego po ugotowaniu ziarna się kleją, ale zachowują kształt. Ryż długoziarnisty z większą zawartością amylozy jest sypki i do sushi się nie nadaje.

Płukanie i moczenie
Płukanie usuwa luźną skrobię z powierzchni ziaren. Bez płukania woda gotowania gęstnieje, ryż robi się papkowaty i lepi się „na zewnątrz”, zamiast tworzyć sprężyste ziarna. Moczenie (zwykle ok. 20–30 minut, zależnie od ryżu i procedury lokalu) pozwala wodzie wniknąć do środka ziarna, dzięki czemu gotuje się ono równomiernie — bez twardego rdzenia.

Gotowanie: żelatynizacja
Podczas gotowania ziarna skrobi chłoną wodę i pęcznieją — to żelatynizacja. Za mało wody albo za krótki czas dają twardy środek ziarna; za dużo wody — rozgotowane, pękające ziarna. Etap odparowania pod przykryciem (bez podnoszenia pokrywki) dokańcza proces dzięki parze.

Zaprawa (sushi-zu)
Typowa zaprawa to ocet ryżowy, cukier i sól. Ocet obniża pH i nadaje smak, cukier łagodzi kwasowość i daje połysk, sól wzmacnia smak. Proporcje są elementem standardu lokalu — trzymaj się karty receptury. Zaprawę dodaje się do gorącego ryżu, bo gorące ziarna lepiej ją wchłaniają. Ryż miesza się ruchem „tnącym” łopatką, nie ugniatając, żeby nie zgnieść ziaren.

Schładzanie i retrogradacja
Po zaprawieniu ryż studzi się (często wachlując), co odparowuje nadmiar wilgoci i nadaje połysk. W chłodzie skrobia ulega retrogradacji: cząsteczki (szczególnie amylozy) porządkują się i wypychają wodę, a ryż twardnieje i matowieje. Dlatego ryżu do sushi nie trzyma się w lodówce. Utrzymuje się go w temperaturze zbliżonej do temperatury ciała, przykrytego, i zużywa w czasie określonym procedurą lokalu (ryż zakwaszony zaprawą jest bezpieczniejszy, ale nie wolno ignorować limitów czasu).

Typowe błędy i przyczyny
- Ryż papkowaty: niedopłukany, za dużo wody, zbyt intensywne mieszanie.
- Twardy środek: brak moczenia, za mało wody, przerwane odparowanie.
- Ryż twardnieje na stanowisku: zbyt niska temperatura przechowywania (retrogradacja), wysychanie bez przykrycia.
- Ryż „mokry” i kwaśny: zaprawa dodana do chłodnego ryżu albo zbyt dużo zaprawy.
""")
q("les_ryz_v1_01", "cat_ryz", "single", "Która frakcja skrobi odpowiada głównie za kleistość ryżu japońskiego?",
  "Amylopektyna — rozgałęziona cząsteczka, której ryż japonica ma dużo; nadaje kleistość i słabo retrograduje. Amyloza (liniowa) sprzyja sypkości i twardnieniu w chłodzie.",
  ["ac_raw_materials"], 1,
  [("Amylopektyna", True), ("Amyloza", False), ("Gluten", False), ("Celuloza", False)])
q("les_ryz_v1_01", "cat_ryz", "explain_process", "Wyjaśnij, dlaczego ryż do sushi twardnieje, gdy trafi do lodówki, i dlaczego nie da się tego w pełni „cofnąć” zwykłym przemieszaniem.",
  "Retrogradacja skrobi: w niskiej temperaturze łańcuchy skrobi (zwłaszcza amylozy) porządkują się w struktury krystaliczne i wypychają wodę — ziarna twardnieją i matowieją. Proces przyspiesza w temperaturach chłodniczych. Odwrócenie wymaga ponownego podgrzania z wilgocią, a to zmienia teksturę i zaprawę; przemieszanie nie rozbija struktury. Dlatego ryż trzyma się w temperaturze zbliżonej do ciała, przykryty.",
  ["ac_processes", "ac_raw_materials"], 2)
q("les_ryz_v1_01", "cat_ryz", "error_analysis", "Nowy kucharz zgłasza, że ryż wyszedł papkowaty i klei się „z zewnątrz”, a ziarna są popękane. Wskaż najbardziej prawdopodobne przyczyny i co sprawdzisz w pierwszej kolejności.",
  "Prawdopodobne przyczyny: niedokładne płukanie (powierzchniowa skrobia zagęszcza wodę), za dużo wody, zbyt długie gotowanie lub zbyt intensywne mieszanie/ugniatanie przy zaprawianiu. Sprawdź: czy woda po płukaniu była klarowna, proporcję ryżu do wody i odmierzanie, czas gotowania, technikę mieszania (ruch tnący, nie ugniatanie).",
  ["ac_production_errors", "ac_technology"], 2)
q("les_ryz_v1_01", "cat_ryz", "fill_composition", "Wymień składniki typowej zaprawy do ryżu do sushi (sushi-zu).",
  "Ocet ryżowy, cukier, sól. Proporcje są częścią standardu lokalu.",
  ["ac_raw_materials"], 1,
  [("ocet ryżowy", True), ("cukier", True), ("sól", True)])
q("les_ryz_v1_01", "cat_ryz", "scenario", "W połowie wieczornego serwisu zauważasz, że ryż na stanowisku stał się twardy i matowy, choć był przygotowany 40 minut temu. Co robisz teraz i co zmieniasz na przyszłość?",
  "Teraz: nie używać ryżu o złej teksturze w produktach; przygotować nową porcję (lub użyć zapasowej), zgłosić straty. Diagnoza: zbyt niska temperatura przechowywania (np. przeciąg, zimny pojemnik), brak przykrycia (wysychanie) — retrogradacja i utrata wilgoci. Na przyszłość: właściwy pojemnik utrzymujący temperaturę, przykrycie wilgotną ściereczką/pokrywą, mniejsze partie gotowane częściej, kontrola czasu i temperatury zgodnie z procedurą.",
  ["ac_quality", "ac_production_errors"], 3)

# ---------------------------------------------------------------------------
lesson("les_nori_v1_01", "mod_nori_v1", "Nori: wilgoć, chrupkość i przechowywanie", ["ac_raw_materials", "ac_textures"], """
Po co to wiedzieć
Nori decyduje o pierwszym wrażeniu przy gryzieniu rolki: ma być kruche i lekko chrupiące, a nie gumowate. Najczęstszy problem — miękkie, ciągnące się nori — wynika z wilgoci, czyli z tego, jak nori jest przechowywane i jak długo czeka rolka.

Czym jest nori
Nori to arkusze z suszonych krasnorostów (czerwonych alg). Algi rozdrabnia się, formuje w cienkie arkusze i suszy, a często dodatkowo opieka. Arkusz ma stronę gładką, błyszczącą i stronę bardziej szorstką, matową. Zwyczajowo matową stronę kładzie się do ryżu (ryż lepiej się jej trzyma), a błyszcząca jest na zewnątrz — sprawdź jednak standard lokalu.

Higroskopijność
Suche nori jest silnie higroskopijne — chłonie wilgoć z powietrza i z ryżu. Gdy zawartość wody rośnie, struktura z kruchej przechodzi w elastyczną, a nori robi się gumowate i trudne do odgryzienia. Dzieje się to szybko: otwarte opakowanie w wilgotnej kuchni traci jakość w ciągu kilkudziesięciu minut. Rolka z ryżem też „nawilża” nori od środka — dlatego rolki hosomaki/futomaki najlepiej podawać szybko po zwinięciu.

Przechowywanie
- Szczelne opakowanie, najlepiej z pochłaniaczem wilgoci; zamykać od razu po pobraniu arkuszy.
- Z dala od źródeł pary (garnki z ryżem, zmywarka) i od ciepła.
- Na stanowisku trzymać tylko tyle arkuszy, ile potrzeba na najbliższy czas.
- Nie przechowywać w lodówce bez szczelnego opakowania — przy wyjmowaniu skrapla się na nim wilgoć.

Opiekanie
Krótkie opieczenie arkusza nad źródłem ciepła odparowuje wilgoć i wzmacnia aromat (reakcje zachodzące przy podgrzewaniu suchych produktów). Zbyt mocne — przypala i daje gorycz.

Typowe błędy
- Gumowate nori: wilgoć z otoczenia lub z ryżu, rolka zbyt długo czeka przed podaniem, otwarte opakowanie.
- Pękające nori przy zwijaniu: arkusz zbyt suchy/przesuszony lub za mocno napięty, ryż rozłożony zbyt grubo przy krawędzi.
- Nori odkleja się: zbyt suchy ryż przy krawędzi zamknięcia albo brak lekkiego zwilżenia krawędzi.
""")
q("les_nori_v1_01", "cat_nori", "explain_process", "Wyjaśnij, dlaczego nori w rolce robi się gumowate, jeśli rolka długo czeka na podanie.",
  "Nori jest higroskopijne: chłonie wodę z wilgotnego ryżu i z powietrza. Wzrost zawartości wody zmienia strukturę z kruchej na elastyczną (uplastycznienie), więc arkusz staje się ciągnący i trudny do odgryzienia. Im dłużej rolka czeka, tym więcej wilgoci przechodzi do nori.",
  ["ac_textures", "ac_raw_materials"], 2)
q("les_nori_v1_01", "cat_nori", "multi", "Które działania ograniczają wchłanianie wilgoci przez nori na stanowisku? Zaznacz wszystkie poprawne.",
  "Szczelne zamykanie opakowania, trzymanie z dala od pary i źródeł wilgoci oraz wyjmowanie tylko potrzebnej liczby arkuszy ograniczają wilgoć. Trzymanie otwartego opakowania przy garnku z ryżem i przechowywanie w lodówce bez szczelnego opakowania zwiększają wilgoć (para, skraplanie).",
  ["ac_quality", "ac_raw_materials"], 1,
  [("Zamykanie opakowania od razu po pobraniu arkuszy", True), ("Trzymanie arkuszy z dala od garnka z ryżem i zmywarki", True), ("Wyjmowanie tylko tylu arkuszy, ile potrzeba na najbliższy czas", True), ("Trzymanie otwartego opakowania przy ryżu, żeby było pod ręką", False), ("Przechowywanie w lodówce w otwartym opakowaniu", False)])
q("les_nori_v1_01", "cat_nori", "single", "Którą stroną nori zwykle kładzie się do ryżu?",
  "Zwyczajowo stroną matową (bardziej szorstką) — ryż lepiej się jej trzyma, a błyszcząca strona jest na zewnątrz. Standard lokalu może to doprecyzować.",
  ["ac_technology"], 1,
  [("Matową, szorstką", True), ("Błyszczącą, gładką", False), ("Nie ma to znaczenia technologicznego", False)])
q("les_nori_v1_01", "cat_nori", "error_analysis", "Przy zwijaniu futomaki nori pęka wzdłuż. Podaj możliwe przyczyny i sposób zapobiegania.",
  "Przyczyny: arkusz przesuszony/kruchy, zbyt duże napięcie przy zwijaniu, za gruba warstwa ryżu lub zbyt dużo farszu w stosunku do arkusza, ryż rozłożony aż do krawędzi bez zostawienia marginesu. Zapobieganie: odpowiednia ilość ryżu i farszu wg standardu, margines na zamknięcie, równomierny docisk, użycie arkusza we właściwej kondycji.",
  ["ac_production_errors", "ac_technology"], 2)
q("les_nori_v1_01", "cat_nori", "compare", "Porównaj nori świeżo wyjęte ze szczelnego opakowania i nori, które leżało 45 minut otwarte na stanowisku obok ryżu. Jak różnią się teksturą i dlaczego?",
  "Świeże: kruche, lekko chrupiące, łatwo się odgryza. Leżące: miękkie, elastyczne, gumowate, ciągnie się. Przyczyna: higroskopijność — chłonięcie pary wodnej z otoczenia i od ryżu; woda działa jak plastyfikator struktury arkusza.",
  ["ac_textures"], 2)

# ---------------------------------------------------------------------------
lesson("les_higiena_v1_01", "mod_higiena_v1", "Bezpieczeństwo surowej ryby: pasożyty, mrożenie, histamina", ["ac_quality", "ac_production_errors", "ac_raw_materials"], """
Po co to wiedzieć
Sushi i sashimi podaje się z ryby niepoddanej obróbce cieplnej. Oznacza to, że zabezpieczeniem przed zagrożeniami są: jakość surowca, mrożenie, temperatura i czas. To obszar, w którym błąd kucharza może zaszkodzić gościowi, dlatego obowiązują tu procedury HACCP lokalu i przepisy sanitarne — ta lekcja wyjaśnia, dlaczego istnieją.

Pasożyty (np. Anisakis)
Ryby morskie mogą zawierać larwy nicieni (m.in. z rodzaju Anisakis). Spożyte żywe larwy mogą wywołać chorobę u człowieka i reakcje alergiczne. Larw nie zabija zakwaszenie zaprawą, sos sojowy ani wasabi. Skuteczna jest obróbka cieplna albo mrożenie.

Mrożenie jako zabieg bezpieczeństwa
Przepisy UE dotyczące produktów rybołówstwa przeznaczonych do spożycia na surowo wymagają zamrożenia w temperaturze nie wyższej niż −20 °C we wszystkich częściach produktu przez co najmniej 24 godziny albo nie wyższej niż −35 °C przez co najmniej 15 godzin (z określonymi wyjątkami, np. dla części ryb hodowlanych spełniających warunki). Ważne słowa to „we wszystkich częściach” — zwykła zamrażarka, która nie osiąga tych temperatur w całym produkcie, nie spełnia wymogu. W praktyce lokal korzysta z ryby od dostawcy z odpowiednią dokumentacją albo z własnej procedury — sprawdź, jak jest u Ciebie.

Rozmrażanie
Rozmrażaj w chłodni (0–4 °C), nie w temperaturze pokojowej i nie pod ciepłą wodą. Powierzchnia ryby nie może długo przebywać w temperaturach sprzyjających namnażaniu bakterii. Rozmrożonej ryby nie zamraża się ponownie.

Histamina (zatrucie skombroidowe)
U ryb takich jak tuńczyk czy makrela bakterie mogą przekształcać aminokwas histydynę w histaminę, gdy ryba jest przechowywana w zbyt wysokiej temperaturze. Histamina jest odporna na ciepło i mrożenie — jeśli powstała, nie usunie jej ani gotowanie, ani zamrożenie. Objawy po zjedzeniu przypominają reakcję alergiczną. Zapobieganie = nieprzerwany łańcuch chłodniczy od połowu do talerza.

Temperatura i czas na stanowisku
Świeżą rybę przechowuje się możliwie blisko 0 °C (w praktyce w zakresie chłodniczym określonym przez procedurę lokalu), na stanowisku pobiera się małe porcje i oddaje resztę do chłodni. Każde wyjęcie i pozostawienie w cieple skraca bezpieczny czas.

Sygnały ostrzegawcze
Zapach amoniakalny lub kwaśny, oślizgła powierzchnia, utrata sprężystości, matowienie, przebarwienia — taka ryba nie trafia do sushi. W razie wątpliwości: odłożyć, zgłosić, nie „ratować” sosem.
""")
q("les_higiena_v1_01", "cat_higiena", "single", "Który z wymienionych zabiegów skutecznie unieszkodliwia larwy Anisakis w rybie przeznaczonej do spożycia na surowo?",
  "Odpowiednie mrożenie (np. ≤ −20 °C we wszystkich częściach przez co najmniej 24 h lub ≤ −35 °C przez co najmniej 15 h). Zaprawa octowa, sos sojowy ani wasabi nie zabijają larw.",
  ["ac_quality"], 1,
  [("Mrożenie w warunkach wymaganych przepisami", True), ("Skropienie zaprawą octową", False), ("Podanie z wasabi", False), ("Krótkie płukanie w zimnej wodzie", False)])
q("les_higiena_v1_01", "cat_higiena", "explain_process", "Dlaczego histaminy w tuńczyku nie da się usunąć przez zamrożenie ani gotowanie i co z tego wynika dla pracy na stanowisku?",
  "Histamina powstaje z histydyny pod wpływem enzymów bakterii, gdy ryba jest za ciepła. Jest substancją odporną na temperaturę — mrożenie zatrzymuje bakterie, ale nie rozkłada już powstałej histaminy, a gotowanie jej nie niszczy. Wniosek: jedyną ochroną jest nieprzerwany łańcuch chłodniczy — krótkie pobieranie z chłodni, małe porcje na stanowisku, kontrola temperatur i odrzucanie podejrzanego surowca.",
  ["ac_quality", "ac_raw_materials"], 3)
q("les_higiena_v1_01", "cat_higiena", "error_analysis", "Kucharz rozmraża łososia na blacie w temperaturze kuchni, „bo w chłodni trwa to za długo”. Oceń tę praktykę.",
  "Błąd: powierzchnia ryby długo przebywa w temperaturze sprzyjającej namnażaniu bakterii, podczas gdy środek jest jeszcze zamrożony; rośnie ryzyko mikrobiologiczne i (u niektórych gatunków) powstawania histaminy, pogarsza się tekstura i wyciek. Poprawnie: rozmrażać w chłodni (0–4 °C) z wyprzedzeniem zaplanowanym w produkcji, nie zamrażać ponownie.",
  ["ac_production_errors", "ac_quality"], 2)
q("les_higiena_v1_01", "cat_higiena", "multi", "Które sygnały powinny wykluczyć rybę z użycia do sushi? Zaznacz wszystkie poprawne.",
  "Zapach amoniakalny/kwaśny, oślizgła powierzchnia i utrata sprężystości są sygnałami zepsucia. Lekki zapach morza i jędrne mięso są cechami świeżej ryby.",
  ["ac_quality"], 1,
  [("Zapach amoniakalny lub kwaśny", True), ("Oślizgła, lepka powierzchnia", True), ("Mięso nie wraca do kształtu po naciśnięciu", True), ("Lekki, świeży zapach morza", False), ("Jędrne, sprężyste mięso", False)])
q("les_higiena_v1_01", "cat_higiena", "scenario", "Dostawa tuńczyka przyjechała, a termometr pokazuje w środku produktu temperaturę wyraźnie wyższą niż wymagana przy przyjęciu. Dostawca mówi, że „to tylko chwila w drodze”. Co robisz?",
  "Nie przyjmować towaru niezgodnego z wymaganiami temperatury (zgodnie z procedurą przyjęcia dostaw), udokumentować pomiar, zgłosić przełożonemu/osobie odpowiedzialnej i dostawcy. Uzasadnienie: przerwanie łańcucha chłodniczego u tuńczyka grozi powstaniem histaminy, której nie usuwa późniejsze schłodzenie ani mrożenie — ryzyko jest niewidoczne i nieodwracalne.",
  ["ac_quality", "ac_production_errors"], 3)

# ---------------------------------------------------------------------------
lesson("les_panierki_v1_01", "mod_panierki_v1", "Tempura: dlaczego zimne ciasto i krótkie mieszanie", ["ac_processes", "ac_textures", "ac_production_errors"], """
Po co to wiedzieć
Dobra tempura jest lekka, krucha i nie tłusta. Zła — twarda, ciężka albo nasiąknięta olejem. Różnica wynika prawie wyłącznie z kontroli glutenu, temperatury i wilgoci.

Gluten i mieszanie
Mąka pszenna zawiera białka (gliadyny i gluteniny), które po zmieszaniu z wodą i przy mieszaniu tworzą sieć glutenową. Sieć glutenowa daje ciastu elastyczność — dobrą w chlebie, złą w tempurze, bo po usmażeniu robi skorupkę twardą i ciągnącą się. Dlatego ciasto do tempury miesza się krótko, często pałeczkami, zostawiając grudki. Grudki to nie błąd — to znak, że gluten się nie rozwinął.

Zimna woda
Niska temperatura spowalnia tworzenie się glutenu i pęcznienie skrobi. Zimne ciasto w kontakcie z gorącym olejem daje też gwałtowne odparowanie wody, co tworzy lekką, porowatą strukturę. Woda gazowana dodatkowo wprowadza pęcherzyki gazu. Ciasto przygotowuje się małymi porcjami tuż przed użyciem — stojące ciasto ociepla się, a gluten zdąży się rozwinąć.

Skrobia w mieszance
Część mąki bywa zastępowana skrobią (np. ziemniaczaną lub kukurydzianą) albo stosuje się gotowe mieszanki do tempury o niskiej zawartości białka. Mniej białka = mniej glutenu = bardziej krucha skorupka.

Temperatura oleju
Typowy zakres smażenia tempury to ok. 170–180 °C (dokładne wartości podaje procedura lokalu). Za niska temperatura: woda odparowuje wolno, skorupka nie zastyga szybko, produkt nasiąka tłuszczem i jest ciężki. Za wysoka: skorupka ciemnieje, zanim środek się dogrzeje; olej szybciej się rozkłada. Zbyt duża porcja wrzucona naraz obniża temperaturę oleju — smaż partiami.

Odsączanie i podanie
Usmażone kawałki odsącza się na kratce, a nie na płasko na papierze (para od spodu rozmiękcza skorupkę). Tempura traci chrupkość z czasem, bo wilgoć z wnętrza przechodzi do skorupki — dlatego podaje się ją od razu.

Panko vs tempura
Panko to płatki z pieczywa o dużej porowatości: daje grubszą, bardzo chrupiącą warstwę. Tempura to cienkie ciasto. Do panko produkt zwykle obtacza się w mące, jajku i panko (panierowanie trzystopniowe).

Typowe błędy
- Tłusta, ciężka tempura: za zimny olej, przeładowany kosz, ciasto za gęste.
- Twarda, „gumowa” skorupka: przemieszane ciasto (rozwinięty gluten), ciasto stało zbyt długo.
- Ciasto nie trzyma się produktu: produkt mokry — osusz i oprósz mąką/skrobią.
""")
q("les_panierki_v1_01", "cat_panierki", "explain_process", "Dlaczego ciasto do tempury miesza się krótko i zostawia się w nim grudki?",
  "Krótkie mieszanie ogranicza tworzenie sieci glutenowej z białek mąki pszennej (gliadyn i glutenin). Rozwinięty gluten daje po smażeniu twardą, ciągnącą skorupkę. Grudki świadczą o niewyrobionym glutenie i sprzyjają lekkiej, nieregularnej, kruchej strukturze.",
  ["ac_processes", "ac_textures"], 2)
q("les_panierki_v1_01", "cat_panierki", "error_analysis", "Tempura wychodzi blada, ciężka i nasiąknięta olejem. Co najpewniej jest nie tak?",
  "Najczęściej za niska temperatura oleju — skorupka nie zastyga szybko, woda odparowuje powoli, olej wnika do produktu. Przyczyną bywa też przeładowanie frytownicy (spadek temperatury) lub zbyt gęste ciasto. Rozwiązanie: kontrola temperatury termometrem, smażenie mniejszymi partiami, odzyskanie temperatury między partiami.",
  ["ac_production_errors"], 2)
q("les_panierki_v1_01", "cat_panierki", "single", "Jaki jest główny powód używania bardzo zimnej wody do ciasta tempura?",
  "Zimna woda spowalnia rozwój glutenu (i pęcznienie skrobi), dzięki czemu skorupka jest krucha; dodatkowo duża różnica temperatur z olejem sprzyja gwałtownemu odparowaniu i lekkiej strukturze.",
  ["ac_processes"], 1,
  [("Spowalnia rozwój glutenu i daje kruchą skorupkę", True), ("Zmniejsza ilość wchłanianego oleju przez schłodzenie oleju", False), ("Przedłuża trwałość ciasta przez kilka godzin", False), ("Poprawia smak mąki", False)])
q("les_panierki_v1_01", "cat_panierki", "match", "Dopasuj błąd do jego najbardziej prawdopodobnej przyczyny.",
  "Nasiąknięcie olejem — za zimny olej; twarda skorupka — przemieszane ciasto (gluten); ciasto odpada od produktu — mokra powierzchnia produktu; ciemna skorupka przy surowym środku — za gorący olej.",
  ["ac_production_errors"], 2,
  [("Tempura nasiąknięta olejem", None, "za zimny olej"), ("Twarda, ciągnąca skorupka", None, "przemieszane ciasto"), ("Ciasto odpada od produktu", None, "mokra powierzchnia produktu"), ("Ciemna skorupka, niedogrzany środek", None, "za gorący olej")])
q("les_panierki_v1_01", "cat_panierki", "compare", "Porównaj panierkę panko i ciasto tempura: strukturę, sposób nakładania i efekt po usmażeniu.",
  "Panko: płatki porowatego pieczywa, nakładane zwykle po mące i jajku (panierowanie trzystopniowe); daje grubszą, bardzo chrupiącą, nieregularną warstwę. Tempura: płynne ciasto z mąki o niskiej zawartości białka/skrobi i zimnej wody, krótko mieszane; daje cienką, lekką, delikatnie chrupiącą skorupkę. Tempura szybciej traci chrupkość i wymaga natychmiastowego podania.",
  ["ac_textures", "ac_technology"], 2)

# ---------------------------------------------------------------------------
lesson("les_sosy_v1_01", "mod_sosy_v1", "Emulsje i redukcje: majonez, sosy pikantne, glazury na bazie sosu sojowego", ["ac_technology", "ac_processes", "ac_production_errors"], """
Po co to wiedzieć
Sosy kremowe i glazury są w kuchni sushi wszędzie. Znajomość dwóch mechanizmów — emulsji i redukcji — pozwala zrozumieć, dlaczego sos się rozwarstwia, dlaczego glazura jest za rzadka albo przypalona i jak to naprawić.

Emulsja: olej w wodzie
Majonez to emulsja: drobne kropelki oleju rozproszone w fazie wodnej (żółtko, ocet lub sok cytrynowy). Olej i woda same się nie mieszają — stabilność zapewnia emulgator. W żółtku jest nim przede wszystkim lecytyna, której cząsteczki mają część „lubiącą wodę” i część „lubiącą tłuszcz” i otaczają kropelki oleju. Majonez w stylu japońskim zwykle opiera się na żółtkach i occie ryżowym, co daje gęstszą, bardziej „jajeczną” konsystencję.

Dlaczego emulsja się „warzy”
- Olej dodany za szybko na początku: emulgator nie nadąża otaczać kropel.
- Za dużo oleju w stosunku do fazy wodnej i emulgatora.
- Duża różnica temperatur składników.
- W sosach gotowych: dodatek dużej ilości kwaśnych lub słonych płynów, zamrożenie, przegrzanie.
Ratunek klasyczny: nowe żółtko (albo łyżka wody/ostrego sosu z emulgatorem) i stopniowe wmiksowywanie zważonego sosu.

Sosy pikantne na bazie majonezu
Dodatek pasty chili lub sosu ostrego zmienia smak, ale też wprowadza wodę, kwas i sól. Dodawane stopniowo zwykle nie psują emulsji; wlane naraz w dużej ilości mogą ją rozrzedzić lub rozwarstwić. Stała receptura z wagą składników daje powtarzalność.

Redukcja i glazury na bazie sosu sojowego
Gęste, błyszczące glazury (np. w stylu teriyaki czy sos do węgorza) powstają przez odparowanie wody z mieszaniny sosu sojowego, cukrów i często mirinu lub sake. Gdy woda odparowuje, rośnie stężenie cukrów — sos gęstnieje i zaczyna się kleić. W wysokiej temperaturze cukry ulegają karmelizacji, a cukry z aminokwasami (sos sojowy jest ich bogaty) — reakcji Maillarda, co daje kolor i aromat. Granica między „pięknie zredukowane” a „przypalone i gorzkie” jest wąska, bo sos z dużą ilością cukru szybko się przypala.

Kontrola gęstości
Sos sprawdza się zawsze w docelowej temperaturze podania — na gorąco wydaje się rzadszy, po schłodzeniu gęstnieje. Zagęszczanie skrobią (np. skrobią ziemniaczaną lub kukurydzianą rozprowadzoną w zimnej wodzie) wymaga krótkiego zagotowania, żeby skrobia zżelatynizowała; nadmiar daje sos „kisielowy” i matowy.

Typowe błędy
- Rozwarstwiony sos kremowy: zbyt szybkie dodawanie oleju lub zbyt dużo płynnych dodatków naraz.
- Glazura gorzka: przegrzana redukcja (przypalone cukry).
- Glazura za gęsta po schłodzeniu: oceniano ją tylko na gorąco.
""")
q("les_sosy_v1_01", "cat_sosy", "explain_process", "Wyjaśnij, co utrzymuje majonez w stanie emulsji i dlaczego zbyt szybkie dodanie oleju na początku powoduje jego zwarzenie.",
  "Majonez to emulsja oleju w fazie wodnej stabilizowana emulgatorem — głównie lecytyną z żółtka, której cząsteczki otaczają kropelki oleju (część hydrofilowa do wody, lipofilowa do tłuszczu). Na początku fazy wodnej i emulgatora jest mało, więc szybko wlany olej tworzy duże krople, których emulgator nie zdąży otoczyć — krople łączą się i faza olejowa się oddziela.",
  ["ac_technology", "ac_processes"], 2)
q("les_sosy_v1_01", "cat_sosy", "single", "Który składnik żółtka jest głównym emulgatorem w majonezie?",
  "Lecytyna (fosfolipid) — ma część hydrofilową i lipofilową.",
  ["ac_raw_materials"], 1,
  [("Lecytyna", True), ("Kazeina", False), ("Gluten", False), ("Pektyna", False)])
q("les_sosy_v1_01", "cat_sosy", "error_analysis", "Glazura na bazie sosu sojowego, cukru i mirinu wyszła ciemna i gorzka. Wyjaśnij mechanizm i jak zapobiec temu w przyszłości.",
  "Przegrzanie podczas redukcji: wraz z odparowaniem wody rośnie stężenie cukrów, temperatura sosu rośnie, cukry karmelizują się i przypalają, a reakcje Maillarda zachodzą zbyt intensywnie — powstaje gorycz. Zapobieganie: mniejszy ogień pod koniec redukcji, mieszanie, kontrola gęstości (próbka schłodzona na talerzyku), stała receptura i czas.",
  ["ac_production_errors", "ac_processes"], 3)
q("les_sosy_v1_01", "cat_sosy", "scenario", "Przed serwisem okazuje się, że pikantny sos kremowy w butelce się rozwarstwił. Co robisz, żeby nie stracić całej partii, i co sprawdzasz, żeby problem się nie powtórzył?",
  "Ratunek: przenieść do miski, dodać nową bazę z emulgatorem (np. żółtko lub niewielką ilość majonezu) i stopniowo wmiksować zwarzony sos; sprawdzić smak i konsystencję. Jeśli są wątpliwości co do bezpieczeństwa (czas, temperatura) — nie ratować, wyrzucić zgodnie z procedurą. Przyczyny do sprawdzenia: zbyt szybkie dodanie płynnych dodatków (ostry sos, sok), proporcje niezgodne z recepturą, przechowywanie w zbyt zimnym/ciepłym miejscu, zbyt długie przechowywanie.",
  ["ac_production_errors", "ac_quality"], 3)
q("les_sosy_v1_01", "cat_sosy", "single", "Dlaczego gęstość glazury należy oceniać w temperaturze podania, a nie tylko na gorąco?",
  "Lepkość roztworów cukru silnie zależy od temperatury — na gorąco sos jest rzadszy, po schłodzeniu gęstnieje. Ocena tylko na gorąco prowadzi do zbyt gęstej glazury po ostygnięciu.",
  ["ac_technology"], 2,
  [("Bo po ostygnięciu sos gęstnieje — na gorąco wydaje się rzadszy", True), ("Bo na gorąco sos jest gęstszy niż po ostygnięciu", False), ("Bo temperatura nie ma wpływu, liczy się tylko czas", False)])

# ---------------------------------------------------------------------------
lesson("les_jakosc_v1_01", "mod_jakosc_v1", "Kontrola jakości stanowiska sushi: temperatura, czas, standard porcji", ["ac_quality", "ch_station", "ch_standardization"], """
Po co to wiedzieć
Gość ocenia każdą rolkę tak samo — niezależnie od tego, kto ją zrobił i o której godzinie. Powtarzalność i bezpieczeństwo nie biorą się z talentu, tylko z systemu: kontroli temperatur, rotacji, standardu porcji i kontroli wizualnej przed wydaniem.

Temperatura i czas
- Surowce wrażliwe (ryba, owoce morza, sosy na bazie jaj, produkty krojone) przechowuje się w chłodni w temperaturach określonych procedurą lokalu; na stanowisku trzyma się tylko porcję na najbliższy czas.
- Ryż do sushi ma inną temperaturę roboczą (ciepły, przykryty) i swój limit czasu — to dwa różne reżimy na jednym stanowisku.
- Pomiary temperatur urządzeń i produktów zapisuje się zgodnie z HACCP — zapis jest dowodem, że kontrola była, a nie formalnością.

FIFO i etykietowanie
FIFO (first in, first out) — najpierw zużywa się to, co zostało przygotowane lub przyjęte najwcześniej. Działa tylko wtedy, gdy każdy pojemnik ma etykietę: co to jest, kiedy przygotowano, do kiedy ważne, kto przygotował. Nowe porcje stawia się za starszymi, nie przed nimi. Pojemnik bez etykiety = produkt nieznanego pochodzenia.

Standard porcji
Karta technologiczna (receptura standardowa) określa gramaturę ryżu i składników, liczbę kawałków i sposób krojenia. Ważenie porcji ryżu i farszu daje:
- powtarzalny wygląd i smak,
- przewidywalny koszt (food cost) — kilka gramów ryby za dużo w każdej rolce to realna strata w skali miesiąca,
- łatwiejsze szkolenie nowych osób.
Waga na stanowisku i okresowa kontrola gramatur to praktyka kuchni, które trzymają standard.

Kontrola wizualna przed wydaniem
Przed podaniem sprawdzasz: równe kawałki (podobna wysokość), zamknięta rolka, ryż nie wychodzi na zewnątrz (w hosomaki/futomaki), czyste krawędzie cięcia (ostry nóż przecierany wilgotną ściereczką), właściwa kolejność i ułożenie na talerzu, czystość talerza, zgodność z zamówieniem i informacją o alergenach.

Organizacja stanowiska (mise en place)
Każdy produkt ma stałe miejsce, ułożone w kolejności pracy. Osobne deski/noże dla ryb surowych i produktów gotowych, czysta ściereczka do noża, pojemnik z wodą octową do dłoni. Stanowisko sprząta się na bieżąco, nie dopiero po serwisie.

Typowe błędy
- Brak etykiet — utrata kontroli nad datami i FIFO.
- „Na oko” zamiast wagi — rozjeżdżające się porcje i food cost.
- Zbyt duży zapas na stanowisku — produkty długo poza chłodnią.
- Tępy nóż — poszarpane krawędzie, zgniecione rolki.
""")
q("les_jakosc_v1_01", "cat_jakosc", "explain_process", "Wyjaśnij, dlaczego zasada FIFO nie działa bez etykietowania i co musi zawierać dobra etykieta.",
  "FIFO wymaga wiedzy, który produkt jest starszy; bez etykiety nie da się tego ustalić, a pojemniki mieszają się przy uzupełnianiu. Etykieta: nazwa produktu, data i godzina przygotowania/otwarcia, data/godzina przydatności (wg procedury), osoba przygotowująca. Nowe porcje stawia się za starszymi.",
  ["ac_quality", "ch_station"], 2)
q("les_jakosc_v1_01", "cat_jakosc", "scenario", "Kierownik zauważa, że ten sam produkt z karty wygląda różnie zależnie od zmiany, a koszt ryby rośnie. Jakie działania wprowadzisz jako kucharz odpowiedzialny za stanowisko?",
  "Ustandaryzować: korzystać z karty technologicznej (gramatury, liczba kawałków, sposób krojenia), ważyć porcje ryżu i ryby, przygotować zdjęcie wzorcowe produktu przy stanowisku, przeszkolić zmianę i robić wyrywkową kontrolę wag. Uzasadnić kosztem: nadwyżka kilku gramów w każdej porcji sumuje się w znaczącą stratę.",
  ["ch_standardization", "ac_quality"], 3)
q("les_jakosc_v1_01", "cat_jakosc", "multi", "Co sprawdzasz w kontroli wizualnej rolki przed wydaniem? Zaznacz wszystkie poprawne.",
  "Równe kawałki, czyste krawędzie cięcia, szczelne zamknięcie rolki i zgodność z zamówieniem/alergenami to elementy kontroli. Temperatura pomieszczenia magazynu nie jest elementem kontroli konkretnego talerza przed wydaniem.",
  ["ac_quality"], 1,
  [("Równą wysokość i wielkość kawałków", True), ("Czyste, niepostrzępione krawędzie cięcia", True), ("Szczelne zamknięcie rolki", True), ("Zgodność z zamówieniem i informacją o alergenach", True), ("Temperaturę w magazynie suchym", False)])
q("les_jakosc_v1_01", "cat_jakosc", "error_analysis", "Rolki po pokrojeniu mają poszarpane krawędzie, a ryż się zgniata. Co jest najczęstszą przyczyną i jak ją usunąć?",
  "Najczęściej tępy lub suchy, zabrudzony nóż (oraz cięcie naciskiem zamiast płynnym ruchem). Rozwiązanie: ostry nóż, przecieranie ostrza wilgotną ściereczką między cięciami, cięcie płynnym ruchem bez dociskania, właściwe zamknięcie i zagęszczenie rolki.",
  ["ac_production_errors", "ch_station"], 2)
q("les_jakosc_v1_01", "cat_jakosc", "compare", "Porównaj reżim przechowywania na stanowisku dla surowej ryby i dla ryżu do sushi. Dlaczego są różne?",
  "Ryba: jak najzimniej (zakres chłodniczy wg procedury), małe porcje na stanowisku, szybki powrót do chłodni — ograniczenie wzrostu bakterii i powstawania histaminy. Ryż: ciepły (zbliżony do temperatury ciała), przykryty, z limitem czasu — w chłodzie twardnieje (retrogradacja), a zakwaszenie zaprawą częściowo ogranicza ryzyko mikrobiologiczne. Różne cele: bezpieczeństwo ryby vs tekstura ryżu przy kontroli czasu.",
  ["ac_quality", "ch_station"], 3)


# ---------------------------------------------------------------------------
import re
import unicodedata


def fold(t):
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.replace("ł", "l").replace("Ł", "L").replace("ø", "o").replace("Ø", "O").replace("ß", "ss")
    return re.sub(r"\s+", " ", t.lower()).strip()


def sq(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    out = [
        "-- GENERATED by seed/academy_v1.py — starter Academy content (needs verification).",
        f"INSERT OR IGNORE INTO sources (id, type, title, notes, retrieved_at, is_private) VALUES ({sq(SOURCE_ID)}, 'ai_draft', {sq(SOURCE_TITLE)}, {sq(SOURCE_NOTES)}, '2026-11-16', 0);",
    ]
    for i, (mid, cat, title, desc) in enumerate(MODULES):
        out.append(
            f"INSERT OR IGNORE INTO learning_modules (id, category_id, level_id, title, description, sort_order) VALUES ({sq(mid)}, {sq(cat)}, 'lvl_advanced_cook', {sq(title)}, {sq(desc)}, {i + 1});"
        )
    for i, (lid, mid, title, body, comps) in enumerate(LESSONS):
        out.append(
            f"INSERT OR IGNORE INTO lessons (id, module_id, title, body, sort_order, status, source_id) VALUES ({sq(lid)}, {sq(mid)}, {sq(title)}, {sq(body)}, 1, 'needs_verification', {sq(SOURCE_ID)});"
        )
        for c in comps:
            out.append(f"INSERT OR IGNORE INTO lesson_competencies (lesson_id, competency_id) VALUES ({sq(lid)}, {sq('cmp_' + c)});")
        out.append(f"DELETE FROM search_index WHERE entity_type = 'lesson' AND entity_id = {sq(lid)};")
        out.append(
            f"INSERT INTO search_index (entity_type, entity_id, owner_id, title, body, folded) VALUES ('lesson', {sq(lid)}, NULL, {sq(title)}, {sq(body)}, {sq(fold(title + ' ' + body))});"
        )
    for n, qq in enumerate(QUESTIONS, 1):
        qid = f"q_v1_{n:03d}"
        out.append(
            "INSERT OR IGNORE INTO questions (id, type, prompt, explanation, difficulty, category_id, lesson_id, status, source_id) VALUES "
            f"({sq(qid)}, {sq(qq['type'])}, {sq(qq['prompt'])}, {sq(qq['explanation'])}, {qq['difficulty']}, {sq(qq['cat'])}, {sq(qq['lesson'])}, 'needs_verification', {sq(SOURCE_ID)});"
        )
        for k, opt in enumerate(qq["options"]):
            if len(opt) == 3:
                text, _, target = opt
                correct = True
            else:
                text, correct = opt
                target = None
            out.append(
                f"INSERT OR IGNORE INTO question_options (id, question_id, text, is_correct, match_target, sort_order) VALUES ({sq(f'{qid}_o{k}')}, {sq(qid)}, {sq(text)}, {sq(correct)}, {sq(target)}, {k});"
            )
        for c in qq["comps"]:
            out.append(f"INSERT OR IGNORE INTO question_competencies (question_id, competency_id) VALUES ({sq(qid)}, {sq('cmp_' + c)});")
        # Prompt only in the index (model answers must not leak through search).
        out.append(f"DELETE FROM search_index WHERE entity_type = 'question' AND entity_id = {sq(qid)};")
        out.append(
            f"INSERT INTO search_index (entity_type, entity_id, owner_id, title, body, folded) VALUES ('question', {sq(qid)}, NULL, {sq(qq['prompt'][:160])}, {sq(qq['prompt'])}, {sq(fold(qq['prompt']))});"
        )
    print("\n".join(out))


if __name__ == "__main__":
    main()
