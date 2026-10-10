// Noesis voices: Piper (rhasspy/piper-voices), generated on the device. Chosen over Kokoro-82M after measuring
// (2026-10-10): Kokoro ran at 0.15× speaking speed on a real Android phone and its GPU build crashed it, while
// Piper runs 3.4–6× on 2–4 CPU cores — so one engine gives the same natural voice on every device.
// Only voices whose model card grants free use are listed (public domain, CC0, CC BY, CC BY-SA); the
// non-commercial and unclear-license voices in the catalogue are deliberately left out.
// Each "medium" voice is a single ~63 MB download, cached on the device after first use.
export const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'

export const VOICES = [
  { id: 'en_US-ljspeech-medium', name: 'LJ', accent: 'US', g: 'F', license: 'Public domain' },
  { id: 'en_US-kristin-medium', name: 'Kristin', accent: 'US', g: 'F', license: 'Public domain' },
  { id: 'en_GB-cori-medium', name: 'Cori', accent: 'UK', g: 'F', license: 'Public domain' },
  { id: 'en_GB-alba-medium', name: 'Alba', accent: 'UK', g: 'F', license: 'CC BY 4.0' },
  { id: 'en_US-john-medium', name: 'John', accent: 'US', g: 'M', license: 'Public domain' },
  { id: 'en_US-norman-medium', name: 'Norman', accent: 'US', g: 'M', license: 'Public domain' },
  { id: 'en_US-joe-medium', name: 'Joe', accent: 'US', g: 'M', license: 'CC0' },
  { id: 'en_US-bryce-medium', name: 'Bryce', accent: 'US', g: 'M', license: 'Public domain' },
  { id: 'en_US-mike-medium', name: 'Mike', accent: 'US', g: 'M', license: 'CC0' },
  { id: 'en_US-reza_ibrahim-medium', name: 'Reza', accent: 'US', g: 'M', license: 'CC0' },
  { id: 'en_GB-northern_english_male-medium', name: 'Northern', accent: 'UK', g: 'M', license: 'CC BY-SA 4.0' },
]
export const DEFAULT_VOICE = VOICES[0].id
export const isVoice = id => VOICES.some(v => v.id === id)
export const voiceName = id => (id ? (VOICES.find(v => v.id === id) || VOICES.find(v => v.id === fromKokoro(id)))?.name || id : '')

// en_US-ljspeech-medium → en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx
export function voiceUrl(id) {
  const [locale, name, quality] = id.split('-')
  return `${VOICE_BASE}${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}.onnx`
}

// Documents voiced with Kokoro before the switch get the closest Piper voice (US/UK, female/male).
export function fromKokoro(id = '') {
  const uk = id[0] === 'b', female = id[1] === 'f'
  return (uk ? (female ? 'en_GB-cori-medium' : 'en_GB-northern_english_male-medium') : female ? 'en_US-ljspeech-medium' : 'en_US-john-medium')
}
