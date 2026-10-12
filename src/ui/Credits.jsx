// Credits and licences: what the people whose work Noesis uses asked for in return.
// CC BY voices need credit and a link to the licence; eSpeak NG (GPL-3.0) needs its notice, its licence
// text and a way to get its source. Voice rows come from the catalogue, so a new voice is credited by
// being added there.
import { T, eyebrow } from '../theme.js'
import { VOICES } from '../lib/voices.js'

const LICENCE_URL = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'IIT Madras TTS licence': 'https://www.iitm.ac.in/donlab/indictts/downloads/license.pdf',
}

const SOFTWARE = [
  ['ONNX Runtime', 'MIT', 'https://github.com/microsoft/onnxruntime'],
  ['PDF.js', 'Apache-2.0', 'https://github.com/mozilla/pdf.js'],
  ['React', 'MIT', 'https://github.com/facebook/react'],
]

const heading = { ...eyebrow, marginTop: 14 }
const row = { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 13, lineHeight: 1.55, color: T.text }
const faint = { color: T.sub }
const para = { fontSize: 13, lineHeight: 1.55, color: T.sub, margin: 0 }
const link = { color: T.text, textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: T.border }

function Out({ href, children }) {
  return <a href={href} target="_blank" rel="noreferrer" style={link}>{children}</a>
}

export function CreditsCard({ Card }) {
  return (
    <Card title="Credits and licences">
      <p style={para}>Noesis is built on work other people shared freely. These are the terms they asked for.</p>
      <details>
        <summary style={{ cursor: 'pointer', fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text }}>Show credits</summary>

        <div style={heading}>Voices</div>
        <p style={{ ...para, margin: '6px 0 8px' }}>
          Voice models from <Out href="https://huggingface.co/rhasspy/piper-voices">Piper voices</Out>, trained by the Piper project
          from the recordings below. Noesis uses them unchanged.
        </p>
        <div style={{ display: 'grid', gap: 4 }}>
          {VOICES.map(v => (
            <div key={v.id} style={row}>
              <span style={{ fontWeight: 600 }}>{v.name}</span>
              <span style={faint}>
                {LICENCE_URL[v.license] ? <Out href={LICENCE_URL[v.license]}>{v.license}</Out> : v.license}
                {v.data && <> · <Out href={v.data}>recordings</Out></>}
              </span>
              {/* A notice its licence says must stay with the voice; and its one restriction, said plainly. */}
              {v.notice && <span style={{ ...faint, flexBasis: '100%' }}>{v.notice}. This voice is built on openly shared recordings and may not be resold or sublicensed on its own.</span>}
            </div>
          ))}
          <div style={row}>
            <span style={{ fontWeight: 600 }}>NVIDIA Magpie voices (online, with the customer&apos;s NVIDIA key)</span>
            <span style={faint}><Out href="https://build.nvidia.com/nvidia/magpie-tts-multilingual">build.nvidia.com/nvidia/magpie-tts-multilingual</Out></span>
          </div>
        </div>

        <div style={heading}>Pronunciation</div>
        <p style={{ ...para, margin: '6px 0 0' }}>
          Text is turned into sounds by <Out href="https://github.com/espeak-ng/espeak-ng">eSpeak NG</Out>, free software under
          the <Out href="https://www.gnu.org/licenses/gpl-3.0.html">GNU General Public License, version 3</Out>. Noesis runs it
          unchanged, as built by <Out href="https://github.com/xenova/phonemizer.js">phonemizer.js</Out> (English)
          and <Out href="https://github.com/echogarden-project/espeak-ng-emscripten">espeak-ng-emscripten</Out> (other languages).
          Its source is at those links; the <Out href="/espeak/COPYING.txt">licence text</Out> comes with the app.
        </p>

        <div style={heading}>Translation</div>
        <p style={{ ...para, margin: '6px 0 0' }}>
          Documents are translated on your device by the models of <Out href="https://github.com/mozilla/translations">Mozilla&apos;s Firefox Translations</Out>,
          run by <Out href="https://github.com/browsermt/bergamot-translator">bergamot-translator</Out> (built on Marian). Both are free software under
          the <Out href="https://www.mozilla.org/MPL/2.0/">Mozilla Public License 2.0</Out>; Noesis uses them unchanged, and their source is at those links.
        </p>

        <div style={heading}>Software</div>
        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {SOFTWARE.map(([name, licence, url]) => (
            <div key={name} style={row}>
              <span style={{ fontWeight: 600 }}><Out href={url}>{name}</Out></span>
              <span style={faint}>{licence}</span>
            </div>
          ))}
        </div>

        <div style={heading}>Paper summaries</div>
        <p style={{ ...para, margin: '6px 0 0' }}>
          When you look a cited paper up, its title, authors and summary come from <Out href="https://openalex.org">OpenAlex</Out>,
          a free public index of research papers (<Out href={LICENCE_URL.CC0}>CC0</Out>).
        </p>
      </details>
    </Card>
  )
}
