# Noesis

**Listen to anything. Understand it.**

Papers, books and articles, read to you in a natural voice that is made on your own device.
Live at [noesisaudio.com](https://www.noesisaudio.com). Free to use, open source under the
[GNU AGPL-3.0](LICENSE).

> *Noesis* (νόησις): the Greek word for understanding, the moment an idea becomes clear.

## Why it is open

Noesis makes promises about your documents: they stay on your device, the audio is made there, and signing in
keeps your library in your own Google Drive, never on a server of ours. A promise like that is worth more when
anyone can check it. So the code is here, all of it, for anyone to read, run and improve.

## What it believes

- **Your device does the work.** The voice, the translation and the reading run in your browser. Nothing is
  uploaded to make the audio, and it keeps working without a connection.
- **Your data stays yours.** No advertising, no tracking cookies, nothing sold. Sync is your own Google Drive.
  AI features use your own key, and only when you turn them on.
- **One of everything.** Each screen has one purpose, each control one place. Motion is transform and opacity,
  and it means something: where a thing came from and where it went.
- **Built for interrupted people.** Phones close apps halfway through. Every write survives it; damaged data is
  healed when the app opens again.

## What it does

- **Reads what matters.** Page numbers, running headers, citation markers and reference lists are taken out
  before listening. Tables and figures are described, not read cell by cell.
- **Natural voices, made on your device.** 19 [Piper](https://github.com/rhasspy/piper) voices in 9 languages,
  run in WebAssembly. Each downloads once and then works offline. With your own key, NVIDIA and Gemini voices
  are offered too, or any voice service that speaks the OpenAI protocol.
- **Every format.** PDF, EPUB, Word, web pages and links (arXiv links fetch the paper itself), Markdown, plain
  and pasted text.
- **Three ways to follow.** Text, with the word being spoken filling in as it is said; Pages, the original page
  with the sentence marked on it; Focus, one word at a time, which needs no sound at all.
- **In your language.** A document can be translated on your device (Firefox Translations models) and read in
  English, Hindi, Telugu, Spanish, French, German, Italian, Portuguese or Vietnamese.
- **A progress bar with feeling.** The player's line follows the mood of the writing: it rises where the book is
  brighter and falls where it is darker.
- **Ask the document.** With your own AI key (Gemini, NVIDIA, or any OpenAI-compatible provider): summaries,
  questions, figures described, scanned pages read.
- **Every device, one library.** Sign in with Google and your documents, your place (to the word), bookmarks,
  settings and listening follow you, kept in a hidden folder of your own Drive.
- **An installable app.** Lock-screen and headset controls, a sleep timer, saved audio files, offline use.

## Where each thing runs

| Work | Where |
|---|---|
| Reading PDF, EPUB, Word, HTML | your browser |
| Voices (Piper, ONNX Runtime) | your device, in a Web Worker |
| Translation (bergamot-translator) | your device |
| Audio (Opus, in IndexedDB) | your device; it never leaves it |
| Sync | your own Google Drive (`drive.appdata`), straight from your browser |
| AI and online voices | the provider you choose, with your key |
| Fetching a web link, renewing the Drive pass, the NVIDIA relay | small Cloudflare Pages Functions in `functions/` |

## Run it

Node 20.19 or 22.12 and newer (what Vite asks for).

```bash
npm install
echo DEV_LOGIN=1 > .dev.vars   # optional: sign in on localhost without Google
npm run dev                    # prints the local address
npm test                       # unit tests
npm run build                  # production build in dist/
```

End-to-end walks live in `e2e/` (Playwright, with your installed Chrome): `qa.mjs` walks every feature,
`chaos.mjs` is an impatient random customer, `sweep.mjs` checks every transition and the Back gesture. Each says
at the top how to run it.

## Run your own copy

Cloudflare Pages serves `dist/` and the `functions/` directory:

```bash
npm run build
npx wrangler pages deploy dist --project-name <your-project>
```

For Sign in with Google, create an OAuth client (type *Web application*) in a Google Cloud project with the
Drive API turned on, add `https://<your-domain>/api/auth/callback` as a redirect address, and give the project
its two secrets:

```bash
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <your-project>
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <your-project>
```

There is no database to create. If you run a changed copy for other people, the AGPL asks you to offer them
its source too.

## Licence

Copyright © 2026 Tharun Gundu.

Noesis is free software: you can redistribute it and change it under the terms of the
[GNU Affero General Public License, version 3](LICENSE). It comes with no warranty.

The voices, models, fonts and libraries it uses keep their own licences; the app lists each one in
Settings → About → Credits and licences, and `src/lib/voices.js` names each voice's. eSpeak NG is GPL-3.0 and is
shipped as its own files with its licence (`public/espeak/COPYING.txt`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
