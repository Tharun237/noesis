import { useEffect, useMemo, useState } from 'react'
import { T, label } from '../theme.js'
import { Appear, Button, IconButton, Pulse, Segmented } from './kit.jsx'
import { toast } from '../lib/nav.js'
import { EquationSheet } from './EquationSheet.jsx'
import { SonifySheet } from './SonifySheet.jsx'
import { columnsIn } from '../lib/sonify.js'
import { speak, stopSpeaking, voiceForText } from '../lib/aside.js'

const AROUND = 300 // characters of the text before and after an equation that go to the AI as context
const TITLE = { equation: 'The equation, taken apart', sonify: 'Heard as sound' }
const PICK_MAX = 4 // more columns than this do not fit a row of buttons: a list is used instead

// What an equation, a table or a figure offers beyond being read aloud, shown as a sheet over the document.
// `tool` is { kind: 'equation' | 'sonify', bi } where bi is the block's place in the document.
export function BlockTool({ tool, doc, d, onClose }) {
  useEffect(() => stopSpeaking, []) // closing the sheet stops a part that is being spoken
  // A tapped part is answered at once on screen: the voice can take seconds to be ready the first time.
  const [voice, setVoice] = useState(null) // null | 'preparing' | 'speaking'
  const say = t => {
    setVoice('preparing')
    speak(t, voiceForText(t, d), on => setVoice(on ? 'speaking' : null)).catch(() => toast("The voice couldn't start."))
  }
  const near = i => (doc.blocks[i] ? doc.blocks[i].s.join(' ') : '')
  const text = near(tool.bi)
  const context = `${near(tool.bi - 1).slice(-AROUND)} ${near(tool.bi + 1).slice(0, AROUND)}`.trim()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px 0 20px' }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>{TITLE[tool.kind]}</div>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </div>
      {voice && (
        <Appear style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px 0', fontSize: 13.5, color: T.sub }}>
          <Pulse /><span style={{ flex: 1 }}>{voice === 'preparing' ? 'Preparing the voice' : 'Speaking'}</span>
          <Button onClick={() => { stopSpeaking(); setVoice(null) }}>Stop</Button>
        </Appear>
      )}
      {tool.kind === 'equation'
        ? <EquationSheet equation={doc.blocks[tool.bi].x || text} context={context} onSpeak={say} />
        : <TableSound rows={doc.blocks[tool.bi].d} text={text} />}
    </div>
  )
}

// A table is heard one column at a time (mixing columns would make a shape that means nothing). A figure or a
// table without stored cells is played from the numbers in its description.
function TableSound({ rows, text }) {
  const cols = useMemo(() => (rows ? columnsIn(rows) : []), [rows])
  const [pick, setPick] = useState(0)
  const col = cols[pick]
  return (
    <div style={{ padding: '18px 20px 24px', display: 'grid', gap: 16 }}>
      {cols.length > 1 && cols.length <= PICK_MAX && (
        <Segmented size="sm" value={pick} onChange={setPick} options={cols.map((c, i) => ({ value: i, label: c.name }))} />
      )}
      {cols.length > PICK_MAX && (
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={label}>Column</span>
          <select value={pick} onChange={e => setPick(+e.target.value)}
            style={{ height: 44, padding: '0 12px', borderRadius: T.r.md, border: `1px solid ${T.borderHi}`, background: T.surface, color: T.text, fontFamily: T.font, fontSize: 15 }}>
            {cols.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
          </select>
        </label>
      )}
      {cols.length === 1 && <div style={label}>{col.name}</div>}
      <SonifySheet key={pick} text={text} values={col?.values} from={col ? 'column' : 'passage'} />
    </div>
  )
}
