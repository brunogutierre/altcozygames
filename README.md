# Alt Cozy Games

The studio's website, **altcozygames.com**: static pages in `site/` served by a Cloudflare
Worker (`wrangler.jsonc`, `src/`).

- `site/` and `src/generated/` are generated in the app repository (private
  `AdvancedSudokuApp`): `npm run site -- ~/Dev/altcozygames`. Do not edit them by hand.
  Its `docs/links/README.md` has the link map.
- `src/routes.ts`: what the Worker does with addresses that match no file (duel and daily
  links with their own link preview, `/.well-known/assetlinks.json`, language-less short
  paths, old GitHub Pages paths). `src/worker.ts` turns that into responses.

```sh
npm install
npm test        # routes, in Node
npm run dev     # local preview on http://localhost:8787
```

Cloudflare deploys each push to `main` (Workers Builds, deploy command `npx wrangler deploy`).

## The old GitHub Pages site

`index.html` and `advanced-sudoku/` at the root are the first site
(https://brunogutierre.github.io/altcozygames/), still served by GitHub Pages: the first
duel links and the privacy policy URL point there. They will redirect to altcozygames.com once
the domain is live.
