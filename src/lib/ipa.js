// eSpeak-ng IPA cleanup for Piper voices. Pure — runs in Node tests.
// eSpeak separates phonemes with `_` and sentences with newlines; Hindi output can
// contain `.` (e.g. `bˈʌr.hi`) which Piper would read as a full stop, so it is removed.
export function ipaChars(ipa) {
  if (!ipa) return ''
  return String(ipa).replace(/_/g, '').replace(/\./g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}
