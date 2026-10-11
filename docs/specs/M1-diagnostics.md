# M1: Playback diagnostics panel

## Why
The Android media notification does not appear on a Poco X3 Pro (MIUI). We cannot see the phone. The app must
show what it sees, in one place, with a button that copies a plain-text report the user can paste to us.

## Scope: exactly these files
- NEW `src/ui/Diagnostics.jsx`
- EDIT `src/ui/Settings.jsx`: render `<DiagnosticsCard Card={Card} />` between `<StorageCard />` and `<AppCard />`.
- EDIT `src/lib/player.js`: add ONE export next to `stretchInfo`:
  `export const audioState = () => ({ paused: audio.paused, ended: audio.ended, readyState: audio.readyState, currentTime: audio.currentTime, duration: audio.duration, hasSrc: !!audio.src, rate: audio.playbackRate, volume: audio.volume, muted: audio.muted })`
Do not touch any other file. Do not add dependencies. Do not commit, push or deploy.

## The component
`export function DiagnosticsCard({ Card })` — `Card` is the settings card component passed in (same pattern as
`VoiceCard` in `src/ui/VoiceCard.jsx`; read that file and `Settings.jsx` first and match their style).

It shows rows of `label: value`, refreshed every second while the card is mounted (setInterval in useEffect,
cleared on unmount). Values, read fresh on each refresh:

App
- Version: `__APP_VERSION__`, build: `__APP_BUILD__` (globals defined by Vite; already used in Settings.jsx)
- Installed as app: `matchMedia('(display-mode: standalone)').matches`
- Service worker in control: `!!navigator.serviceWorker?.controller`
- Cross-origin isolated: `crossOriginIsolated`
- Page visible: `document.visibilityState`

Voice
- Engine in use: `activeEngine(settings.get())` from `src/lib/engine.js` (`natural` or `system`)
- Voice: `settings.get().voice`
- Measured speed: `settings.get().voiceSpeed`
- Voice engine status: `engine.get().status` from `src/lib/tts.js`

Playback
- Player: from `player.get()` in `src/lib/player.js`: `id` (yes/no), `i`, `playing`, `waiting`, `gate`
- Loaded audio: `stretchInfo()` → sentences `from`–`to`, `seconds` (one decimal); "none" when null
- Audio element: `audioState()` → paused, ended, readyState, currentTime/duration (one decimal), muted, volume

System media controls
- Media Session supported: `'mediaSession' in navigator`
- Media Session state: `navigator.mediaSession.playbackState`
- Media Session title: `navigator.mediaSession.metadata?.title`
- Notifications permission: `typeof Notification === 'undefined' ? 'unsupported' : Notification.permission`

Device
- `navigator.userAgent`
- Cores: `navigator.hardwareConcurrency`, memory (GB): `navigator.deviceMemory`

A "Copy report" button copies all rows as plain text (`label: value`, one per line, grouped under the
headings above) with `navigator.clipboard.writeText`, then calls `toast('Diagnostics copied')` from
`src/lib/nav.js`. If the clipboard call throws, call `toast('Could not copy. Select the text instead.')`.

## Project rules (must follow)
- React function components, declared at top level only (no component defined inside another).
- Inline styles only, with tokens from `src/theme.js` (`T.text`, `T.sub`, `T.faint`, `T.mono`, `T.border`, ...).
  No CSS files, no Tailwind, no hard-coded colours.
- Use existing primitives from `src/ui/kit.jsx` (`Button`).
- No `try/catch` that hides errors, except the clipboard case above.
- Text is plain and sentence case. Section headings use the `label` style exported by `src/theme.js`.
- Keep it small: one file, well under 120 lines.

## Done when
- `npx vite build` finishes with no errors or warnings.
- `npm test` passes.
- Report back: the files changed and the build + test output lines.
