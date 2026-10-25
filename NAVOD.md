# Analýza zápasu – ako spustiť v Claude Code

## A) Cez telefón (cloud, beží aj cez noc)
1. github.com → New repository → `match-analysis` (prázdne).
2. Appka Claude → Code → prepoj GitHub → vyber repo.
3. Vlož celý obsah `PROMPT_claude_code.md` → spusti.
4. Ráno: branch/PR v repe. Appka pôjde cez GitHub Pages link (Settings → Pages → Source: GitHub Actions).

## B) Na PC (Claude Code lokálne)
1. Otvor terminál v tejto zložke: `claude`
2. Napíš: `Prečítaj PROMPT_claude_code.md a postav to v tejto zložke.`
3. Spustenie: `npm install` → `npm run dev` → otvor v Chrome.
