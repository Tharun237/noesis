// Settings card for aware listening: the voice slows in noise, and the book pauses when the listener speaks.
// The parent owns the values; this card reports one change at a time as { slow } or { pauseOnSpeech }.
import { T } from '../theme.js'
import { Toggle } from './kit.jsx'
import { awareSupported } from '../lib/aware.js'

const para = { fontSize: 13, lineHeight: 1.55, color: T.sub, margin: 0 }

export function AwarenessCard({ Card, slow, pauseOnSpeech, onChange }) {
  return (
    <Card title="Aware listening">
      {awareSupported() ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <Toggle checked={slow} onChange={next => onChange({ slow: next })} labelText="Slow down when it is noisy"
            hint="The voice slows a little while there is noise around you, and returns to your speed when it is quiet again." />
          <Toggle checked={pauseOnSpeech} onChange={next => onChange({ pauseOnSpeech: next })} labelText="Pause when I speak"
            hint="The book pauses when you start talking, and stays paused until you press play. Best with headphones: on the phone's speaker the book's own voice can set it off." />
          <p style={para}>
            Uses the microphone only while a document is playing with the app open. Sound is measured on this device. Nothing is recorded or sent.
          </p>
        </div>
      ) : (
        <p style={para}>This browser cannot use the microphone, so aware listening is not available here.</p>
      )}
    </Card>
  )
}
