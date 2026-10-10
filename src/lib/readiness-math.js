// How long until natural-voice playback can run to the end without catching up with generation.
// ahead: seconds already generated past the playhead · rest: seconds still to generate · r: generation speed (× real time)
// r ≥ 1: just fill a small buffer, (BUFFER − ahead)/r. r < 1: w = rest(1−r)/r + BUFFER − ahead (wall-clock seconds;
// derivation in library.js readiness). Pure, so the gate is tested by simulation (readiness.test.js).
export const BUFFER_S = 8

export function waitSeconds(ahead, rest, r) {
  const buffer = Math.min(BUFFER_S, ahead + rest)
  return r >= 1 ? Math.max(0, buffer - ahead) / r : Math.max(0, (rest * (1 - r)) / r + buffer - ahead)
}
