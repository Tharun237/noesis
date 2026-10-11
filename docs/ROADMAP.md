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

## Sprint 1: trust and basics (DONE 2026-10-11, all four deployed)

Shipped: status audit (M2), Android notification with the moving phrase and the enable-notifications guide (M4),
voice quality (M5: Alba default, measured pauses 310-410 ms, tone presets), the listening skill
(`.claude/skills/listening/`), and Safari readiness (refused play says so, true export format, iOS tags).
Still needs a human: Tharun's ears on Alba and the tones; a real iPhone for anything Safari.

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

## Sprint 2: core gaps (now; item 5 in build as M6)

5. **Original view.** The source page (PDF) beside or instead of the flowing text, following the playhead and
   highlighting the sentence being read; later the dual-pane "glass" view.
6. **Languages.** Telugu voices SHIPPED 2026-10-11 (M7, with the Credits and licences screen); Hindi waits for a voice with a usable licence. Translation SHIPPED 2026-10-11 (M8): any book into English, Telugu or Hindi, from Add a document or from the reader menu, with the customer's Gemini key; tested with a stand-in translator only, real-model quality unchecked. Spec: (docs/specs/M7-languages.md; measurements in docs/research/languages.md).
   The app's pronunciation library is English-only; a multilingual eSpeak build (24 MB, GPL-3.0, loaded only
   for non-English documents) covers the rest. Telugu has two voices a paid product may use; Hindi has none
   with a verified licence yet. Item 5 (sentence on the page) shipped 2026-10-11 as M6.
   Then: Translate a document into Hindi, Telugu and more (Piper has Hindi, Telugu, Malayalam,
   Marathi, Bengali, Urdu, Nepali voices, verified 2026-10-11). Natural translation that keeps names, terms,
   code and equations. Switch language mid-session without losing the place.
6b. **Online voices.** SHIPPED 2026-10-11 (M10): with the customer's NVIDIA key, 86 NVIDIA voices in 12 languages
    (Hindi, Spanish, French, German, Italian, Portuguese, Vietnamese, Chinese, Japanese, Korean, Arabic, English)
    appear wherever voices are chosen, and those languages become translation targets. Audio is stored and plays
    offline like any other. Tested with a real key; Hindi words not machine-verified (see the listening skill).
6c. **Own voice service + scanned pages with any provider.** SHIPPED 2026-10-11 (M11): any voice service that
    speaks the OpenAI speech protocol plugs in under Settings → Voice; AI narration of scanned pages works with
    any provider whose model sees images (tested: NVIDIA `z-ai/glm-5.3-flash` read a 2-page scan in 3.6 s);
    Ask sends a window around the listener's place and long summaries are built part by part for smaller models.
7. **AI provider layer.** SHIPPED 2026-10-11 (M9): Settings → AI lets the customer bring Gemini, NVIDIA (through a relay), or any OpenAI-compatible address; a model check finds the models that answer. Tested with a real NVIDIA key. Scanned-page reading is still Gemini-only.
8. **Motion pass.** PARTLY DONE 2026-10-12: the status strip became a live island (a pill that widens into
   the full card and slides its text; transforms only). Press feedback, springs, sheet and page transitions
   already existed. Still open: a frame-by-frame study against the ACS categories page, desktop refinement.
   Original item: Frame-by-frame transitions modelled on the ACS categories page; premium phone feel
   (Dynamic-Island-style live status), desktop and phone, browser compatibility.

## Sprint 3: AI listening features

Shipped 2026-10-11: items 10, 12 (by tap) and 14 (recap) as one-tap helpers in the Ask panel and the reader
menu: Explain that, Recap so far, Skim this section (with a jump to the next section), and a welcome-back
card after 8 hours away. Answers are spoken and the book carries on. Tested with a real NVIDIA key.
Item 9 in part: at an equation or code listing the Ask panel offers "Break this equation down" / "Walk
through this code" (not yet tried on a real equation). Still open: 11, 12 by voice, 13, the cards in 14.
The "Other" AI provider was walked for real on 2026-10-12 against a local OpenAI-compatible endpoint.

9. Equation and code breakdown mode (explain the idea before the symbols).
10. Selective depth: skim a section as a one-minute summary, or read it word for word.
11. Citation audio cards (10-second preview of a cited paper, then back).
12. Interrupt and clarify ("Pause, explain that"), by tap or voice.
13. Hands-free bookmarks and voice snippets (last 15 seconds + transcript into Key Takeaways).
14. "Where you left off" recaps; character and argument cards.

## Sprint 4: library intelligence and insight

Shipped 2026-10-12: item 22 in part (M15), Focus view: one word at a time with a fixed lime pivot letter;
follows the voice while it plays, or reads at 200 to 900 words a minute without it; emphasis shown larger.
Verified on a real document: the pivot stays at one x for every word, the place is saved. Not built: haptic
rhythm. Muse hit its rate limit mid-task; Opus wired the view into the reader and fixed the pivot.
Shipped 2026-10-12: item 17 in part (M14): a listening log on the device (time while sound really plays,
per day and document; streak; most listened) under the library's AI menu, and "Hear your month". Verified:
17 s of playback counted as 15 s and counting stops when paused. NOT run with a real model: the
retrospective text itself (it uses the same path as the briefing, which was). No yearly view, no sync.
Shipped 2026-10-12: item 15, Make a briefing (M13): 2 to 5 documents become one new document with headed
parts (what each says, where they agree and disagree, shared methods, what to read first). Tested with a real
NVIDIA key: about 2 s with a fast model; a reasoning model sat on "Writing the briefing" for over 2 minutes.
Shipped 2026-10-11: item 16, Ask your library (M12): keyword ranking on the device, the top passages go to
the customer's AI, the answer cites numbered passages and each opens its book at that place. Without an AI
key it still lists matching passages. Not yet: page and time references in the citation, spoken answers.

15. Multi-paper audio briefing (3 to 5 PDFs: overlaps, conflicts, shared methods).
16. Ask my entire library (cross-book answers with page and time references).
17. Personal reading retrospective (monthly and yearly, with an audio briefing).
18. Whole-history knowledge graph; spatial reading canvas (concept map that scrubs audio).
19. Emotional arc waveform; vocabulary heatmap.
20. Interactive equation exploder.
21. Plot sonification; binaural study mode.
22. For deaf and hard-of-hearing readers: kinetic prosody typography, haptic rhythm (Android only: iPhone
    browsers have no vibration API), RSVP high-speed reading.

## Limits of a web app, and the way around each

- **Apple Watch / Wear OS / Garmin apps.** Native apps with their own stores and fees: parked.
- **Earbud sensors and noise-cancelling.** Browsers cannot read earbud sensors. Approved 2026-10-11: build the
  version that uses the phone microphone while the app is open (slow down and boost clarity in noise, pause
  when the listener speaks). Sprint 4.
- **Word-by-word text outside the app.** The system notification only has title, artist, artwork and buttons,
  so the intent (see the words, control playback, without opening the app) is reached three other ways, each
  to be proven on a real phone:
  1. Notification text that moves with speech: the phrase being spoken, advancing every few words.
  2. Lock-screen artwork drawn by the app: the current sentence typeset as the "cover".
  3. A floating reader: the text with the lit word drawn to a small always-on-top window (picture-in-picture),
     with play, pause and skip.

## Skills to create for Claude

- **Listening** (item 4).
- **Goods and services**: market, geography, selling mode, customer needs and feedback, pricing and
  business models for Noesis as a private, commercial product.
- **Dynamic skill development**: when a situation needs a skill that does not exist, write it.

## Decisions (Tharun, 2026-10-11)

- **AI keys:** every customer brings their own (their own Google account for Gemini, or their own NVIDIA
  account). Noesis never pays for or stores a shared key. The provider layer (item 7) offers both.
- **Earbud-style awareness:** build the phone-microphone version.
- **Words outside the app:** find a way (three approaches above).
- **iPhone:** none available. Replicate with the WebKit engine in automated tests; this approximates Safari
  but is not an iPhone (install flow, audio policies and background behaviour still need a real device).
- **Open:** keep the code public under MIT, or make the repository private.
