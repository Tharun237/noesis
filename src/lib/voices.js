// Noesis voices: Piper (rhasspy/piper-voices), generated on the device. Chosen over Kokoro-82M after measuring
// (2026-10-10): Kokoro ran at 0.15× speaking speed on a real Android phone and its GPU build crashed it, while
// Piper runs 3.4–6× on 2–4 CPU cores — so one engine gives the same natural voice on every device.
// Only voices whose model card grants free use are listed (public domain, CC0, CC BY, CC BY-SA); the
// non-commercial and unclear-license voices in the catalogue are deliberately left out.
// Each "medium" voice is a single ~63 MB download, cached on the device after first use.
// NVIDIA Magpie cloud voices (M10) appear after the on-device voices when the customer saved an
// NVIDIA key and the voice list was loaded: { id: 'nv:…', accent: 'NVIDIA · online', cloud: true }.
import { settings } from './settings.js'
import { isNvidiaKey } from './ai.js'
import { isCloudVoice, cloudVoiceInfo } from './cloudvoice.js'

export const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'

export const VOICES = [
  { id: 'en_GB-alba-medium', name: 'Alba', accent: 'UK', g: 'F', license: 'CC BY 4.0', lang: 'en', data: 'https://datashare.ed.ac.uk/handle/10283/3270' },
  { id: 'en_US-kristin-medium', name: 'Kristin', accent: 'US', g: 'F', license: 'Public domain', lang: 'en', data: 'https://librivox.org' },
  { id: 'en_GB-cori-medium', name: 'Cori', accent: 'UK', g: 'F', license: 'Public domain', lang: 'en', data: 'https://librivox.org' },
  { id: 'en_US-ljspeech-medium', name: 'LJ', accent: 'US', g: 'F', license: 'Public domain', lang: 'en', data: 'https://keithito.com/LJ-Speech-Dataset/' },
  { id: 'en_GB-northern_english_male-medium', name: 'Northern', accent: 'UK', g: 'M', license: 'CC BY-SA 4.0', lang: 'en', data: 'http://www.openslr.org/83/' },
  { id: 'en_US-joe-medium', name: 'Joe', accent: 'US', g: 'M', license: 'CC0', lang: 'en', data: 'https://github.com/OHF-Voice/voice-datasets' },
  { id: 'en_US-john-medium', name: 'John', accent: 'US', g: 'M', license: 'Public domain', lang: 'en', data: 'https://librivox.org' },
  { id: 'en_US-norman-medium', name: 'Norman', accent: 'US', g: 'M', license: 'Public domain', lang: 'en', data: 'https://librivox.org' },
  { id: 'en_US-bryce-medium', name: 'Bryce', accent: 'US', g: 'M', license: 'Public domain', lang: 'en' },
  { id: 'en_US-mike-medium', name: 'Mike', accent: 'US', g: 'M', license: 'CC0', lang: 'en', data: 'https://github.com/OHF-Voice/voice-datasets' },
  { id: 'te_IN-padmavathi-medium', name: 'Padmavathi', accent: 'Telugu', g: 'F', license: 'CC BY 4.0', lang: 'te', data: 'https://huggingface.co/datasets/ai4bharat/indicvoices_r' },
  { id: 'te_IN-venkatesh-medium', name: 'Venkatesh', accent: 'Telugu', g: 'M', license: 'CC BY 4.0', lang: 'te', data: 'https://huggingface.co/datasets/ai4bharat/indicvoices_r' },
]
export const DEFAULT_VOICE = VOICES[0].id

function cloudFor(lang) {
  let s
  try { s = settings.get() } catch { return [] }
  if (!isNvidiaKey(String(s.nvidiaKey || ''))) return []
  const names = s.nvidiaVoices?.[lang] || []
  if (!names.length) return []
  return names.map(full => {
    const info = cloudVoiceInfo('nv:' + full)
    return { id: 'nv:' + full, name: info.name, accent: 'NVIDIA · online', g: undefined, license: 'NVIDIA', lang, cloud: true }
  })
}

export const voicesFor = lang => [...VOICES.filter(v => v.lang === lang), ...cloudFor(lang)]
export const defaultVoiceFor = lang => voicesFor(lang)[0]?.id ?? null
export const isVoice = id => VOICES.some(v => v.id === id) || isCloudVoice(id)
export const voiceName = id => {
  if (!id) return ''
  if (isCloudVoice(id)) {
    try { return cloudVoiceInfo(id).name || id } catch { return id }
  }
  return (VOICES.find(v => v.id === id) || VOICES.find(v => v.id === fromKokoro(id)))?.name || id
}

// en_US-ljspeech-medium → en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx
export function voiceUrl(id) {
  const [locale, name, quality] = id.split('-')
  return `${VOICE_BASE}${locale.split('_')[0]}/${locale}/${name}/${quality}/${id}.onnx`
}

// Documents voiced with Kokoro before the switch get the closest Piper voice (US/UK, female/male).
// Any other unknown voice id (e.g. a removed voice) falls back to the default voice.
export function fromKokoro(id = '') {
  if (typeof id === 'string' && /^[ab][fm]_/.test(id)) {
    const uk = id[0] === 'b', female = id[1] === 'f'
    return (uk ? (female ? 'en_GB-cori-medium' : 'en_GB-northern_english_male-medium') : female ? 'en_US-ljspeech-medium' : 'en_US-john-medium')
  }
  return DEFAULT_VOICE
}
