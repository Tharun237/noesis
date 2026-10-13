// Word timing is estimated from the sentence's real duration, weighted by word length plus
// punctuation pauses. The voice engine doesn't emit word timestamps; this tracks speech closely in practice.
// → ws: the words · ends: where each ends, as a share of the sentence · says: the share each takes to SAY,
//   without the pause after it (a word before a full stop is said as fast as any other, then there is a rest).
export function wordWeights(text) {
  const ws = text.split(' ')
  const w = ws.map(x => x.length + 1 + (/[,;:—–]$/.test(x) ? 4 : /[.!?…]["”')]?$/.test(x) ? 6 : 0))
  const sum = w.reduce((a, b) => a + b, 0)
  let acc = 0
  return { ws, ends: w.map(x => (acc += x) / sum), says: ws.map(x => (x.length + 1) / sum) }
}
