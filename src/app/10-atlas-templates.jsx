const SLOGANS = [
  "Trenuj, zapisuj, progresuj.",
  "Ciężar rośnie, kiedy Ty nie odpuszczasz.",
  "Każda seria to cegła pod Twoją siłę.",
  "Dyscyplina bije motywację.",
  "Zapisz dziś, przebij jutro.",
  "Siła to suma dobrych dni na siłowni.",
  "Nie licz kalorii, licz powtórzenia.",
  "Progres lubi konsekwencję.",
  "Twój najlepszy wynik jeszcze nie padł.",
  "Ciężko teraz, lekko później.",
  "Każdy kilogram ma swoją historię.",
  "Rekordy nie biorą się znikąd.",
  "Trening bez planu to trening przypadku.",
  "Wracaj silniejszy niż wczoraj.",
  "Żelazo nie kłamie.",
  "Pot dziś, duma jutro.",
  "Małe kroki, wielkie ciężary.",
  "Nawyk buduje mięśnie, nie chwilówka.",
  "Nie czekaj na motywację, zacznij trening.",
  "Twoje ciało zapamięta każdą serię.",
  "Postęp mierzy się na kartce, nie w lustrze.",
];

function randomSlogan() {
  return SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
}

function dashboardTimePhrase() {
  const h = new Date().getHours();
  const base = h < 6 ? "Trening o tej porze? Szacunek" : h < 12 ? "Ranek to dobra pora na żelazo" : h < 17 ? "Popołudniowa dawka ciężarów" : h < 22 ? "Wieczorna sesja czeka" : "Nocna zmiana na siłowni";
  const emoji = h < 6 || h >= 22 ? "🌙" : h < 17 ? "☀️" : "🔥";
  return `${base} ${emoji}`;
}

const DEFAULT_EXERCISES = [
  { id: "squat_barbell", name: "Przysiad ze sztangą", category: ["Nogi"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Podstawowe ćwiczenie wielostawowe angażujące głównie mięśnie nóg i pośladków. Wzmacnia również core oraz stabilizację całego ciała.\n• Stabilna pozycja stóp i pleców\n• Kontrolowana faza ekscentryczna\n• Pełny, kontrolowany zakres ruchu\n• Utrzymanie napięcia mięśniowego" },
  { id: "bench_press", name: "Wyciskanie sztangi leżąc", category: ["Klatka"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Podstawowe ćwiczenie na klatkę piersiową, angażujące dodatkowo barki i triceps.\n• Łopatki ściągnięte i oparte o ławkę\n• Stabilna pozycja stóp na podłodze\n• Kontrolowane opuszczanie sztangi do klatki\n• Pełny zakres ruchu bez odbijania od klatki" },
  { id: "deadlift", name: "Martwy ciąg", category: ["Plecy"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Złożone ćwiczenie angażujące niemal całe ciało, ze szczególnym naciskiem na plecy, pośladki i tylną taśmę nóg.\n• Neutralny, prosty kręgosłup przez cały ruch\n• Sztanga blisko ciała przez cały czas\n• Wyprost bioder i kolan w tym samym tempie\n• Kontrolowane opuszczanie, bez rzucania obciążenia" },
  { id: "pullup", name: "Podciąganie na drążku", category: ["Plecy"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Ćwiczenie z masą własnego ciała, budujące siłę i szerokość pleców oraz siłę chwytu.\n• Pełny wyprost ramion na dole ruchu\n• Brodę nad drążkiem na górze ruchu\n• Kontrolowana faza opuszczania\n• Stabilny tułów, bez rozkołysania" },
  { id: "pushup", name: "Pompki", category: ["Klatka"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Podstawowe ćwiczenie z masą własnego ciała na klatkę piersiową, barki i triceps.\n• Proste ciało od głowy do pięt przez cały ruch\n• Łokcie pod kątem ok. 45° od tułowia\n• Pełny zakres ruchu — klatka blisko podłoża\n• Napięty core przez cały czas trwania serii" },
  { id: "rkc_plank", name: "RKC plank", category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: true, isSetsOnly: false, videoUrl: "", notes: "Izometryczne ćwiczenie wzmacniające głębokie mięśnie core oraz stabilizację całego ciała.\n• Maksymalne napięcie pośladków i brzucha\n• Neutralna pozycja miednicy, bez uginania w dole pleców\n• Ramiona ustawione bezpośrednio pod barkami\n• Kontrolowany, spokojny oddech przez cały czas" },
  { id: "dips", name: "Dipsy", category: ["Klatka", "Triceps"], equipment: ["Masa ciała", "Obciążenie"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Ćwiczenie z masą własnego ciała (lub z dociążeniem), angażujące klatkę piersiową i triceps.\n• Lekkie pochylenie tułowia do przodu dla większego zaangażowania klatki\n• Kontrolowane opuszczanie do momentu lekkiego rozciągnięcia barków\n• Łokcie blisko ciała przy nacisku na triceps\n• Pełny, płynny wyprost ramion na górze ruchu" },
  { id: "farmers_walk", name: "Spacer farmera", category: ["Przedramiona", "Całe ciało"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: true, videoUrl: "", notes: "" },
  { id: "cardio_run_treadmill", name: "Bieg na bieżni", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Bieżnia", videoUrl: "", notes: "" },
  { id: "cardio_walk_treadmill", name: "Marsz na bieżni", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Bieżnia", videoUrl: "", notes: "" },
  { id: "cardio_elliptical", name: "Orbitrek", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Orbitrek", videoUrl: "", notes: "" },
  { id: "cardio_bike", name: "Rower stacjonarny", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Rower stacjonarny", videoUrl: "", notes: "" },
  { id: "cardio_rower", name: "Ergometr wioślarski", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Ergometr wioślarski", videoUrl: "", notes: "" },
  { id: "cardio_stairs", name: "Schody / Stair Climber", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Schody", videoUrl: "", notes: "" },
  { id: "cardio_airbike", name: "Air Bike / Assault Bike", category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, isCardio: true, deviceType: "Air Bike", videoUrl: "", notes: "" },
  { id: "lat_pulldown", name: "Ściąganie drążka wyciągu górnego do klatki piersiowej", category: ["Plecy"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Ćwiczenie budujące szerokość pleców, dobra alternatywa lub uzupełnienie podciągania.\n• Lekkie odchylenie tułowia do tyłu, bez przesadnego bujania\n• Przyciąganie drążka do górnej części klatki piersiowej\n• Ściągnięte łopatki w dolnej fazie ruchu\n• Kontrolowany, pełny powrót do góry" },
  { id: "rdl_barbell", name: "Rumuński martwy ciąg ze sztangą", category: ["Nogi", "Pośladki"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "db_shoulder_press_seated", name: "Wyciskanie hantli siedząc", category: ["Barki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "db_curl_supination", name: "Uginanie przedramion z hantlami z supinacją", category: ["Biceps"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "cable_triceps_rope", name: "Prostowanie przedramion na wyciągu z liną", category: ["Triceps"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "barbell_row", name: "Wiosłowanie sztangą", category: ["Plecy", "Biceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "Ćwiczenie na grubość pleców, angażujące dodatkowo biceps i mięśnie stabilizujące tułów.\n• Stabilne, lekko pochylone ustawienie tułowia\n• Przyciąganie sztangi w kierunku dolnej części brzucha\n• Ściągnięte łopatki w górnej fazie ruchu\n• Kontrolowany powrót bez utraty napięcia pleców" },
  { id: "ez_bar_curl", name: "Uginanie przedramion ze sztangą łamaną", category: ["Biceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "pullup_overhand", name: "Podciąganie nachwytem", category: ["Plecy", "Biceps"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "db_incline_press_30", name: "Wyciskanie hantli na ławce skos dodatni 30°", category: ["Klatka"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "chest_supported_row_machine", name: "Wiosłowanie na maszynie siedząc z podparciem klatki piersiowej", category: ["Plecy"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "leg_press", name: "Suwnica do wypychania nogami", category: ["Nogi"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "rdl_dumbbell", name: "Rumuński martwy ciąg z hantlami", category: ["Nogi", "Pośladki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "leg_curl_seated", name: "Uginanie nóg na maszynie siedząc", category: ["Nogi"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "hip_abduction_machine", name: "Odwodzenie nóg na maszynie siedząc", category: ["Pośladki"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "db_lateral_raise", name: "Unoszenie hantli bokiem stojąc", category: ["Barki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "rear_delt_machine", name: "Odwrotne rozpiętki na maszynie", category: ["Barki"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "cable_crunch", name: "Spięcia brzucha na wyciągu", category: ["Brzuch"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "cable_fly_standing", name: "Rozpiętki na wyciągu w pozycji stojącej", category: ["Klatka"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "barbell_row_bent", name: "Wiosłowanie sztangą w opadzie tułowia", category: ["Plecy", "Biceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "lat_pulldown_neutral", name: "Ściąganie drążka wyciągu górnego chwytem neutralnym", category: ["Plecy"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "ohp_seated_barbell", name: "Wyciskanie sztangi siedząc nad głowę", category: ["Barki", "Triceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "ohp_standing_barbell", name: "Wyciskanie sztangi stojąc nad głowę", category: ["Barki", "Triceps", "Całe ciało"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "pullup_band_assist", name: "Podciąganie na drążku z pomocą gumy oporowej", category: ["Plecy", "Biceps"], equipment: ["Drążek", "Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "hanging_knee_raise", name: "Unoszenie kolan w zwisie na drążku", category: ["Brzuch", "Pośladki"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "pullup_underhand", name: "Podciąganie podchwytem", category: ["Plecy", "Biceps"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "squat_front_barbell", name: "Przysiad przedni ze sztangą", category: ["Nogi", "Pośladki", "Całe ciało"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "pullup_overhand_weighted", name: "Podciąganie nachwytem z dodatkowym obciążeniem", category: ["Plecy", "Biceps", "Przedramiona"], equipment: ["Drążek", "Obciążenie"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "hanging_leg_raise_straight", name: "Unoszenie prostych nóg w zwisie na drążku", category: ["Brzuch", "Pośladki"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "pullup_underhand_weighted", name: "Podciąganie podchwytem z dodatkowym obciążeniem", category: ["Plecy", "Biceps", "Przedramiona"], equipment: ["Drążek", "Obciążenie"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "cable_row_seated", name: "Wiosłowanie siedząc na wyciągu", category: ["Plecy", "Biceps"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "rear_delt_cable", name: "Odwodzenie ramion na wyciągu na tylny akton barków", category: ["Barki"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "db_lunge", name: "Wykroki z hantlami", category: ["Nogi", "Pośladki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "calf_raise_standing", name: "Wspięcia na palce stojąc", category: ["Nogi"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "hip_thrust_barbell", name: "Hip thrust ze sztangą", category: ["Pośladki"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "bodyweight_squat", name: "Przysiad z masą własnego ciała", category: ["Nogi"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "db_row_single_arm", name: "Wiosłowanie jednorącz hantlem", category: ["Plecy", "Biceps"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "glute_bridge_bodyweight", name: "Most biodrowy z masą własnego ciała", category: ["Pośladki"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "plank", name: "Plank", category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: true, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "bulgarian_split_squat_db", name: "Przysiad bułgarski z hantlami", category: ["Nogi", "Pośladki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "hip_abduction_band", name: "Odwodzenie bioder z gumą", category: ["Pośladki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_squat", name: "Przysiad z gumą", category: ["Nogi"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_chest_press", name: "Wyciskanie klatki piersiowej z gumą", category: ["Klatka"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_row", name: "Wiosłowanie z gumą", category: ["Plecy"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_rdl", name: "Rumuński martwy ciąg z gumą", category: ["Nogi", "Pośladki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_overhead_press", name: "Wyciskanie nad głowę z gumą", category: ["Barki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_curl", name: "Uginanie przedramion z gumą", category: ["Biceps"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_triceps_extension", name: "Prostowanie ramion z gumą", category: ["Triceps"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "band_lateral_raise", name: "Unoszenie ramion bokiem z gumą", category: ["Barki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "dead_bug", name: "Dead bug", category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "bird_dog", name: "Bird dog", category: ["Brzuch", "Całe ciało"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "lying_knee_raise", name: "Unoszenie kolan w leżeniu", category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "ab_wheel_rollout", name: "Rollout z kółkiem", category: ["Brzuch", "Całe ciało"], equipment: ["Kółko do brzucha"], isTimeBased: false, isSetsOnly: false, videoUrl: "", notes: "" },
  { id: "weighted_plank", name: "Plank z obciążeniem", category: ["Brzuch"], equipment: ["Masa ciała", "Obciążenie"], isTimeBased: true, isSetsOnly: false, videoUrl: "", notes: "" },
];

const EXERCISE_ATLAS_META = {
  "Przysiad ze sztangą": { category: ["Nogi"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie sztangi leżąc": { category: ["Klatka"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Martwy ciąg": { category: ["Plecy"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Podciąganie na drążku": { category: ["Plecy"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false },
  "Pompki": { category: ["Klatka"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false },
  "RKC plank": { category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: true, isSetsOnly: false },
  "Dipsy": { category: ["Klatka", "Triceps"], equipment: ["Masa ciała", "Obciążenie"], isTimeBased: false, isSetsOnly: false },
  "Spacer farmera": { category: ["Przedramiona", "Całe ciało"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: true },
  "Bieg na bieżni": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Marsz na bieżni": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Orbitrek": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Rower stacjonarny": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Ergometr wioślarski": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Schody / Stair Climber": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Air Bike / Assault Bike": { category: ["Cardio"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Ściąganie drążka wyciągu górnego do klatki piersiowej": { category: ["Plecy"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Rumuński martwy ciąg ze sztangą": { category: ["Nogi", "Pośladki"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie hantli siedząc": { category: ["Barki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Uginanie przedramion z hantlami z supinacją": { category: ["Biceps"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Prostowanie przedramion na wyciągu z liną": { category: ["Triceps"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Wiosłowanie sztangą": { category: ["Plecy", "Biceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Uginanie przedramion ze sztangą łamaną": { category: ["Biceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Podciąganie nachwytem": { category: ["Plecy", "Biceps"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie hantli na ławce skos dodatni 30°": { category: ["Klatka"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Wiosłowanie na maszynie siedząc z podparciem klatki piersiowej": { category: ["Plecy"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Suwnica do wypychania nogami": { category: ["Nogi"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Rumuński martwy ciąg z hantlami": { category: ["Nogi", "Pośladki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Uginanie nóg na maszynie siedząc": { category: ["Nogi"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Odwodzenie nóg na maszynie siedząc": { category: ["Pośladki"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Unoszenie hantli bokiem stojąc": { category: ["Barki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Odwrotne rozpiętki na maszynie": { category: ["Barki"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Spięcia brzucha na wyciągu": { category: ["Brzuch"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Rozpiętki na wyciągu w pozycji stojącej": { category: ["Klatka"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Wiosłowanie sztangą w opadzie tułowia": { category: ["Plecy", "Biceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Ściąganie drążka wyciągu górnego chwytem neutralnym": { category: ["Plecy"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie sztangi siedząc nad głowę": { category: ["Barki", "Triceps"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie sztangi stojąc nad głowę": { category: ["Barki", "Triceps", "Całe ciało"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Podciąganie na drążku z pomocą gumy oporowej": { category: ["Plecy", "Biceps"], equipment: ["Drążek", "Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Unoszenie kolan w zwisie na drążku": { category: ["Brzuch", "Pośladki"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false },
  "Podciąganie podchwytem": { category: ["Plecy", "Biceps"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false },
  "Przysiad przedni ze sztangą": { category: ["Nogi", "Pośladki", "Całe ciało"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Podciąganie nachwytem z dodatkowym obciążeniem": { category: ["Plecy", "Biceps", "Przedramiona"], equipment: ["Drążek", "Obciążenie"], isTimeBased: false, isSetsOnly: false },
  "Unoszenie prostych nóg w zwisie na drążku": { category: ["Brzuch", "Pośladki"], equipment: ["Drążek"], isTimeBased: false, isSetsOnly: false },
  "Podciąganie podchwytem z dodatkowym obciążeniem": { category: ["Plecy", "Biceps", "Przedramiona"], equipment: ["Drążek", "Obciążenie"], isTimeBased: false, isSetsOnly: false },
  "Wiosłowanie siedząc na wyciągu": { category: ["Plecy", "Biceps"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Odwodzenie ramion na wyciągu na tylny akton barków": { category: ["Barki"], equipment: ["Wyciąg"], isTimeBased: false, isSetsOnly: false },
  "Wykroki z hantlami": { category: ["Nogi", "Pośladki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Wspięcia na palce stojąc": { category: ["Nogi"], equipment: ["Maszyny"], isTimeBased: false, isSetsOnly: false },
  "Hip thrust ze sztangą": { category: ["Pośladki"], equipment: ["Sztanga"], isTimeBased: false, isSetsOnly: false },
  "Przysiad z masą własnego ciała": { category: ["Nogi"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false },
  "Wiosłowanie jednorącz hantlem": { category: ["Plecy", "Biceps"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Most biodrowy z masą własnego ciała": { category: ["Pośladki"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false },
  "Plank": { category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: true, isSetsOnly: false },
  "Przysiad bułgarski z hantlami": { category: ["Nogi", "Pośladki"], equipment: ["Hantle"], isTimeBased: false, isSetsOnly: false },
  "Odwodzenie bioder z gumą": { category: ["Pośladki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Przysiad z gumą": { category: ["Nogi"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie klatki piersiowej z gumą": { category: ["Klatka"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Wiosłowanie z gumą": { category: ["Plecy"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Rumuński martwy ciąg z gumą": { category: ["Nogi", "Pośladki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Wyciskanie nad głowę z gumą": { category: ["Barki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Uginanie przedramion z gumą": { category: ["Biceps"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Prostowanie ramion z gumą": { category: ["Triceps"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Unoszenie ramion bokiem z gumą": { category: ["Barki"], equipment: ["Guma oporowa"], isTimeBased: false, isSetsOnly: false },
  "Dead bug": { category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false },
  "Bird dog": { category: ["Brzuch", "Całe ciało"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false },
  "Unoszenie kolan w leżeniu": { category: ["Brzuch"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false },
  "Rollout z kółkiem": { category: ["Brzuch", "Całe ciało"], equipment: ["Kółko do brzucha"], isTimeBased: false, isSetsOnly: false },
  "Plank z obciążeniem": { category: ["Brzuch"], equipment: ["Masa ciała", "Obciążenie"], isTimeBased: true, isSetsOnly: false },
};

const TEMPLATE_PLAN_DATA = {
  "fbw_początkujący": [
    { dayLabel: "", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}] },
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}] },
      { exerciseName: "Ściąganie drążka wyciągu górnego do klatki piersiowej", restSeconds: 120, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 90, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion z hantlami z supinacją", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "2"}, {"target": "10-12", "rir": "1-2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "2"}, {"target": "10-12", "rir": "1-2"}] },
    ]},
  ],
  "fbw_średniozaawansowany": [
    { dayLabel: "", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "2"}, {"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "2"}, {"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie sztangą", restSeconds: 120, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 90, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion ze sztangą łamaną", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}] },
    ]},
  ],
  "fbw_zaawansowany": [
    { dayLabel: "", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Podciąganie nachwytem", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 180, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 90, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion ze sztangą łamaną", restSeconds: 60, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 60, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
  ],
  "split_początkujący": [
    { dayLabel: "klatka + triceps", items: [
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}] },
      { exerciseName: "Wyciskanie hantli na ławce skos dodatni 30°", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
    ]},
    { dayLabel: "plecy + biceps", items: [
      { exerciseName: "Ściąganie drążka wyciągu górnego do klatki piersiowej", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Wiosłowanie na maszynie siedząc z podparciem klatki piersiowej", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Uginanie przedramion z hantlami z supinacją", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
    ]},
    { dayLabel: "nogi + pośladki", items: [
      { exerciseName: "Suwnica do wypychania nogami", restSeconds: 150, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Rumuński martwy ciąg z hantlami", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Uginanie nóg na maszynie siedząc", restSeconds: 90, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
      { exerciseName: "Odwodzenie nóg na maszynie siedząc", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "2"}, {"target": "12-15", "rir": "2"}] },
    ]},
    { dayLabel: "barki + brzuch", items: [
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Unoszenie hantli bokiem stojąc", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "2"}, {"target": "12-15", "rir": "2"}, {"target": "12-15", "rir": "2"}] },
      { exerciseName: "Odwrotne rozpiętki na maszynie", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "2"}, {"target": "12-15", "rir": "2"}] },
      { exerciseName: "Spięcia brzucha na wyciągu", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
    ]},
  ],
  "split_średniozaawansowany": [
    { dayLabel: "klatka + triceps", items: [
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli na ławce skos dodatni 30°", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Rozpiętki na wyciągu w pozycji stojącej", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
    { dayLabel: "plecy + biceps", items: [
      { exerciseName: "Podciąganie nachwytem", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie sztangą w opadzie tułowia", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Ściąganie drążka wyciągu górnego chwytem neutralnym", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion ze sztangą łamaną", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "nogi + pośladki", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "2"}, {"target": "5-8", "rir": "2"}, {"target": "5-8", "rir": "2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Suwnica do wypychania nogami", restSeconds: 120, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Uginanie nóg na maszynie siedząc", restSeconds: 90, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Odwodzenie nóg na maszynie siedząc", restSeconds: 60, setsDetail: [{"target": "12-20", "rir": "1-2"}, {"target": "12-20", "rir": "1-2"}] },
    ]},
    { dayLabel: "barki + brzuch", items: [
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 120, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Unoszenie hantli bokiem stojąc", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Odwrotne rozpiętki na maszynie", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Spięcia brzucha na wyciągu", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
  ],
  "split_zaawansowany": [
    { dayLabel: "klatka + triceps", items: [
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli na ławce skos dodatni 30°", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Rozpiętki na wyciągu w pozycji stojącej", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "0-1"}, {"target": "10-15", "rir": "0-1"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "plecy + biceps", items: [
      { exerciseName: "Podciąganie nachwytem z dodatkowym obciążeniem", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie sztangą w opadzie tułowia", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}] },
      { exerciseName: "Ściąganie drążka wyciągu górnego chwytem neutralnym", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion ze sztangą łamaną", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "nogi + pośladki", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 180, setsDetail: [{"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}] },
      { exerciseName: "Suwnica do wypychania nogami", restSeconds: 150, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Uginanie nóg na maszynie siedząc", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Odwodzenie nóg na maszynie siedząc", restSeconds: 60, setsDetail: [{"target": "15-20", "rir": "0-1"}, {"target": "15-20", "rir": "0-1"}] },
    ]},
    { dayLabel: "barki + brzuch", items: [
      { exerciseName: "Wyciskanie sztangi siedząc nad głowę", restSeconds: 150, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Unoszenie hantli bokiem stojąc", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "0-1"}, {"target": "10-15", "rir": "0-1"}, {"target": "10-15", "rir": "0-1"}, {"target": "10-15", "rir": "0-1"}] },
      { exerciseName: "Odwrotne rozpiętki na maszynie", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Spięcia brzucha na wyciągu", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
  ],
  "5x5_początkujący": [
    { dayLabel: "Trening A", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Wiosłowanie sztangą w opadzie tułowia", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Unoszenie kolan w zwisie na drążku", restSeconds: 75, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
    ]},
    { dayLabel: "Trening B", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Wyciskanie sztangi stojąc nad głowę", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Martwy ciąg", restSeconds: 210, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Podciąganie na drążku z pomocą gumy oporowej", restSeconds: 120, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}] },
    ]},
  ],
  "5x5_średniozaawansowany": [
    { dayLabel: "Trening A", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 210, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Wiosłowanie sztangą w opadzie tułowia", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Podciąganie nachwytem", restSeconds: 120, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}] },
      { exerciseName: "Unoszenie kolan w zwisie na drążku", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
    ]},
    { dayLabel: "Trening B", items: [
      { exerciseName: "Martwy ciąg", restSeconds: 240, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Wyciskanie sztangi stojąc nad głowę", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Przysiad przedni ze sztangą", restSeconds: 180, setsDetail: [{"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}, {"target": "5", "rir": "2"}] },
      { exerciseName: "Podciąganie podchwytem", restSeconds: 120, setsDetail: [{"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}, {"target": "6-10", "rir": "2"}] },
      { exerciseName: "Unoszenie kolan w zwisie na drążku", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
    ]},
  ],
  "5x5_zaawansowany": [
    { dayLabel: "Trening A", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 240, setsDetail: [{"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 210, setsDetail: [{"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie sztangą w opadzie tułowia", restSeconds: 210, setsDetail: [{"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}] },
      { exerciseName: "Podciąganie nachwytem z dodatkowym obciążeniem", restSeconds: 150, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Unoszenie prostych nóg w zwisie na drążku", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "Trening B", items: [
      { exerciseName: "Martwy ciąg", restSeconds: 240, setsDetail: [{"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie sztangi stojąc nad głowę", restSeconds: 210, setsDetail: [{"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}] },
      { exerciseName: "Przysiad przedni ze sztangą", restSeconds: 210, setsDetail: [{"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}, {"target": "5", "rir": "1-2"}] },
      { exerciseName: "Podciąganie podchwytem z dodatkowym obciążeniem", restSeconds: 150, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Unoszenie prostych nóg w zwisie na drążku", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
  ],
  "ppl_początkujący": [
    { dayLabel: "Push", items: [
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "2"}, {"target": "6-8", "rir": "2"}, {"target": "6-8", "rir": "2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 90, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "2"}, {"target": "10-12", "rir": "2"}] },
    ]},
    { dayLabel: "Pull", items: [
      { exerciseName: "Ściąganie drążka wyciągu górnego do klatki piersiowej", restSeconds: 120, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}] },
      { exerciseName: "Wiosłowanie siedząc na wyciągu", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Uginanie przedramion z hantlami z supinacją", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "2"}, {"target": "10-12", "rir": "2"}] },
    ]},
    { dayLabel: "Legs", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "2"}, {"target": "6-8", "rir": "2"}, {"target": "6-8", "rir": "2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}] },
      { exerciseName: "Wspięcia na palce stojąc", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
    ]},
  ],
  "ppl_średniozaawansowany": [
    { dayLabel: "Push", items: [
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli na ławce skos dodatni 30°", restSeconds: 120, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 90, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Unoszenie hantli bokiem stojąc", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 60, setsDetail: [{"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "Pull", items: [
      { exerciseName: "Podciąganie nachwytem", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie sztangą", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie siedząc na wyciągu", restSeconds: 120, setsDetail: [{"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}] },
      { exerciseName: "Odwodzenie ramion na wyciągu na tylny akton barków", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion ze sztangą łamaną", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "Legs", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}, {"target": "6-8", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Wykroki z hantlami", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Wspięcia na palce stojąc", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Unoszenie kolan w zwisie na drążku", restSeconds: 75, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
  ],
  "ppl_zaawansowany": [
    { dayLabel: "Push", items: [
      { exerciseName: "Wyciskanie sztangi leżąc", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli na ławce skos dodatni 30°", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}, {"target": "8-10", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 120, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Unoszenie hantli bokiem stojąc", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Prostowanie przedramion na wyciągu z liną", restSeconds: 75, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "Pull", items: [
      { exerciseName: "Podciąganie nachwytem", restSeconds: 180, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie sztangą", restSeconds: 180, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie siedząc na wyciągu", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Odwodzenie ramion na wyciągu na tylny akton barków", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion ze sztangą łamaną", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
    ]},
    { dayLabel: "Legs", items: [
      { exerciseName: "Przysiad ze sztangą", restSeconds: 180, setsDetail: [{"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}, {"target": "5-8", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 180, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Wykroki z hantlami", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Hip thrust ze sztangą", restSeconds: 150, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Wspięcia na palce stojąc", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
  ],
  "home_uniwersalny": [
    { dayLabel: "", items: [
      { exerciseName: "Przysiad z masą własnego ciała", restSeconds: 90, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Pompki", restSeconds: 90, setsDetail: [{"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie jednorącz hantlem", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg z hantlami", restSeconds: 90, setsDetail: [{"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie hantli siedząc", restSeconds: 90, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Most biodrowy z masą własnego ciała", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "1-2"}, {"target": "12-15", "rir": "1-2"}] },
      { exerciseName: "Plank", restSeconds: 60, setsDetail: [{"target": "30-45", "rir": "1-2"}, {"target": "30-45", "rir": "1-2"}] },
    ]},
  ],
  "glutes_początkujący": [
    { dayLabel: "", items: [
      { exerciseName: "Hip thrust ze sztangą", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Przysiad ze sztangą", restSeconds: 150, setsDetail: [{"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}, {"target": "8-10", "rir": "2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "2"}, {"target": "8-12", "rir": "2"}] },
      { exerciseName: "Wykroki z hantlami", restSeconds: 90, setsDetail: [{"target": "10-12", "rir": "2"}, {"target": "10-12", "rir": "2"}] },
      { exerciseName: "Odwodzenie bioder z gumą", restSeconds: 60, setsDetail: [{"target": "12-20", "rir": "2"}, {"target": "12-20", "rir": "2"}] },
    ]},
  ],
  "glutes_zaawansowany": [
    { dayLabel: "", items: [
      { exerciseName: "Hip thrust ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg ze sztangą", restSeconds: 150, setsDetail: [{"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}, {"target": "6-10", "rir": "1-2"}] },
      { exerciseName: "Przysiad bułgarski z hantlami", restSeconds: 120, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Wykroki z hantlami", restSeconds: 90, setsDetail: [{"target": "10-12", "rir": "1-2"}, {"target": "10-12", "rir": "1-2"}] },
      { exerciseName: "Odwodzenie bioder z gumą", restSeconds: 60, setsDetail: [{"target": "12-20", "rir": "1-2"}, {"target": "12-20", "rir": "1-2"}, {"target": "12-20", "rir": "1-2"}] },
    ]},
  ],
  "bands_początkujący": [
    { dayLabel: "", items: [
      { exerciseName: "Przysiad z gumą", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
      { exerciseName: "Wyciskanie klatki piersiowej z gumą", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
      { exerciseName: "Wiosłowanie z gumą", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
      { exerciseName: "Rumuński martwy ciąg z gumą", restSeconds: 75, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
      { exerciseName: "Wyciskanie nad głowę z gumą", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "2"}, {"target": "10-15", "rir": "2"}] },
      { exerciseName: "Uginanie przedramion z gumą", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "2"}, {"target": "12-15", "rir": "2"}] },
      { exerciseName: "Prostowanie ramion z gumą", restSeconds: 60, setsDetail: [{"target": "12-15", "rir": "2"}, {"target": "12-15", "rir": "2"}] },
    ]},
  ],
  "bands_zaawansowany": [
    { dayLabel: "", items: [
      { exerciseName: "Przysiad z gumą", restSeconds: 75, setsDetail: [{"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie klatki piersiowej z gumą", restSeconds: 75, setsDetail: [{"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}] },
      { exerciseName: "Wiosłowanie z gumą", restSeconds: 75, setsDetail: [{"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}] },
      { exerciseName: "Rumuński martwy ciąg z gumą", restSeconds: 75, setsDetail: [{"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}] },
      { exerciseName: "Wyciskanie nad głowę z gumą", restSeconds: 60, setsDetail: [{"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}, {"target": "8-15", "rir": "1-2"}] },
      { exerciseName: "Unoszenie ramion bokiem z gumą", restSeconds: 60, setsDetail: [{"target": "12-20", "rir": "1-2"}, {"target": "12-20", "rir": "1-2"}, {"target": "12-20", "rir": "1-2"}] },
      { exerciseName: "Uginanie przedramion z gumą", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Prostowanie ramion z gumą", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
  ],
  "abs_początkujący": [
    { dayLabel: "", items: [
      { exerciseName: "Plank", restSeconds: 60, setsDetail: [{"target": "20-30", "rir": "1-2"}, {"target": "20-30", "rir": "1-2"}, {"target": "20-30", "rir": "1-2"}] },
      { exerciseName: "Dead bug", restSeconds: 45, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Bird dog", restSeconds: 45, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Unoszenie kolan w leżeniu", restSeconds: 45, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
  ],
  "abs_średniozaawansowany": [
    { dayLabel: "", items: [
      { exerciseName: "Plank", restSeconds: 60, setsDetail: [{"target": "30-45", "rir": "1-2"}, {"target": "30-45", "rir": "1-2"}, {"target": "30-45", "rir": "1-2"}] },
      { exerciseName: "Unoszenie prostych nóg w zwisie na drążku", restSeconds: 60, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Spięcia brzucha na wyciągu", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Dead bug", restSeconds: 45, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
    ]},
  ],
  "abs_zaawansowany": [
    { dayLabel: "", items: [
      { exerciseName: "Unoszenie prostych nóg w zwisie na drążku", restSeconds: 60, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Spięcia brzucha na wyciągu", restSeconds: 60, setsDetail: [{"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}, {"target": "10-15", "rir": "1-2"}] },
      { exerciseName: "Rollout z kółkiem", restSeconds: 75, setsDetail: [{"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}, {"target": "8-12", "rir": "1-2"}] },
      { exerciseName: "Plank z obciążeniem", restSeconds: 60, setsDetail: [{"target": "30-60", "rir": "1-2"}, {"target": "30-60", "rir": "1-2"}, {"target": "30-60", "rir": "1-2"}] },
    ]},
  ],
};

// Builds real, fully-populated plans (with real setsDetail/restSeconds) from a ready-made
// template level, resolving each exercise by NAME against the person's own exercises list first
// (so someone who already has "Przysiad ze sztangą" never gets a duplicate), and only creating a
// new exercise — using the shared atlas metadata for its category/equipment — when they don't yet
// have one by that name. Returns both the new plans and any newly-created exercises, so the caller
// can commit both through the existing updatePlans/updateExercises mechanism; nothing here is a
// separate "preset" system, it's just data assembly for the same plan/exercise model.
// A ready plan's day-plans prepared for USE (starting or back-filling a workout) — never saved to
// "Moje plany". Ids are stable and derived from the template ("tpl-<template>-<level>-<day>"), so
// every workout from the same ready-plan day carries the same source reference (planId + name);
// sync sends plan_id = null for them (no user plan exists) and keeps plan_name / plan_label.
// newExercises = template exercises missing from the person's exercise library; the caller adds
// them only when the workout actually starts / is created (history needs real exerciseIds).
function buildReadyPlanDays(template, level, exercises) {
  const built = buildPlansFromTemplateLevel(template, level, exercises);
  const baseName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;
  const toDay = (p, i) => ({ ...p, id: `tpl-${template.key}-${level.id}-${i}`, templateKey: template.key, readyTemplate: true });
  if (!built) return { baseName, days: [toDay({ name: baseName, exercises: [] }, 0)], newExercises: [] };
  return { baseName, days: built.newPlans.map(toDay), newExercises: built.newExercises };
}
// Short label of one ready-plan day for pickers: "Dzień 2 · (plecy + biceps)".
function readyDayLabel(baseName, day, i) {
  const rest = (day.name || "").startsWith(baseName) ? day.name.slice(baseName.length).trim() : "";
  return `Dzień ${i + 1}${rest ? ` · ${rest.replace(/^\(|\)$/g, "")}` : ""}`;
}
const mergeNewExercises = (prev, newExercises) => [...prev, ...(newExercises || []).filter((ne) => !prev.some((e) => e.id === ne.id))];

function buildPlansFromTemplateLevel(template, level, currentExercises) {
  const dayDefs = TEMPLATE_PLAN_DATA[level.id];
  if (!dayDefs || !dayDefs.length) return null;

  const exercisesByName = new Map(currentExercises.map((e) => [e.name, e]));
  const newExercises = [];

  const resolveExerciseId = (name) => {
    const existing = exercisesByName.get(name);
    if (existing) return existing.id;
    const meta = EXERCISE_ATLAS_META[name] || { category: ["Całe ciało"], equipment: ["Masa ciała"], isTimeBased: false, isSetsOnly: false };
    const created = normalizeExercise({ id: uid(), name, ...meta });
    exercisesByName.set(name, created);
    newExercises.push(created);
    return created.id;
  };

  const multiDay = dayDefs.length > 1;
  const baseName = template.levels.length > 1 ? `${template.name} — ${level.label}` : template.name;

  const newPlans = dayDefs.map((day) => ({
    id: uid(),
    name: multiDay && day.dayLabel ? `${baseName} (${day.dayLabel})` : baseName,
    templateKey: template.key,
    exercises: day.items.map((it) => ({
      id: uid(),
      exerciseId: resolveExerciseId(it.exerciseName),
      restSeconds: it.restSeconds,
      supersetGroup: null,
      setsDetail: it.setsDetail.map((s) => ({ id: uid(), target: s.target, rir: s.rir })),
    })),
  }));

  return { newPlans, newExercises };
}

const LEVELS_3 = ["Początkujący", "Średniozaawansowany", "Zaawansowany"];
const LEVELS_2 = ["Początkujący", "Zaawansowany"];
// Two separate experience maps so there's never a gap between levels: the 3-level split uses
// bounded ranges (0–1 / 1–2 / 2+ lata), and the 2-level split uses a single continuous cutoff
// (below/above 1,5 roku) rather than reusing the 3-level boundaries, which would leave anyone
// with 1–2 lat doświadczenia matching neither level.
const LEVEL_EXPERIENCE_3 = {
  "Początkujący": "doświadczenie poniżej 1 roku",
  "Średniozaawansowany": "doświadczenie od 1 do 2 lat",
  "Zaawansowany": "doświadczenie powyżej 2 lat",
};
const LEVEL_EXPERIENCE_2 = {
  "Początkujący": "doświadczenie poniżej 1,5 roku",
  "Zaawansowany": "doświadczenie powyżej 1,5 roku",
};

function makeLevels(templateKey, labels) {
  const experienceMap = labels.length === 2 ? LEVEL_EXPERIENCE_2 : LEVEL_EXPERIENCE_3;
  return labels.map((label) => ({
    id: `${templateKey}_${label.toLowerCase()}`,
    label,
    experience: experienceMap[label],
  }));
}

// Ready-made plan templates shown in the Plany → Gotowe tab. Each is a shell (no exercises yet —
// those get added afterwards in the plan editor); picking a level creates a real plan the person
// can then fill in. `tier` gates whether tapping a level opens Premium instead.

const TEMPLATE_IMAGES = {
  "fbw": __asset_plan_fbw,
  "split": __asset_plan_split,
  "5x5": __asset_plan_5x5,
  "ppl": __asset_plan_ppl,
  "home": __asset_plan_home,
  "glutes": __asset_plan_glutes,
  "bands": __asset_plan_bands,
  "abs": __asset_plan_abs,
};

const READY_PLAN_TEMPLATES = [
  {
    key: "fbw",
    name: "FBW (Full Body Workout)",
    tier: "free",
    description: "Trening całego ciała w jednej sesji, zwykle 3× w tygodniu. Angażuje wszystkie główne partie na każdym treningu — dobry wybór na start, bo pozwala często ćwiczyć każdy mięsień i szybciej uczyć się techniki.",
    levels: makeLevels("fbw", LEVELS_3),
  },
  {
    key: "split",
    name: "Split",
    tier: "free",
    description: "Trening dzielony — każda sesja skupia się na wybranych partiach (np. góra/dół albo poszczególne grupy mięśniowe). Pozwala poświęcić więcej objętości danej partii w jednym dniu, kosztem rzadszej częstotliwości jej treningu.",
    levels: makeLevels("split", LEVELS_3),
  },
  {
    key: "5x5",
    name: "5×5",
    tier: "premium",
    description: "Klasyczny program siłowy oparty na kilku ćwiczeniach wielostawowych w schemacie 5 serii po 5 powtórzeń. Skupia się na systematycznym zwiększaniu ciężaru w podstawowych ruchach — prostota i regularna progresja.",
    levels: makeLevels("5x5", LEVELS_3),
  },
  {
    key: "ppl",
    name: "Push Pull Legs",
    tier: "premium",
    description: "Podział na trzy dni: pchnięcie (klatka, barki, triceps), przyciąganie (plecy, biceps) i nogi. Pozwala trenować każdą partię z dobrą częstotliwością bez przeciążania tych samych mięśni dzień po dniu.",
    levels: makeLevels("ppl", LEVELS_3),
  },
  {
    key: "home",
    name: "Home Workout",
    tier: "free",
    description: "Trening do wykonania w domu, bez siłowni — bazuje głównie na ćwiczeniach z masą własnego ciała i minimalnym sprzęcie. Dobra opcja, gdy nie masz siłowni pod ręką albo wolisz trenować u siebie.",
    levels: makeLevels("home", ["Uniwersalny"]),
  },
  {
    key: "glutes",
    name: "Pośladki",
    tier: "premium",
    description: "Trening skoncentrowany na rozwoju pośladków, uzupełniająco angażujący nogi. Dla osób, które chcą świadomie zwiększyć objętość treningową tej konkretnej partii ponad standardowy plan.",
    levels: makeLevels("glutes", LEVELS_2),
  },
  {
    key: "bands",
    name: "Trening z gumami",
    tier: "free",
    description: "Trening oparty wyłącznie na gumach oporowych — sprzęt lekki, tani i mobilny. Sprawdza się w podróży, w domu bez sprzętu siłowego albo jako uzupełnienie głównego planu.",
    levels: makeLevels("bands", LEVELS_2),
  },
  {
    key: "abs",
    name: "Trening brzucha",
    tier: "free",
    description: "Trening skoncentrowany na mięśniach brzucha i core. Dobre uzupełnienie głównego planu dla osób, które chcą dodatkowo popracować nad tą partią.",
    levels: makeLevels("abs", LEVELS_3),
  },
];

/* ---------------------------------------------------------------------- */
/* Small shared UI bits                                                    */
/* ---------------------------------------------------------------------- */

