// Settings card for focus sounds under the voice and the haptic rhythm of the text.
// The parent owns the values; this card reports one change at a time as { mode }, { volume } or { haptics }.
import { T } from '../theme.js'
import { Segmented, Toggle, Appear } from './kit.jsx'
import { hapticsSupported, haptic, HELLO } from '../lib/haptics.js'
import { toast } from '../lib/nav.js'

const OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'focus', label: 'Focus' },
  { value: 'calm', label: 'Calm' },
  { value: 'brown', label: 'Brown noise' },
]

const para = { fontSize: 13, lineHeight: 1.55, color: T.sub, margin: 0 }

export function AmbientCard({ Card, mode, volume, haptics, onChange }) {
  return (
    <Card title="Focus sounds">
      <div style={{ display: 'grid', gap: 14 }}>
        <Segmented options={OPTIONS} value={mode} onChange={next => onChange({ mode: next })} />
        {mode !== 'off' && (
          <Appear><input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Focus sound volume"
            onChange={e => onChange({ volume: Number(e.target.value) })}
            style={{ width: '100%', accentColor: T.text, margin: 0 }} /></Appear>
        )}
        <p style={para}>
          Focus and Calm are binaural beats: they need headphones, because each ear gets a slightly different tone.
          Through a phone's own speaker they can hardly be heard. All three play only while the voice is playing; choosing one lets you hear it for a few seconds.
        </p>
        {hapticsSupported() && (
          <Toggle checked={haptics} labelText="Vibrate with the rhythm of the text"
            // Switched on, it is felt at once: the proof that it works on this phone. If the phone will not
            // vibrate, it says so and stays off, where it used to stay on and do nothing.
            onChange={next => {
              if (next && !haptic(HELLO)) return toast('This phone would not vibrate. Check that vibration is on in its own settings.')
              onChange({ haptics: next })
            }}
            hint="A short pulse at the end of each sentence, a longer one at headings. For readers who feel rhythm better than they hear it. Felt while the screen is on." />
        )}
      </div>
    </Card>
  )
}
