// The 28 English Kokoro-82M voices in kokoro-js 1.2.1 — ids, names and overallGrade extracted from
// the package's own VOICES table. Best-graded first, so the picker leads with the good ones.
export const VOICES = [
  { id: 'af_heart', name: 'Heart', accent: 'US', g: 'F', grade: 'A' },
  { id: 'af_bella', name: 'Bella', accent: 'US', g: 'F', grade: 'A-' },
  { id: 'af_nicole', name: 'Nicole', accent: 'US', g: 'F', grade: 'B-' },
  { id: 'bf_emma', name: 'Emma', accent: 'UK', g: 'F', grade: 'B-' },
  { id: 'af_aoede', name: 'Aoede', accent: 'US', g: 'F', grade: 'C+' },
  { id: 'af_kore', name: 'Kore', accent: 'US', g: 'F', grade: 'C+' },
  { id: 'af_sarah', name: 'Sarah', accent: 'US', g: 'F', grade: 'C+' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'US', g: 'M', grade: 'C+' },
  { id: 'am_michael', name: 'Michael', accent: 'US', g: 'M', grade: 'C+' },
  { id: 'am_puck', name: 'Puck', accent: 'US', g: 'M', grade: 'C+' },
  { id: 'bm_fable', name: 'Fable', accent: 'UK', g: 'M', grade: 'C' },
  { id: 'bm_george', name: 'George', accent: 'UK', g: 'M', grade: 'C' },
  { id: 'af_alloy', name: 'Alloy', accent: 'US', g: 'F', grade: 'C' },
  { id: 'af_nova', name: 'Nova', accent: 'US', g: 'F', grade: 'C' },
  { id: 'bf_isabella', name: 'Isabella', accent: 'UK', g: 'F', grade: 'C' },
  { id: 'am_echo', name: 'Echo', accent: 'US', g: 'M', grade: 'D' },
  { id: 'am_eric', name: 'Eric', accent: 'US', g: 'M', grade: 'D' },
  { id: 'am_liam', name: 'Liam', accent: 'US', g: 'M', grade: 'D' },
  { id: 'am_onyx', name: 'Onyx', accent: 'US', g: 'M', grade: 'D' },
  { id: 'am_adam', name: 'Adam', accent: 'US', g: 'M', grade: 'F+' },
  { id: 'af_jessica', name: 'Jessica', accent: 'US', g: 'F', grade: 'D' },
  { id: 'af_river', name: 'River', accent: 'US', g: 'F', grade: 'D' },
  { id: 'af_sky', name: 'Sky', accent: 'US', g: 'F', grade: 'C-' },
  { id: 'am_santa', name: 'Santa', accent: 'US', g: 'M', grade: 'D-' },
  { id: 'bf_alice', name: 'Alice', accent: 'UK', g: 'F', grade: 'D' },
  { id: 'bf_lily', name: 'Lily', accent: 'UK', g: 'F', grade: 'D' },
  { id: 'bm_daniel', name: 'Daniel', accent: 'UK', g: 'M', grade: 'D' },
  { id: 'bm_lewis', name: 'Lewis', accent: 'UK', g: 'M', grade: 'D+' },
]

export const voiceName = id => VOICES.find(v => v.id === id)?.name || id
