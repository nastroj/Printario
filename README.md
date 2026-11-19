# Printario

Printario turns a public [Kytario](https://kytario.com) songbook into a print-ready booklet. Paste a songbook link, choose paper, margins, type and colors, and print or save a PDF from the browser.

![Printario](public/icons/icon-512.png)

## What it does

- **Imports real Kytario songbooks.** It resolves the public songbook API, reads the section/chord/lyric token format, and keeps song order, keys, capos and section labels.
- **Prints like Kytario.** A landscape page with two columns, section names in a left gutter, chords over the lyrics, Inter by default, and the same gray/blue rules. Each song starts and ends on its own page.
- **Gives you print control.** A4, A5, Letter or B5; portrait or landscape; one or two columns; independent margins; heading, lyric and chord sizes; line height; font style; paper tint; text and chord colors.
- **Auto-fits every song.** Short songs grow in type size and breathing room; long songs are shrunk just enough to stay on one page. A song that still cannot fit is flagged in the preview instead of silently losing lines.
- **Builds the whole book.** Optional cover page, clickable table of contents, page numbers, interpreter/capo details, section labels, and title/author ordering.
- **Prints pixel-perfect pages.** Every page is a fixed paper-sized article. `@page` is generated from the selected format and margins, so the preview and the PDF use the same geometry.
- **Works as a PWA.** Installable app shell, service worker, and an IndexedDB cache of recently opened songbooks for offline reading.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. In development, Vite runs through the same Express server that serves the API.

Production:

```bash
npm run build
npm start
```

`PORT` is supported, e.g. `PORT=8080 npm start`.

Docker:

```bash
docker build -t printario .
docker run --rm -p 5173:5173 printario
```

## Supported links

Paste any of these:

- `https://kytario.com/songbook`
- `https://kytario.com/<songbook-token>` (also with a locale prefix, e.g. `/en/...`)
- `https://kytario.com/songbooks/<token>/print`
- `https://kytario.com/projects/<project-token>` — if the project has exactly one public songbook
- `https://kytario.com/song/<song-token>` — single-song import
- A bare songbook token, e.g. `songbook`

The demo button loads three original songs from `server/demo.js`, so the preview can be explored without touching Kytario.

## Why is there a server?

Kytario's public songbook API does **not** send CORS headers, so a browser cannot call it from another origin. Printario includes a tiny Express proxy that:

1. validates that the link points to `kytario.com` (or `kytario.cz`),
2. fetches `https://kytario.com/api/songbooks/<token>/sections` and the songbook page metadata,
3. normalizes and caches the songbook for 10 minutes,
4. serves the built PWA.

The app is therefore a Node-hosted PWA, not a purely static site. For static hosting you would need to move `server/kytario.js` to a serverless function and point `/api/import` at it.

## Print tips

- Use **Print / Save as PDF** in the app. The app intercepts `Ctrl/Cmd+P` too.
- In Chrome's print dialog, set **Margins → None** and turn off **Headers and footers**. Printario draws its own margins and page numbers inside the paper.
- Background graphics should stay on if you choose a tinted paper or colored headings.
- A4 landscape is the default because it keeps Kytario's line lengths at a comfortable size. A5 is the compact option; type sizes scale automatically with the column width.
- Very large songbooks (300+ songs) take a moment to measure the first time; the studio shows a "Reflowing pages…" indicator.

## Project layout

```text
server/
  index.js         Express server, API routes, static hosting
  kytario.js       URL parsing, Kytario fetching, normalization, metadata
  demo.js          Original demo songbook
  kytario.test.js  Parser/importer unit tests
  song.test.js     Song model + Kytario layout/auto-fit unit tests
src/
  App.jsx          Studio state, import flow, print orchestration
  components/      Landing, settings, preview, paper page, song renderer, drawer
  lib/
    song.js        Kytario token -> named/inline section line model
    paginate.js    Column packing, shrink/grow-to-fit, front matter
    settings.js    Defaults, paper geometry, column type scale, persistence
    storage.js     IndexedDB cache and recent books
  styles.css       Studio UI, Kytario print typography, print CSS, responsive layout
public/
  manifest.webmanifest
  sw.js            App-shell service worker
  icons/           PWA icons
scripts/
  ui-smoke.mjs     jsdom end-to-end smoke test
```

## Tests

```bash
npm test       # URL parser, normalisation, song model and layout tests
npm run test:ui  # jsdom import -> measure -> preview -> contents -> print smoke test
```

The UI smoke test uses synthetic layout measurements because jsdom has no layout engine. Real measurements happen in the browser during the hidden pass.

## Notes and limitations

- Only **public** Kytario songbooks can be imported. Private songbooks require a Kytario session.
- Printario uses the browser's print engine to create the PDF. There is no server-side PDF renderer.
- Auto-fit is tuned for one song per page; the app always starts each song on a fresh page and shrinks unusually long songs so the whole song remains visible.
- `+` sections (Kytario's repeat shortcuts) hide their chords in the two-column print layout, matching Kytario. They show chords again in the single-column layout.
- Song content and copyright belong to the songbook authors. Respect Kytario's terms and the rights of the songs you print. Printario is an independent tool and is not affiliated with Kytario.
- Recently opened songbooks are cached locally for up to 30 days. Clear site data to remove them.

## License

The code in this repository is provided as a working project. The demo lyrics are original and included for testing. Imported Kytario content is not part of the project and remains subject to its authors' rights.
