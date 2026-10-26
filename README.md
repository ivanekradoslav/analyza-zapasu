# Analýza zápasu

Webová appka na video analýzu futbalových zápasov (v štýle Hudl/Once) – tagovanie
herných situácií, kreslenie na zastavený záber, strih klipov a export
playlistov do MP4. Celé spracovanie prebieha priamo v prehliadači, video sa
nikam neuploaduje.

## Funkcie

- **Video** – otvorenie lokálneho MP4 (napr. export z Veo), ovládanie
  medzerníkom (play/pauza), šípkami (±5 s), `,`/`.` (±1 snímka), rýchlosť
  0.5–2×.
- **Projekty** – zápas (súper, dátum, súťaž), súpiska hráčov, viac projektov,
  autosave, export/import projektu ako JSON (napr. pre zálohu alebo presun na
  iný počítač).
- **Tagovanie** – klávesové skratky pre herné fázy, udalosti a pressing;
  prepínanie tímu (`Tab`), voľba hráča (napísaním jeho čísla), poznámka;
  vlastné tagy (názov, farba, kategória, skratka).
- **Timeline** – farebné značky tagov pod videom, klik = skok na čas; zoznam
  tagov s filtrom (kategória/tím/hráč/polčas), editácia a mazanie.
- **Kreslenie** – šípka, čiara, prerušovaná čiara, kruh pod hráčom, spojnica
  medzi hráčmi (napr. línia obrany), zóna, text. Dva režimy:
  - **Freeze** – video sa na danom čase zastaví, kresba sa zobrazí na
    nastavenú dĺžku (default 4 s) a potom sa pokračuje v prehrávaní.
  - **Pohyblivá** – kresba ide s hráčmi: nakresli tvar, posuň video
    (+0.2s / +1s), nástrojom *Presunúť* potiahni tvar na novú pozíciu
    hráča – každý posun uloží kľúčový bod a medzi nimi sa pohyb dopočíta.
    Alebo **„Sledovať hráča automaticky“** – kruh pôjde s hráčom sám (až
    10 s); ak ho stratí, posunieš kruh späť a spustíš znova.
  Z ktorejkoľvek kresby vytvoríš klip jedným klikom (záložka Klipy → Kresby).
- **Klipy a playlisty** – klip jedným klikom z tagu (−5 s/+5 s, upraviteľné)
  alebo manuálne cez I/O body; playlisty s poradím cez drag&drop.
- **Export** – playlist sa dá exportovať do jedného MP4 (720p, H.264/AAC)
  vrátane vypálených kresieb a krátkeho titulku na začiatku klipu, s
  progress barom a možnosťou zrušiť.
- **Štatistiky** – počty tagov podľa kategórie/tímu/hráča/polčasu, export CSV.

## Spustenie

```bash
npm install
npm run dev
```

Otvor `http://localhost:5173` v Chrome alebo Edge.

```bash
npm run build      # produkčný build (dist/)
npm run preview    # lokálne vyskúšanie produkčného buildu
```

### Testy

```bash
npm run gen:testvideo   # vygeneruje krátke testovacie video
npm run test:e2e        # Playwright smoke test (základný flow appky)
```

## Nasadenie na GitHub Pages

1. Push do repozitára na GitHub.
2. V repe: **Settings → Pages → Source: GitHub Actions**.
3. Push do `main` spustí `.github/workflows/deploy.yml`, ktorý appku zbuildí
   a nasadí. Appka bude dostupná na `https://<užívateľ>.github.io/<repo>/`.

## Dáta a súkromie

Všetky dáta (projekty, tagy, kresby, klipy) sa ukladajú lokálne v prehliadači
(IndexedDB). Video súbor sa **nikdy neuploaduje** – appka ho číta priamo z
disku cez `object URL`. Export projektu ako JSON slúži na zálohu alebo presun
na iný počítač (video treba preniesť samostatne, appka si ho znova vypýta).

## Architektúra a ďalší vývoj

Pozri [CLAUDE.md](CLAUDE.md) – architektúra, dátový model a roadmapa pre
ďalšie fázy (kresby sledujúce hráča, desktop export, heatmapy, porovnanie
zápasov, zdieľanie s hráčmi, multi-user/SaaS).
