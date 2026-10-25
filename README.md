# Daily Quotes

A quiet, literary home-screen web app: one quote at a time, left-set like an epigraph.
Static PWA (HTML + CSS + vanilla JS), no backend, works offline. All your data stays on the phone.

## Install on iPhone

1. Open the site in Safari.
2. Share → **Add to Home Screen**.
3. Launch it once while online; after that it works in airplane mode.

## Using it

| Gesture | Meaning |
|---|---|
| Swipe right | A new random quote |
| Swipe left | Back through the quotes you've seen this session |
| Swipe up | "Stays with me" — shown more often |
| Swipe down | "Resting for now" — shown rarely for 3 days |

On a desktop browser the arrow keys do the same (→ new quote, ← back, ↑ resonates, ↓ not today).

- **+** adds your own quote (saved on this device only).
- **Share** renders a 1080×1350 image and opens the share sheet (choose *Save Image* there to keep it in Photos).
- **Theme** cycles Auto → Light → Dark.

## Adding seed quotes

Edit `quotes.json` and push to `main`. Each entry needs a unique, stable `id`:

```json
{ "id": "rumi-1", "text": "…", "author": "Rumi", "source": "Masnavi", "lang": "en" }
```

- `source` is optional; `lang` is `en` or `de` (only used for hyphenation / VoiceOver voice).
- Never reuse or rename an `id` — reactions (swipe up/down) are stored against it.
- Quotes you added in the app and all reactions are kept on the phone; redeploying never wipes them.

The service worker serves the cached copy first and refreshes it in the background, so a new
deploy appears on the **second** launch after it goes live. To force every device to re-fetch
everything at once, bump `VERSION` in `sw.js`.

## Files

```
index.html            app shell (theme applied before first paint)
styles.css            design tokens, layout, sheets
app.js                quotes, weighting, gestures, theme, add + share sheets
quotes.json           seed quotes
sw.js                 offline cache
manifest.webmanifest  home-screen metadata
fonts/                Newsreader (variable, self-hosted, OFL)
icons/                180 / 192 / 512 app icons
```

## Data on the device (`localStorage`)

| Key | Contents |
|---|---|
| `quotes.theme` | `auto` / `light` / `dark` |
| `quotes.user` | quotes added in the app |
| `quotes.reactions` | `{ id: { up, restUntil } }` |
| `quotes.recent` | last 5 shown ids |

Home-screen storage lives only on that phone — there is no backup or sync in v1.
