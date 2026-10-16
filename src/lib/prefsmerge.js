// Settings merged setting by setting (prefs.js): each carries when it was last changed, and the newest change to
// each wins. Pure, so its rules are tested (prefsmerge.test.js).
const isDefault = (defaults, k, v) => v === undefined || v === defaults[k] || (typeof v === 'string' && !v.trim() && !String(defaults[k] ?? '').trim())

// keys: the settings that follow the customer; defaults: their values when never chosen. mine/got: values;
// mineAt/gotAt: when each was changed (gotAt null: a record from a version without times, older than any real
// change). A setting never changed on a device has no time: -1 if it is at its default there, 0 if it holds
// something chosen before times were kept. Ties go to a chosen value over a default.
// → { take: { k: v }, at: { k: t }, again } (again: this device holds something newer, to be sent back out).
export function mergePrefs(keys, defaults, mine, mineAt, got, gotAt) {
  const take = {}, newAt = {}
  let again = false
  for (const k of keys) {
    if (!(k in got) && !(k in mine)) continue
    const my = mineAt[k] ?? (isDefault(defaults, k, mine[k]) ? -1 : 0)
    const theirs = gotAt ? (gotAt[k] ?? -1) : 0
    const theirsChosen = k in got && !isDefault(defaults, k, got[k])
    if (k in got && (theirs > my || (theirs === my && isDefault(defaults, k, mine[k]) && theirsChosen))) {
      if (got[k] !== mine[k]) take[k] = got[k]
      if (theirs > (mineAt[k] ?? -Infinity)) newAt[k] = theirs
    } else if (my > theirs || (my === theirs && !isDefault(defaults, k, mine[k]) && !theirsChosen && mine[k] !== got[k])) {
      again = true
    }
  }
  return { take, at: newAt, again }
}
