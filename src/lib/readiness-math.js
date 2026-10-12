// How long until natural-voice playback can run to the end without catching up with generation.
// ahead: seconds already generated past the playhead · rest: seconds still to generate · r: generation speed (× real time)
// r ≥ 1: just fill a small buffer, (BUFFER − ahead)/r. r < 1: w = rest(1−r)/r + BUFFER − ahead (wall-clock seconds;
// derivation in library.js readiness). Pure, so the gate is tested by simulation (readiness.test.js).
export const BUFFER_S = 8

// A wait, in words a person would use. One formatter: the reader, the island and the library card said
// "under 2 minutes" for a ten-second wait, each from its own copy.
export const waitWords = s => (s < 8 ? 'a few seconds' : s < 50 ? `about ${Math.round(s / 5) * 5} seconds` : s < 90 ? 'about a minute'
  : s < 3600 ? `about ${Math.round(s / 60)} minutes` : `about ${(s / 3600).toFixed(1)} hours`)

export function waitSeconds(ahead, rest, r) {
  const buffer = Math.min(BUFFER_S, ahead + rest)
  return r >= 1 ? Math.max(0, buffer - ahead) / r : Math.max(0, (rest * (1 - r)) / r + buffer - ahead)
}
