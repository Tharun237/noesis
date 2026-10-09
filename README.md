# Noesis

**Listen to any document.** Research papers, books, articles and notes, turned into natural audio *on your own device*.
Free for everyone, no account, no limits, works offline. Install it from the browser. No app store needed.

> *Noesis* (νόησις): the Greek word for immediate understanding, the moment an idea becomes clear.

## What it does

- **Reads what matters.** Running headers, page numbers, citation markers, URLs, tables of contents, indexes and reference lists are removed before listening.
- **Natural voices, on-device.** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) runs in your browser, on WebGPU when available and WebAssembly everywhere else. 28 English voices (US and UK).
- **Every format.** PDF, EPUB, DOCX, HTML, Markdown, plain text, pasted text and web links. arXiv links fetch the paper itself, not the abstract page.
- **Read along.** The reader highlights the sentence being spoken. Tap any sentence to jump there. A table of contents comes from the document's headings.
- **A real player.** 0.5–4× speed, previous/next sentence, a sleep timer (minutes or end of chapter), skipping figure and table descriptions, plus lock-screen, headset and car controls through the Media Session API.
- **Library.** Queue, archive, collections, search and sort. Listening position is remembered per document.
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
- **Backend:** `functions/api/fetch.js`, a Cloudflare Pages Function that fetches public links for import. It blocks private and loopback addresses, non-standard ports and credentials in URLs, re-validates every redirect, and caps size at 60 MB. Vite serves the same handler in development.
- **Offline:** a Workbox service worker precaches the app. The voice model, voices and the ONNX runtime are cached on first use.

## Run it

```bash
npm install
npm run dev        # http://localhost:5180 (any device on your Wi-Fi can open it too)
npm test           # core unit tests (text cleanup, segmentation, Ogg muxer)
npm run build      # production build in dist/
```

The first time a document is voiced, the browser downloads the voice model once: about 90 MB (compact build, used on phones) or about 330 MB (WebGPU build, used on computers). After that it works offline.

## Deploy (free)

Cloudflare Pages serves `dist/` plus the `functions/` directory:

```bash
npm run build
npx wrangler pages deploy dist --project-name noesis
```

`public/_headers` sets cross-origin isolation (`COOP: same-origin`, `COEP: credentialless`), which lets voice generation use multiple CPU threads.

## Honest limits

- **Speed depends on your device.** On a desktop GPU, Kokoro voices text many times faster than real time. On a phone's CPU it can be slower than real time. Noesis always voices *ahead of where you are listening*, and audio is kept, so it is only ever generated once.
- **Scanned PDFs** have no text layer. Rule-based mode can't read them; AI mode (your Gemini key) can.
- **Rule-based cleanup is heuristic.** Unusual layouts can leave a stray line. AI narration is the high-accuracy path.
- **English voices only** for now. Kokoro-82M's web build ships English voices; a multilingual engine (Piper) is the planned next step.

## License

MIT. Voices: Kokoro-82M (Apache-2.0).
