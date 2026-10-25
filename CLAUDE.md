# CLAUDE.md – Analýza zápasu

Poznámky pre Claude (a pre budúce ja), aby bolo jasné, čo appka robí, ako je
poskladaná, a čo má zmysel robiť ďalej.

## Čo appka robí (Fáza 1 – MVP)

Webová appka na video analýzu futbalových zápasov, štýl Hudl/Once:

- Otvorenie lokálneho MP4 (napr. export z Veo), celé spracovanie v browseri,
  nič sa nikam neuploaduje.
- Projekty (zápas, súper, dátum, súťaž, súpiska), autosave do IndexedDB.
- Tagovanie herných fáz/udalostí klávesovými skratkami, s tímom/hráčom/polčasom.
- Timeline s farebnými značkami + filtrovateľný zoznam tagov.
- Kreslenie na zastavený záber (šípky, čiary, kruhy, spojnice, zóny, text),
  s "freeze-frame" prehrávaním kresby počas playbacku.
- Klipy (z tagu alebo manuálne cez I/O body) a playlisty (drag&drop poradie).
- Export playlistu do jedného MP4 (720p H.264/AAC) cez ffmpeg.wasm, s vypálenými
  kresbami a krátkym titulkom na začiatku klipu.
- Štatistiky (počty podľa kategórie/tímu/hráča/polčasu) + export CSV.

## Stack

- **Vite + React + TypeScript + Tailwind**
- **Zustand** – ephemeral UI stav (prehrávanie videa, aktívny tím/hráč,
  nástroje kreslenia, I/O body, fronta prehrávania klipov...). Nič z toho sa
  neukladá – je to len "runtime" stav editora.
- **Dexie (IndexedDB)** + `dexie-react-hooks` (`useLiveQuery`) – perzistentné
  dáta (projekty, súpiska, tagy, kresby, klipy, playlisty). Komponenty čítajú
  dáta reaktívne priamo z DB, nie je potrebný žiadny ďalší cache layer.
- **ffmpeg.wasm 0.12** (`@ffmpeg/ffmpeg`, `@ffmpeg/core`, `@ffmpeg/core-mt`) –
  strih a export. Core súbory sa buildujú lokálne do appky (vite-plugin-static-copy
  kopíruje `node_modules/@ffmpeg/core*/dist/umd` do `dist/ffmpeg/...`), appka
  teda nezávisí od CDN.
- **@dnd-kit** – drag&drop poradie klipov v playliste.
- Video súbor **sa nikdy neukladá do IndexedDB** – je príliš veľký. Pri exporte
  sa veľký súbor mountuje do ffmpeg.wasm cez `WORKERFS` (`ffmpeg.mount`), takže
  sa nekopíruje celý do pamäte; ak mount zlyhá (napr. nepodporovaný browser),
  fallback je `fetchFile` + `writeFile` (celý súbor do pamäte).

## Dátový model (`src/types/index.ts`, `src/lib/db/db.ts`)

```
Project 1---* Player
Project 1---* TagType (predvolené + vlastné, zasiate pri vytvorení projektu)
Project 1---* TagEvent (tag v čase: tagTypeId, team, playerId?, timestamp, half, note?)
Project 1---* Drawing (kresba naviazaná na timestamp, obsahuje Shape[], durationSec)
Project 1---* Clip (inPoint/outPoint, voliteľne sourceTagEventId)
Project 1---* Playlist (clipIds: string[] – poradie je poradie prehrávania/exportu)
```

Shape je discriminated union (`arrow | line | dashedLine | ellipse | polyline | zone | text`),
súradnice **normalizované 0..1** voči rozmerom videa – vďaka tomu je kresba
nezávislá od veľkosti okna/exportného rozlíšenia. Vykresľovanie je v
`src/lib/drawing/renderShapes.ts` – **jedna funkcia sa používa na živé
prekrytie videa aj na generovanie PNG pre export**, takže export vizuálne
zodpovedá tomu, čo užívateľ videl v appke.

## Architektúra komponentov

```
src/
  types/          – dátový model (TS typy)
  store/          – useAppStore (Zustand) – ephemeral stav editora
  lib/
    db/           – Dexie schéma + CRUD operácie (operations.ts) + predvolené tagy
    drawing/      – renderShapes.ts (canvas vykresľovanie tvarov)
    ffmpeg/        – ffmpegClient (load/mount), overlayRenderer (PNG z kresby/titulku),
                     exporter.ts (orchestrácia celého exportu)
    utils/        – id, time formatting, CSV
  hooks/
    useKeyboardShortcuts.ts – globálne klávesové skratky (viazané na projectId)
  components/
    Project/      – ProjectHome (zoznam/vytvorenie/import), RosterEditor
    VideoPlayer/  – <video> + ovládanie + freeze-frame logika + vstupný bod pre kreslenie
    DrawingCanvas/– canvas overlay, useDrawingEditor (shapes + undo/redo), toolbar
    Timeline/     – Timeline (farebné značky), TagList (filter/edit/delete)
    Tagging/      – TaggingPanel (tím/hráč/polčas + tlačidlá tagov), TagEditorModal
    Clips/        – ClipManager (I/O body, zoznam klipov), PlaylistEditor (dnd-kit)
    Export/       – ExportDialog (spúšťa PlaylistExporter, progress/cancel)
    Stats/        – StatsPanel (agregácie + CSV export)
    Layout/       – Header, MatchEditor (hlavný layout, tabs v sidebari)
    common/       – Modal
```

### Prehrávanie klipov/playlistu

`useAppStore.playQueue` je zoznam klipov, ktoré sa majú postupne prehrať.
`VideoPlayer` sleduje `currentTime` a keď prekročí `outPoint` aktuálneho klipu,
posunie sa na ďalší (seek na jeho `inPoint` + `play()` po evente `seeked`).
Používa sa to pre: náhľad jedného klipu aj pre prehrávanie celého playlistu –
je to ten istý mechanizmus (`startPlayQueue([clip])` vs. `startPlayQueue(clips)`).

### Freeze-frame kresby pri prehrávaní

`VideoPlayer` má `useLiveQuery` na `drawings` projektu. Pri `timeupdate` ak
`currentTime` prejde cez `drawing.timestamp` (a nejde o kreslenie), video sa
zapauzuje, kresba sa zobrazí `durationSec` sekúnd (reálny `setTimeout`), potom
sa video pustí ďalej. Toto funguje rovnako počas normálneho prehrávania aj
počas prehrávania klipu/playlistu.

### Export (`src/lib/ffmpeg/exporter.ts`)

Pre každý klip v playliste:
1. Strih + scale na 1280×720 + re-encode (libx264/aac) → `clip_i_base.mp4`.
2. Vypálenie titulku (PNG canvas prekrytie prvé ~2.5s) → `clip_i_titled.mp4`.
3. Ak klip obsahuje kresby (timestamp v rozsahu klipu): klip sa rozdelí na
   segmenty (normálne úseky + "freeze" úseky), freeze úsek = extrahovaná
   snímka + PNG prekrytie kresby, zafixované na `durationSec` (still video +
   ticho audio), segmenty sa spoja `concat` demuxerom (rovnaké kódovanie =
   rýchly stream-copy concat).
4. Finálne klipy sa spoja do jedného `output.mp4` (opäť `concat` + `-c copy`).

Progress/cancel: `PlaylistExporter` počíta hrubý odhad celkových krokov a
reportuje `fraction` po každom ffmpeg príkaze; `cancel()` zavolá
`ffmpeg.terminate()` (skutočné prerušenie behu), čo sa odchytí a vyhodí ako
`ExportCancelled`.

## Ako appku spustiť

```bash
npm install
npm run dev        # http://localhost:5173 (COOP/COEP hlavičky nastavené vo vite.config.ts)
npm run build       # produkčný build do dist/
npm run preview     # lokálny preview produkčného buildu
```

### Testy

```bash
npm run gen:testvideo   # vygeneruje e2e/fixtures/test-match.mp4 (ffmpeg-static, nezávisle od systémového ffmpeg)
npm run test:e2e        # Playwright smoke test (naštartuje preview server sám)
```

Smoke test pokrýva: vytvorenie projektu → otvorenie videa → tag klávesovou
skratkou → manuálny klip cez I/O body → playlist → štatistiky. **Export cez
ffmpeg.wasm sa v smoke teste netestuje** (je pomalý a náročný na CPU v headless
CI prostredí) – treba ho overiť manuálne v reálnom browseri.

## Nasadenie (GitHub Pages)

- `.github/workflows/deploy.yml` – build s `VITE_BASE_PATH=/<nazov-repa>/`
  (Vite `base`), deploy cez `actions/deploy-pages`.
- `.github/workflows/ci.yml` – build + smoke test na každý PR/push.
- GitHub Pages nevie nastaviť COOP/COEP hlavičky zo servera → `public/coi-serviceworker.js`
  (registrovaný v `index.html`) ich dorobí v browseri, takže multithread
  ffmpeg.wasm (SharedArrayBuffer) funguje aj tam. Lokálne (`vite dev`/`preview`)
  sú hlavičky nastavené priamo v `vite.config.ts`.
- Pred prvým push treba v repe zapnúť **Settings → Pages → Source: GitHub Actions**.

## Known limitations / vedomé zjednodušenia Fázy 1

- Video sa po reloade stránky musí znova otvoriť (File System Access API na
  "pamätanie" súboru medzi session nie je implementované – pozri roadmapu).
- Krok po snímkach (`,`/`.`) predpokladá 25 fps (nezisťuje sa reálny fps zdroja).
- Minúta zápasu v 2. polčase nerieši nadstavený čas 1. polčasu (jednoduchý model).
- Kresba sa viaže na najbližší existujúci čas v okne ±0.4s (viacero kresieb
  tesne pri sebe sa môžu prepísať – vhodné pre MVP, nie pre husté kreslenie).

## Roadmapa – Fáza 2+

1. **Kresby sledujúce hráča (keyframes).** Namiesto jednej statickej kresby na
   timestamp: kresba má zoznam keyframes (čas → pozície bodov), medzi nimi sa
   interpoluje (lineárne) – šípka/kruh "pôjde" s hráčom počas freeze-frame
   alebo aj počas normálneho prehrávania (overlay sa priebežne prepočítava).
2. **Desktop export (Tauri + natívny ffmpeg).** Browser verzia je obmedzená
   výkonom ffmpeg.wasm pri dlhších/viacerých klipoch. Tauri wrapper by vedel
   spustiť natívny ffmpeg binárku (rýchlejšie, menej pamäťových limitov,
   priamy prístup k súborom bez `<input type=file>`).
3. **Heatmapy a mapy striel.** Z `TagEvent` by sa dali odvodiť pozície (treba
   doplniť x/y bod na hracej ploche pri tagovaní) a vizualizovať ako heatmapu
   / mapu striel nad pôdorysom ihriska.
4. **Porovnanie zápasov.** Agregácie cez viac projektov (štatistiky trendov,
   napr. počet vysokých presingov za posledných N zápasov).
5. **Zdieľanie s hráčmi.** Export jednotlivých klipov/poznámok pre konkrétneho
   hráča (napr. "všetky tvoje straty lopty"), bez nutnosti mať celú appku.
6. **Multi-user / SaaS.** Presun z IndexedDB na reálny backend (sync, viac
   trénerov na jednom projekte, verziovanie zmien, real-time spoluprácu).
7. **File System Access API** – `showOpenFilePicker` + uloženie handle (IndexedDB
   podporuje `FileSystemFileHandle` v Chromiu), aby sa video po reloade
   nemuselo znova vyberať manuálne (treba `requestPermission()` pri každom
   načítaní session).
