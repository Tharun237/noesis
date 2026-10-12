import { useEffect, useRef, useState } from 'react'
import { T, label } from '../theme.js'
import { player, play } from '../lib/player.js'
import { paperId, paperUrl, lookupPaper } from '../lib/citations.js'
import { speak, stopSpeaking, voiceForText } from '../lib/aside.js'
import { toast } from '../lib/nav.js'
import { motion } from 'motion/react'
import { Appear, Button, IconButton, Pulse, rowIn } from './kit.jsx'

const note = { fontSize: 13, color: T.sub, lineHeight: 1.55 }

// The works a passage cites, each as a card: the entry as the document lists it, heard on request, and for
// an entry that names its paper exactly (a DOI or an arXiv number) a short summary from a public index.
// The book pauses while a card is heard and carries on when the sheet closes.
export function CitationSheet({ refs, d, onClose }) {
  const resume = useRef(player.get().playing && player.get().id === d.id) // was the book playing when this opened?
  const [voice, setVoice] = useState(null) // null | 'preparing' | 'speaking'
  useEffect(() => () => { stopSpeaking(); if (resume.current) play() }, [])
  const say = t => {
    setVoice('preparing')
    speak(t, voiceForText(t, d), on => setVoice(on ? 'speaking' : null)).catch(() => toast("The voice couldn't start."))
  }
  return (
    <div style={{ padding: '14px 20px 24px', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: -8 }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 700, color: T.text }}>Cited here</div>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </div>
      {voice && (
        <Appear style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}>
          <Pulse /><span style={{ flex: 1 }}>{voice === 'preparing' ? 'Preparing the voice' : 'Speaking'}</span>
          <Button onClick={() => { stopSpeaking(); setVoice(null) }}>Stop</Button>
        </Appear>
      )}
      {refs.map((r, i) => <motion.div key={i} {...rowIn(i)}><RefCard r={r} onSpeak={say} /></motion.div>)}
      <div style={note}>The entries are as this document lists them. Looking a paper up asks openalex.org, a free public index of research papers, for that one paper.</div>
    </div>
  )
}

function RefCard({ r, onSpeak }) {
  const id = paperId(r.text)
  const [state, setState] = useState(null) // null | 'looking' | { paper } | { missing } | { error }
  const abort = useRef(null)
  useEffect(() => () => abort.current?.abort(), [])
  const look = async () => {
    abort.current = new AbortController()
    setState('looking')
    try {
      const paper = await lookupPaper(id, { signal: abort.current.signal })
      setState(paper ? { paper } : { missing: true })
    } catch (err) {
      if (err.name !== 'AbortError') setState({ error: navigator.onLine ? err.message : "You're offline. Looking a paper up needs the internet." })
    }
  }
  const paper = state?.paper
  return (
    <div style={{ padding: 16, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.surface, display: 'grid', gap: 12 }}>
      {r.n != null && <div style={{ ...label, color: T.lime }}>[{r.n}]</div>}
      <div style={{ fontSize: 14.5, color: T.body, lineHeight: 1.6, wordBreak: 'break-word' }}>{r.text}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon="speaker" onClick={() => onSpeak(r.text)}>Hear it</Button>
        {id && !paper && <Button icon="search" disabled={state === 'looking'} onClick={look}>Look it up</Button>}
        <a href={paperUrl(r.text)} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 16px', borderRadius: T.r.pill, border: `1px solid ${T.border}`, color: T.text, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          {id ? 'Open the paper' : 'Search for it'}
        </a>
      </div>
      {state === 'looking' && <Appear style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.sub }}><Pulse /> Looking it up</Appear>}
      {state?.missing && <Appear style={note}>The index does not have this paper.</Appear>}
      {state?.error && <Appear style={{ ...note, color: T.danger }}>{state.error}</Appear>}
      {paper && (
        <Appear style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{paper.title}</div>
          <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint }}>{paper.authors.join(', ')}</div>
          {paper.summary
            ? <><div style={{ fontSize: 14, color: T.sub, lineHeight: 1.6 }}>{paper.summary}</div><div><Button icon="speaker" onClick={() => onSpeak(`${paper.title}. ${paper.summary}`)}>Hear the summary</Button></div></>
            : <div style={note}>The index has no summary for this paper.</div>}
        </Appear>
      )}
    </div>
  )
}
