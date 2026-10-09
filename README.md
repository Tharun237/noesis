# Noesis

**Listen to any document.** Research papers, books, articles and notes, turned into natural audio *on your own device*.
Free for everyone, no limits, works offline. Install it from the browser. No app store needed.
Sign in with Google (optional) and your library follows you between laptop and phone, to the word.

> *Noesis* (νόησις): the Greek word for immediate understanding, the moment an idea becomes clear.

## What it does

- **Reads what matters.** Running headers, page numbers, citation markers, URLs, tables of contents, indexes and reference lists are removed before listening.
- **Natural voices, on-device.** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) runs in your browser, on WebGPU when available and WebAssembly everywhere else. 28 English voices (US and UK).
- **Every format.** PDF, EPUB, DOCX, HTML, Markdown, plain text, pasted text and web links. arXiv links fetch the paper itself, not the abstract page.
- **Read along.** The reader highlights the sentence being spoken *and the word within it*. Tap any sentence to jump there. A contents sidebar shows every chapter with its timestamp, and "Back to now" returns you to the playhead.
- **Reading comfort.** Literata (Google's long-form reading typeface) or DM Sans, with adjustable size, line spacing, column width and justification.
- **Bookmarks & notes, search.** Bookmark the sentence you are hearing and attach a note. Find any phrase in the document.
- **Ask about the document.** Chat with the document using your own Gemini key. It knows which sentence you are hearing ("explain what I just heard"), and answers can be read aloud in the same voice.
- **A real player.** 0.5–4× speed, previous/next sentence, a sleep timer (minutes or end of chapter), skipping figure and table descriptions, plus lock-screen, headset and car controls through the Media Session API.
- **Library.** Queue, archive, collections, search and sort. Listening position is remembered per document.
- **Sync across devices.** Sign in with Google and your documents, listening position (sentence *and* word), bookmarks and collections sync automatically. Pause on your laptop, open your phone, keep listening. Book text syncs, audio doesn't: each device voices locally, so sync stays tiny. Signing in is optional; without it Noesis is fully local.
- **Scanned books.** Noesis detects OCR'd scans structurally (an invisible text layer over page images) and repairs typical OCR errors on-device with a dictionary ("Pretace" → "Preface", "1 didn't" → "I didn't"). For the cleanest result it offers AI narration, which reads the page images directly.
- **Export.** Save the whole book as one `.opus` audio file, or export the transcript as Markdown.
- **Optional AI (bring your own key).** With a free [Google Gemini key](https://aistudio.google.com/apikey), Gemini reads each PDF page *as an image*. It describes figures and tables, speaks math in words, reads scanned PDFs, and writes **long or short summaries**. Your key stays on your device and is sent only to Google.
- **Installable PWA.** Install it to your home screen, share links or text to it from Android's share sheet, open documents with it on desktop, and listen offline.

## Why it costs nothing to run

| Work | Where it runs | Cost |
|---|---|---|
| Parsing PDF/EPUB/DOCX/HTML | your browser | free |
| Voice generation (Kokoro-82M) | your device (WebGPU / WASM) | free |
| Audio storage (Opus, ~30 kbps) | your browser (IndexedDB) | free |
| AI narration & summaries | Google Gemini, with *your* key | Google's free tier |
| Fetching web links | one tiny Cloudflare Pages Function | Cloudflare free tier |
| Accounts & sync | Cloudflare Pages Functions + D1 (text, positions, bookmarks; never audio) | Cloudflare free tier |

A 5-hour book takes about 65 MB once voiced (32 kbps Opus muxed into Ogg by Noesis itself), versus about 860 MB as WAV.

## Architecture

```
file / text / link
   │  src/ingest/*          pdf.js · EPUB (JSZip + OPF spine) · DOCX (mammoth) · HTML (Readability) · Markdown
   ▼
blocks {k: h | p | fig | table | math | code, text}
   │  optional: src/lib/gemini.js   page images + text layer → narration blocks; or long/short summary
   ▼
src/lib/text.js           cleanup (citations, URLs, ligatures, abbreviations) · LaTeX → words · Intl.Segmenter sentences
   ▼
src/lib/library.js        two loops: PREP (parse/AI) and VOICE (one sentence at a time, following the playhead)
   │  src/lib/tts.worker.js     Kokoro-82M in a Web Worker → WebCodecs AudioEncoder (Opus)
   ▼
IndexedDB (idb-keyval)    meta · content · audio (one record per sentence)
   ▼
src/lib/player.js         <audio> + Ogg muxer (src/lib/audio-format.js) · Media Session · sleep timer
```

- **Frontend:** React 19 + Vite 8, inline styles with design tokens in `src/theme.js`, Motion for animation (transform/opacity only).
- **Backend (Cloudflare Pages Functions + D1):**
  - `/api/fetch` fetches public links for import. It blocks private and loopback addresses, non-standard ports and credentials in URLs, re-validates every redirect, and caps size at 60 MB.
  - `/api/auth/*` is Sign in with Google: an OAuth authorization-code flow with PKCE and a full-page redirect (no popups, so it works with cross-origin isolation and inside the installed app). Sessions are random tokens in HttpOnly cookies; only their SHA-256 is stored.
  - `/api/sync` stores per-user records with last-writer-wins on client time (clamped against future clocks) and hands out changes by cursor. Book text is gzipped and stored in parts. Offline edits queue up and land later.
  - `server/*.js` holds the handlers; Vite serves the same code in development via `getPlatformProxy` (local D1).
- **Offline:** a Workbox service worker precaches the app. The voice model, voices and the ONNX runtime are cached on first use.

## Run it

```bash
npm install
npx wrangler d1 migrations apply noesis-sync --local   # local database for accounts & sync
echo DEV_LOGIN=1 > .dev.vars                            # optional: test sign-in on localhost without Google
npm run dev        # http://localhost:5180
npm test           # unit tests (text cleanup, segmentation, Ogg muxer, OCR repair)
npm run build      # production build in dist/
```

The first time a document is voiced, the browser downloads the voice model once: about 90 MB (compact build, used on phones) or about 330 MB (WebGPU build, used on computers). After that it works offline.

## Deploy (free)

Cloudflare Pages serves `dist/` plus the `functions/` directory:

```bash
npx wrangler d1 create noesis-sync                     # put the id in wrangler.toml
npx wrangler d1 migrations apply noesis-sync --remote
npm run build
npx wrangler pages deploy dist --project-name noesis
```

**Sign in with Google:** create an OAuth client (type *Web application*) in Google Cloud Console, add the redirect URI `https://<your-domain>/api/auth/callback`, then set the two values on the Pages project:

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name noesis
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name noesis
```

`public/_headers` sets cross-origin isolation (`COOP: same-origin`, `COEP: credentialless`), which lets voice generation use multiple CPU threads.

**Free-tier note:** Pages Functions share the Cloudflare account's 100k requests/day. Sync is frugal (it pushes on pause and when you leave the app, pulls when you return, and polls every 90 s while open), but a popular deployment should live on its own Cloudflare account.

## Honest limits

- **Speed depends on your device.** On a desktop GPU, Kokoro voices text many times faster than real time. On a phone's CPU it can be slower than real time. Noesis always voices *ahead of where you are listening*, and audio is kept, so it is only ever generated once.
- **Scanned PDFs:** on-device repair fixes common OCR confusions conservatively (tuned on real books to avoid false fixes), but it can't recover badly garbled words. AI narration (your Gemini key) reads the page images and is the high-accuracy path. Image-only scans with no text layer need AI mode.
- **Rule-based cleanup is heuristic.** Unusual layouts can leave a stray line. AI narration is the high-accuracy path.
- **Sync isn't end-to-end encrypted.** Your library's text and positions are stored under your Google account ID, protected by sign-in, like most reading apps. Audio never leaves your device.
- **English voices only** for now. Kokoro-82M's web build ships English voices; a multilingual engine (Piper) is the planned next step.

## License

MIT. Voices: Kokoro-82M (Apache-2.0).
