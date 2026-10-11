# Noesis roadmap

Source: Tharun's feature brief of 2026-10-11. Sorted by what unblocks trust first, then core gaps, then the
AI features, then insight features. Every item keeps its original intent; nothing was dropped silently.

## How the work is done

| Role | Who | Does |
|---|---|---|
| Manager, architect, verifier | Opus (this session) | Specs, review of every diff, stress tests, QA run, deploy. Writes little code itself. |
| Builder | Muse Spark 1.3 (`opencode run -m opencode/muse-spark-1.3-contributor-free`) | One build task at a time on a branch, from a written spec. |
| Researcher, auditor, bulk edits | Haiku 5.5 (session agents) | Read-only sweeps, audits, reports, mechanical changes. |

Rules: one writer in the repo at a time; a task is done only when `npx vite build` is clean, `npm test` passes,
`node e2e/qa.mjs` passes on a freshly started dev server, and the result was looked at on a phone-sized screen.

## Constraints that shape everything

- **Free to run.** No paid servers. Voices on the device (Piper). Hosting on Cloudflare's free tier.
- **AI features need a language model.** Options, to decide (see "Decisions"): each user's own free Gemini key
  (built already), or one shared key behind our server. NVIDIA's free API is for development and testing:
  about 40 requests a minute for the whole account, and by third-party reading of its terms not for serving
  real customers (official terms not yet read). Good for building and testing; not a foundation for customers.
- **It is a web app.** Some items need things a browser cannot do (see "Not possible as a web app").
- **Phones first** (Android skins: MIUI/HyperOS, OxygenOS, ColorOS; and iPhone). No iPhone has been tested yet.

## Sprint 1: trust and basics (now)

1. **Status messages audit.** Every message must be true right now and about something the user is waiting
   on. Sweep every screen and transition (open, reload, back, add, play). *Haiku audits, Opus fixes.*
2. **Android notification on real phones** (not showing on Poco X3 Pro / MIUI). Add a diagnostics panel so the
   phone can tell us what it sees; then fix. Show the sentence being read in the notification (title updates
   per sentence). Word-by-word inside a notification is not possible from a web app.
3. **Voice quality** ("robotic", "bathroom"). Compare the 11 voices by measurement and ear, choose a better
   default, add an equalizer with presets. Decide where the EQ lives: at playback (instant, but may break
   background audio on Android) or at generation (safe, needs re-generation).
4. **Listening skill for Claude.** A repeatable way to test audio like a listener: transcribe generated speech
   and compare with the text (wrong words, skipped words), measure gaps and clicks at sentence joins, loudness,
   clipping, reverb. So audio is verified without Tharun's ears every time.

## Sprint 2: core gaps

5. **Original view.** The source page (PDF) beside or instead of the flowing text, following the playhead and
   highlighting the sentence being read; later the dual-pane "glass" view.
6. **Languages.** Translate a document into Hindi, Telugu and more (Piper has Hindi, Telugu, Malayalam,
   Marathi, Bengali, Urdu, Nepali voices, verified 2026-10-11). Natural translation that keeps names, terms,
   code and equations. Switch language mid-session without losing the place.
7. **AI provider layer.** One interface for "ask a model", with the provider chosen in Settings.
8. **Motion pass.** Frame-by-frame transitions modelled on the ACS categories page; premium phone feel
   (Dynamic-Island-style live status), desktop and phone, browser compatibility.

## Sprint 3: AI listening features

9. Equation and code breakdown mode (explain the idea before the symbols).
10. Selective depth: skim a section as a one-minute summary, or read it word for word.
11. Citation audio cards (10-second preview of a cited paper, then back).
12. Interrupt and clarify ("Pause, explain that"), by tap or voice.
13. Hands-free bookmarks and voice snippets (last 15 seconds + transcript into Key Takeaways).
14. "Where you left off" recaps; character and argument cards.

## Sprint 4: library intelligence and insight

15. Multi-paper audio briefing (3 to 5 PDFs: overlaps, conflicts, shared methods).
16. Ask my entire library (cross-book answers with page and time references).
17. Personal reading retrospective (monthly and yearly, with an audio briefing).
18. Whole-history knowledge graph; spatial reading canvas (concept map that scrubs audio).
19. Emotional arc waveform; vocabulary heatmap.
20. Interactive equation exploder.
21. Plot sonification; binaural study mode.
22. For deaf and hard-of-hearing readers: kinetic prosody typography, haptic rhythm (Android only: iPhone
    browsers have no vibration API), RSVP high-speed reading.

## Not possible as a web app (parked, with the reason)

- **Apple Watch / Wear OS / Garmin apps.** These are native apps with their own stores and fees.
- **Earbud noise-cancelling and sensor integration.** Browsers get no access to earbud sensors. A reduced
  version (lower speed in noise, pause when you speak, using the phone microphone while the app is open) is
  possible and is parked under Sprint 4.
- **Word-by-word text inside the system notification.** The notification shows title, artist, artwork and
  buttons only. Sentence-level is possible (item 2).

## Skills to create for Claude

- **Listening** (item 4).
- **Goods and services**: market, geography, selling mode, customer needs and feedback, pricing and
  business models for Noesis as a private, commercial product.
- **Dynamic skill development**: when a situation needs a skill that does not exist, write it.

## Decisions needed from Tharun

1. **Who pays for the AI?** Each user's own free Gemini key (zero cost, one setup step per user) or a shared
   key on our server (smooth for users, real cost and abuse risk once there are customers).
2. **Private and commercial.** The GitHub repository is public under the MIT licence today. Going private is
   one command; say when. (The voices offered are already limited to licences that allow commercial use.)
3. **iPhone.** Nothing has been tested on an iPhone. Is there one to test with?
