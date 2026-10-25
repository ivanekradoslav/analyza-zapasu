Postav webovú appku na video analýzu futbalových zápasov (štýl Hudl/Once), Fáza 1 MVP. UI po slovensky.

STACK: Vite + React + TypeScript, Tailwind. Ukladanie: IndexedDB (Dexie). Export videa: ffmpeg.wasm (@ffmpeg/ffmpeg 0.12, multithread ak je dostupný, inak single-thread), veľké súbory mountuj cez WORKERFS (nekopírovať celý súbor do pamäte). Cieľ: Chrome/Edge na notebooku.

FUNKCIE:
1. Video: otvorenie lokálneho MP4 (Veo export, 2–4 GB, celý zápas) cez object URL, nič sa neuploaduje. Ovládanie: play/pauza (medzerník), ±5 s (šípky), ±1 snímka (, .), rýchlosť 0.5–2×.
2. Projekt: zápas (súper, dátum, súťaž), súpiska (meno, číslo, pozícia). Viac projektov, autosave do IndexedDB, export/import projektu ako JSON.
3. Tagovanie: klávesové skratky pre každý tag, tím (môj/súper, prepínanie Tab), voliteľne hráč zo súpisky (číslo hráča na klávesnici), poznámka. Predvolené tagy:
   - Herné fázy: útok, obrana, prechod do útoku, prechod do obrany, štandardná situácia
   - Udalosti: strela, gól, strata lopty, zisk lopty, prihrávka do finálnej tretiny, centr
   - Pressing/obrana: vysoký presing, presing po strate, blok, zlá kompaktnosť
   Vlastné tagy: pridanie/úprava (názov, farba, kategória, skratka).
4. Timeline pod videom s farebnými značkami tagov, klik = skok. Zoznam tagov s filtrom (kategória, tím, hráč, polčas), editácia/mazanie.
5. Kreslenie na zastavený záber (canvas overlay nad videom, súradnice normalizované 0–1): šípka, čiara, prerušovaná čiara (beh bez lopty), kruh pod hráčom (elipsa), spojnica medzi hráčmi (polyline – línia obrany), zóna (polygón s priehľadnosťou), text. Farby, hrúbka, undo/redo, mazanie. Kresba je naviazaná na čas vo videu; pri prehrávaní sa video na tom čase zastaví a kresba sa zobrazí na nastaviteľnú dĺžku (default 4 s), potom pokračuje.
6. Klipy: z tagu jedným klikom (default −5 s / +5 s, upraviteľné in/out), aj manuálny klip (I/O body). Playlisty (pomenované, drag&drop poradie), prehrávanie playlistu v appke vrátane freeze-frame kresieb.
7. Export playlistu do jedného MP4 (720p, H.264, AAC): každý klip orezaný, kresby vypálené ako PNG overlay počas freeze-frame (zastavený záber + kresba na N s), progress bar, možnosť zrušiť. Krátky titulok na začiatku klipu (názov tagu, hráč, minúta).
8. Štatistiky: počty tagov podľa kategórie, tímu, hráča a polčasu; export CSV.

KVALITA: čistá štruktúra (components/, store/, lib/ffmpeg/, lib/db/), typy, žiadny mŕtvy kód. Otestuj build (npm run build) a základné flowy (Playwright smoke test s krátkym testovacím videom vygenerovaným cez ffmpeg). Vytvor CLAUDE.md (architektúra, dátový model, ako spustiť) a README po slovensky. Do CLAUDE.md zapíš roadmapu Fáza 2+: kresby sledujúce hráča (keyframes), desktop export (Tauri + natívny ffmpeg), heatmapy a mapy striel, porovnanie zápasov, zdieľanie s hráčmi, multi-user/SaaS.

NASADENIE: pridaj GitHub Actions workflow na deploy do GitHub Pages (Vite base path podľa názvu repa) a nastav potrebné COOP/COEP hlavičky pre ffmpeg.wasm (na Pages cez coi-serviceworker).
