# Paper2Audio teardown (customer-level), and what Noesis takes from it

Observed 2026-10-09/10 as a signed-in Free user on paper2audio.com (web). Method: using the product,
reading its public pages (FAQ, pricing) and watching its network traffic from the browser. No
decompiling and no reading of minified code.

## 1. Architecture as seen from the outside

| Aspect | Paper2Audio | Noesis |
|---|---|---|
| Where audio is made | Their servers. A job is started (`POST /v2/summarize`) and polled (`checkStatus?runId`) | The user's device (Kokoro, or the built-in voice) |
| Audio delivery | One `.m4a` file per document (Opus) from `files.paper2audio.com` | Per-sentence Opus in IndexedDB |
| Read-along data | Metadata JSON. Each segment has `startTime`, `itemDuration`, `transcript`, `page`, `type`, `headingLevel` and word timestamps. It also has `tableOfContents`, chunked `progressSegments` and `audioDuration` | Segments with per-sentence durations; word timing is estimated (Kokoro) or exact (built-in voice boundaries) |
| Accounts and sync | Firebase Auth and Firestore | Google OAuth to Cloudflare D1 (last-writer-wins records) |
| Cost model | Pays for GPUs, so it has weekly hour quotas | Zero marginal cost, so no quotas |

Consequence: Paper2Audio can promise "Ready in under 1 min" because a GPU farm does the work. Noesis
gets the same calm experience only by being honest about device speed (the readiness gate and the
measured speed) and by defaulting phones to the built-in voice.

## 2. Flows observed

### Add a document
- The sources are upload, link and paste. They also have a browser extension for pages behind a login.
- Before submitting, the user chooses these settings:
  - **Language:** Auto, English, or 10 languages in beta.
  - **Summary level:** Full, Long or Short.
  - **Voices:** three per document, one each for the document text, the summarized content and the additional context. There are 15 persona voices.
  - **Visual elements:** Summarize, Read in full, or Skip.
  - **Additional context:** None, Some or Lot. This is for papers only and explains terms in a separate voice.
- An **estimated processing time** is shown before submitting.
- After submitting, the library card shows **"Step N of 4 · <1 min left · Analyzing document / Generating audio"**.
- When the audio is ready:
  - A toast says **"Audio is ready for X · Open doc"**.
  - An email is sent.
  - An optional browser notification ("Notify me") fires.
- **Playback can't start until it's ready.** That is the rule the user asked us to copy, and Noesis now has it as the readiness gate.

### Reader
- **Two views, toggled from the menu:**
  - **Reader view:** a reflowed transcript with word highlighting.
  - **PDF view:** the original page, with page navigation (`1 / 228`), zoom (−, 100%, +) and **Invert colors**.
  - Users praise this toggle by name in reviews.
- **Left sidebar:** the table of contents with a timestamp for each entry.
- **Document menu:**
  - Share audio
  - Search
  - Bookmarks & notes (a right-hand panel with a filter and an overflow menu). The empty state says you can bookmark your spot, or select transcript text to highlight it and add notes.
  - Playback speed (0.5–4×)
  - Sleep timer: 15, 30 or 45 min, 1 hr, **End of chapter, End of doc** (each shown with the clock time it will stop), or **Custom H:M**
  - Change voices & settings (regenerates the audio)
  - **Skip summaries:** checkboxes for All, Images, Tables, Math sections and Code sections. The dialog explains that the doc was added with "Summarize".
  - Save audio, Export transcript, Add to collection, Reader view or PDF view, Invert colors, Report issue
- **Player bar:** title (editable), back 15 s, play, forward 15 s, volume, "6h 45m left (1.0x)", and the menu.

### Library
- **Filter:**
  - File type: PDF, Word, EPUB, Web article, Text, Markdown.
  - Status: Not started, In progress, Done.
- **Sort:** Queue order (Custom, drag to reorder; the default), Recent, Time added (oldest or newest), Title, Author, Duration, plus **"Set as default sort order"**.
- **Card menu:** Share audio, Select document (multi-select), Mark as listening, Archive, Add to collection, Change voices & settings, Save audio, Export transcript, Rate this audio, View and edit info, Report issue, Delete.

### Chat
- `/v2/chat` offers 4 starter questions. Each answer has **Copy** and **Source**, which jumps to the passage.

### Account settings
- **Usage:** the share of 56 h/week used, with a weekly reset.
- **Preferences:**
  - **Autoplay next document**
  - **Archive docs when finished**
- **Notifications:** an email when a doc is ready, and a browser notification when a doc is ready.
- **Attribution:** an "Audio by Paper2Audio" credit in generated audio. Only Plus can remove it.
- **RSS feed for podcast apps.**
- **Theme:** Light, Dark or System.
- Change password, sign out, delete account.

### Plans
- **Free:**
  - Limits: 56 h generation per week, 250 PDF pages, 250K EPUB words, 20K web words, 100 MB.
  - **Uploaded content may train their models.**
- **Plus ($12–16/mo):**
  - Higher limits.
  - **Export audio and transcripts.**
  - Removes the credit.
  - No training on your content.
- **Export is a paid feature for them.** Noesis gives it away, along with unlimited generation and no training, ever.

## 3. Gap analysis and build order

Legend: ✅ Noesis has it · 🟡 partial · ❌ missing. The order is by user value, then by fit with an
on-device, zero-cost design.

| # | Feature | Noesis today | Decision |
|---|---|---|---|
| 1 | Processing card: step N of M and time left; "ready" toast with Open; browser notification when ready | 🟡 percentage and readiness exist; no steps, no notification | **Build now.** Notification from the service worker; click opens the doc |
| 2 | Sleep timer: End of doc, Custom H:M, stop-time shown | 🟡 minutes and end of chapter | **Build now** (small) |
| 3 | Autoplay next document; archive when finished | ❌ | **Build now** (small, synced setting) |
| 4 | Highlights and notes from text selection, listed in the Bookmarks panel | 🟡 sentence bookmarks and notes only | **Build now** |
| 5 | Library filter by file type and status; author and duration sort; default sort | 🟡 basic filter and sort | **Build now** |
| 6 | Visual elements: Summarize, Read in full or Skip per document; Skip-summaries checkboxes by type (images, tables, math, code) | 🟡 one global "skip visuals" | **Build next.** Needs the segment `type` set during AI narration |
| 7 | PDF view of the original page, synced to the playhead, with invert colors | ❌ | **Build next.** pdf.js is already loaded; we keep the source PDF; map segment to page |
| 8 | Chat answers with **Source** that jumps to the passage | 🟡 Ask streams answers, no source link | **Build next** |
| 9 | "Change voices & settings" per document after adding | 🟡 voice can change; no re-prep with new options | Later |
| 10 | Custom drag queue order and multi-select bulk actions | ❌ | Later |
| 11 | Additional context (terms explained in a second voice); separate voice for summaries | ❌ | Later. Gemini can do this; costs the user's own quota |
| 12 | Languages beyond English | ❌ | Later: Piper (also the faster phone voice) |
| 13 | Share links (public or private) | ❌ | Later. Text-only share is possible on D1; the receiver voices it locally |
| 14 | RSS podcast feed | ❌ | **Not planned.** Needs server-hosted audio, which breaks the zero-cost design |
| 15 | Email "ready" notification | ❌ | **Not planned.** Generation happens on your own device, so a browser notification covers it |
| 16 | Theme Light / Dark / System | ❌ (dark only) | Ask before building |
| — | Unlimited generation, free export, offline in the browser, no training, open source | ✅ | Noesis advantages. Keep them visible in the README and the app |

## 4. Lessons

1. **Progress has to be legible.** "Step 2 of 4 · <1 min left" builds more trust than "Generating
   37%". Users accept waiting when they know what is happening and when it ends.
2. **Never start playback before it can finish without stalling.** Noesis's readiness gate
   (`src/lib/readiness-math.js`) enforces exactly this rule, with a proof by simulation.
3. **The original page matters.** The PDF and transcript toggle is a top-cited feature in their own
   reviews. A reflowed transcript alone isn't enough for papers with figures.
4. **Visual elements are a per-document choice**, not a global switch, and are reversible at listen time.
5. **Small session features carry long-listen retention:** autoplay next, archive when finished,
   and a sleep timer at end of doc.
