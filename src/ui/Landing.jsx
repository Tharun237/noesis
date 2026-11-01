// The landing page: what someone with an empty library sees, which is every new visitor. One idea to a
// screen, large type, and the product shown doing the one thing it is for: a voice moving through words.
//
// (It replaces a welcome block that sat inside the library's own chrome, between a sidebar and a tab bar that
// had nothing in them yet. A page that introduces the app is not a state of the library.)
//
// Motion, by the rules in .claude/skills/motion: everything that moves is opacity or transform, and nothing
// here runs script while the page scrolls. The word the "voice" is on is a lime copy of the word whose
// opacity is switched by one keyframe rule; words that light as the page is scrolled, and sections that rise
// as they enter, are tied to the scroll by the browser itself (scroll-driven animations). A browser without
// those shows the same page standing still, complete.
//
// The scroll-lit paragraph and the serif-italic accent words follow examples in the MIT-licensed gallery
// github.com/pulkitxm/claude-directory (landing-pages/mindloop-mono-landing), rebuilt in this app's own
// stack: there it is a Motion value per word, here it is one style rule and no script.
import { useState } from 'react'
import { T } from '../theme.js'
import { go, tab, openSheet, closeWelcome, pushPanel, toast } from '../lib/nav.js'
import { useStore } from '../lib/store.js'
import { account } from '../lib/sync.js'
import { addDocument, library } from '../lib/library.js'
import { VOICES, voicesFor } from '../lib/voices.js'
import { LANGS } from '../lib/lang.js'
import { Icon } from './icons.jsx'
import { Button, IconButton, Segmented } from './kit.jsx'
import { Wordmark } from './Library.jsx'
import { SAMPLE } from './sample.js'
import { SOURCE, LICENCE } from '../lib/source.js'

// ── the page's own numbers ────────────────────────────────────────────────────────────────────────────────
const PAGE_W = 1080 // the widest the content gets
const NAV_H = 56
const WORD_MS = 300 // how long the voice stays on a word in the demonstration
const DIM = 0.2 // a word the scroll has not reached yet
const LIT_FROM = 18 // % of a paragraph's way across the screen at which its first word lights
const LIT_SPAN = 40 // % over which the rest follow
const LIT_EACH = 7 // % a single word takes to light
const ENTER_Y = 36 // px a section rises as it comes onto the screen
const PLAYED_FROM = 4 // % of the mood line already played as it comes onto the screen
const PLAYED_TO = 92 // % played by the time it leaves
const PLAYED_STILL = 42 // % shown as played where nothing is tied to the scroll
const EASE = `cubic-bezier(${T.enter.ease.join(', ')})`

// What the demonstration reads, and what the scroll lights: sentences of the sample document, written for Noesis.
const SAYS = 'Reading is one road to that moment. Listening is another, and for a long time it was the main one.'.split(' ')
const MANIFESTO = 'Give it a paper, a book or a web page. Noesis takes out the page numbers, the running headers and the reference lists, and reads you what is left, in a natural voice made on your own device.'.split(' ')
const KEPT = new Set(['natural', 'voice', 'own', 'device.']) // the words of the manifesto that stay lime: what it is

const rules = [
  // the word being "spoken": a lime copy of it, shown for its turn
  `@keyframes noesis-now{0%{opacity:1}${(100 / SAYS.length).toFixed(3)}%{opacity:1}${(100 / SAYS.length + 0.01).toFixed(3)}%{opacity:0}100%{opacity:0}}`,
  '[data-now]{position:relative;display:inline-block}',
  `[data-now]::after{content:attr(data-now);position:absolute;left:0;top:0;color:${T.lime};opacity:0;animation:noesis-now ${SAYS.length * WORD_MS}ms linear infinite;animation-delay:calc(var(--i) * ${WORD_MS}ms)}`,
  // words lit by scrolling, and sections that rise as they enter: only where the browser ties them to the scroll
  '@keyframes noesis-lit{to{opacity:1}}',
  `@keyframes noesis-enter{from{opacity:0;transform:translateY(${ENTER_Y}px)}}`,
  `@supports (animation-timeline: view()){[data-lit]{opacity:${DIM};animation:noesis-lit linear both;animation-timeline:--noesis-say}[data-enter]{animation:noesis-enter ${EASE} both;animation-timeline:view();animation-range:entry 0% entry 80%}}`,
  // The mood line is played as the page is scrolled. Its white, played part is a window that slides open: the
  // window moves one way and what is inside it moves back by the same amount, so the line stands still and
  // only the edge travels (two transforms, nothing redrawn).
  `@keyframes noesis-played{from{transform:translateX(${PLAYED_FROM - 100}%)}to{transform:translateX(${PLAYED_TO - 100}%)}}`,
  `@keyframes noesis-played-in{from{transform:translateX(${100 - PLAYED_FROM}%)}to{transform:translateX(${100 - PLAYED_TO}%)}}`,
  '@supports (animation-timeline: view()){[data-played]{animation:noesis-played linear both;animation-timeline:--noesis-mood;animation-range:entry 40% exit 40%}[data-played-in]{animation:noesis-played-in linear both;animation-timeline:--noesis-mood;animation-range:entry 40% exit 40%}}',
]
if (typeof document !== 'undefined' && !document.getElementById('noesis-landing')) {
  const sheet = document.createElement('style')
  sheet.id = 'noesis-landing'
  sheet.textContent = rules.join('\n')
  document.head.appendChild(sheet)
}

const FORMATS = ['PDF', 'EPUB', 'Word', 'Web link', 'Markdown', 'Text']
const ASKS = ['Summarise it', 'Ask it a question', 'Describe a figure', 'Read a scanned page']
// One sentence of the sample, as it is heard in four of the languages the app translates into.
const TONGUES = [
  { value: 'en', label: 'English', first: 'Listening', rest: 'is another road, and for a long time it was the main one.' },
  { value: 'hi', label: 'हिन्दी', first: 'सुनना', rest: 'एक और रास्ता है, और लंबे समय तक वही मुख्य रास्ता था।' },
  { value: 'te', label: 'తెలుగు', first: 'వినడం', rest: 'మరొక మార్గం, చాలా కాలం పాటు అదే ప్రధాన మార్గం.' },
  { value: 'es', label: 'Español', first: 'Escuchar', rest: 'es otro camino, y durante mucho tiempo fue el principal.' },
]
// the shape of a book's mood, drawn 640 wide and 80 tall: up is brighter, down is darker
const MOOD = 'M0 42 C 40 24, 72 12, 112 22 S 172 58, 216 62 S 292 32, 332 14 S 402 8, 442 30 S 512 68, 560 60 S 612 38, 640 40'
const VIEWS = [{ value: 'text', label: 'Text' }, { value: 'pages', label: 'Pages' }, { value: 'focus', label: 'Focus' }]
const VIEW_SAYS = {
  text: 'The words as clean, flowing text. The one being spoken is lit.',
  pages: 'The original page, with the sentence being read marked on it.',
  focus: 'One word at a time, in one place, at the speed you set. It needs no sound, so it works for readers who are deaf or hard of hearing too.',
}

// This page's own small type: capitals in the monospace face. The app's labels are plain words now (theme.js);
// the welcome page keeps the look it was approved with.
const label = { fontFamily: T.code, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }
const eyebrow = { fontFamily: T.code, fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.sub }

export function Landing({ wide, hasLibrary }) {
  // someone coming back (a new device, or after signing out) looks for this here, not three taps into Settings
  const canSignIn = useStore(account, a => a.checked && (a.google || a.dev) && !a.user)
  const noStorage = useStore(library, s => !!s.noStorage) // this browser will not let a page keep anything (db.js)
  const NO_ROOM = 'This browser is not letting Noesis keep anything on this device. Open Noesis in a normal browser window to add a document.'
  const add = () => (noStorage ? toast(NO_ROOM) : openSheet('add'))
  const sample = async () => { if (noStorage) return toast(NO_ROOM); const id = await addDocument({ kind: 'text', name: SAMPLE.title, title: SAMPLE.title, text: SAMPLE.text }); go('reader', id) }
  const pad = wide ? 40 : 24
  const gap = wide ? 168 : 104 // between one idea and the next
  const h2 = { margin: 0, fontSize: wide ? 60 : 36, lineHeight: 1.02, letterSpacing: '-0.045em', fontWeight: 800, color: T.text }
  const say = { margin: '18px 0 0', maxWidth: 520, fontSize: wide ? 19 : 16.5, lineHeight: 1.6, color: T.sub }
  return (
    <div data-landing="" style={{ minHeight: '100dvh', background: T.bg }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: T.bg, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: NAV_H, maxWidth: PAGE_W, margin: '0 auto', padding: `0 ${wide ? pad : 12}px` }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}><Wordmark size={24} reveal /></div>
          {/* someone who already has a library came here by the page's own address: their way back */}
          {canSignIn && <Button onClick={() => { go('settings'); pushPanel('settings:account') }} style={{ height: 34, padding: '0 14px', fontSize: 13.5, marginRight: 4 }}>Sign in</Button>}
          {hasLibrary && <Button onClick={closeWelcome} style={{ height: 34, padding: '0 14px', fontSize: 13.5, marginRight: 4 }}>Your library</Button>}
          {/* free books to explore: a place of its own, reachable before there is any library (Books.jsx) */}
          <Button icon="book" onClick={() => tab('books')} style={{ height: 34, padding: '0 14px', fontSize: 13.5, marginRight: 4 }}>Books</Button>
          <IconButton icon="settings" label="Settings" onClick={() => go('settings')} />
          <IconButton icon="plus" label="Add" onClick={add} size={34} iconSize={18} style={{ background: T.text, color: T.bg, marginLeft: 2 }} />
        </div>
      </header>

      <main style={{ maxWidth: PAGE_W, margin: '0 auto', padding: `0 ${pad}px`, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: gap }}>
        {/* ── what it is, and the thing itself ── */}
        <section style={{ paddingTop: wide ? '9vh' : '5vh', display: 'grid', gridTemplateColumns: wide ? 'minmax(0, 1.05fr) minmax(0, 0.95fr)' : 'minmax(0, 1fr)', columnGap: 56, rowGap: 44, alignItems: 'center' }}>
          <div>
            {/* the news, said once where everyone arrives, and a way to read why */}
            <a data-rise="0" data-press="" href="/open-source" style={{ '--press': T.tap.control, display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 26, padding: '6px 14px 6px 6px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`, color: T.text, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
              <span style={{ padding: '3px 9px', borderRadius: T.r.pill, background: T.lime, color: T.bg, fontSize: 11.5, fontWeight: 700 }}>New</span>
              Noesis is now open source <Icon name="next" size={13} style={{ color: T.sub }} />
            </a>
            <div data-rise="0" style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: 6, background: T.lime }} />
              Listen deeper
              <span style={{ width: 56, height: 1, background: T.borderHi }} />
            </div>
            <h1 data-rise="1" style={{ margin: '22px 0 0', fontSize: wide ? 88 : 50, lineHeight: 0.96, letterSpacing: '-0.058em', fontWeight: 800, color: T.text }}>
              Listen to<br />anything.
            </h1>
            <div data-rise="2" style={{ marginTop: 14, fontFamily: T.serif, fontSize: wide ? 38 : 28, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.02em', color: T.sub }}>
              Understand it.
            </div>
            <p data-rise="3" style={{ ...say, margin: '24px 0 0' }}>
              Papers, books and articles, read to you in a natural voice that is made on your own device.
            </p>
            <div data-rise="4" style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 12, marginTop: 34 }}>
              <Button kind="primary" onClick={add} full={!wide} style={{ height: 56, padding: '0 30px', fontSize: 16, fontWeight: 700, borderRadius: wide ? T.r.pill : T.r.lg }}>
                Add a document <Icon name="next" size={16} />
              </Button>
              <Button icon="play" onClick={sample} full={!wide} style={{ height: 56, padding: '0 26px', fontSize: 16, background: 'transparent', borderColor: T.borderHi, borderRadius: wide ? T.r.pill : T.r.lg }}>
                Try a sample
              </Button>
            </div>
            {noStorage && <p role="status" style={{ margin: '16px 0 0', maxWidth: 520, fontSize: 13.5, lineHeight: 1.55, color: T.sub }}>{NO_ROOM}</p>}
          </div>
          <NowReading wide={wide} />
        </section>

        {/* ── what it does, lit word by word as the page is scrolled ── */}
        <section>
          <p aria-label={MANIFESTO.join(' ')} style={{ margin: 0, viewTimelineName: '--noesis-say', fontSize: wide ? 52 : 30, lineHeight: 1.14, letterSpacing: '-0.035em', fontWeight: 700, color: T.text, maxWidth: 940 }}>
            {MANIFESTO.map((w, i) => {
              const from = LIT_FROM + (LIT_SPAN * i) / MANIFESTO.length
              return <span key={i} aria-hidden data-lit="" style={{ animationRange: `cover ${from.toFixed(1)}% cover ${(from + LIT_EACH).toFixed(1)}%`, color: KEPT.has(w) ? T.lime : undefined }}>{w} </span>
            })}
          </p>
        </section>

        {/* ── three ideas, one to a screen ── */}
        <section data-enter="" style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', columnGap: 56, rowGap: 36, alignItems: 'center' }}>
          <div>
            <div style={label}>01 · Yours</div>
            <h2 style={{ ...h2, marginTop: 16 }}>Made on<br />your device.</h2>
            <p style={say}>The voice runs on your phone or your computer. Nothing is uploaded to make the audio, there is no account to open, and it keeps working without a connection.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderRadius: T.r.xl, border: `1px solid ${T.border}`, background: T.surface }}>
            {[['Everyone', 'Has access'], ['Offline', 'Audio'], [String(VOICES.length), 'Natural voices']].map(([value, name], i) => (
              <div key={name} style={{ minWidth: 0, padding: wide ? '36px 22px' : '26px 14px', borderLeft: i ? `1px solid ${T.border}` : 'none', display: 'grid', gap: 10, alignContent: 'center' }}>
                <div style={{ fontFamily: T.code, fontSize: wide ? 26 : 17, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>{value}</div>
                <div style={{ ...eyebrow, fontSize: 10, letterSpacing: '0.16em' }}>{name}</div>
              </div>
            ))}
          </div>
        </section>

        <section data-enter="" style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', columnGap: 56, rowGap: 36, alignItems: 'center' }}>
          <div style={{ order: wide ? 2 : 0 }}>
            <div style={label}>02 · Your way</div>
            <h2 style={{ ...h2, marginTop: 16 }}>Follow it<br />three ways.</h2>
            <p style={say}>Read along with the voice, look at the real page, or take one word at a time, with sound or without. Change your mind whenever you like: it keeps your place.</p>
          </div>
          <ThreeWays wide={wide} />
        </section>

        <section data-enter="" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: wide ? 44 : 32 }}>
          <div>
            <div style={label}>03 · The shape of it</div>
            <h2 style={{ ...h2, marginTop: 16 }}>A progress bar<br />with feeling.</h2>
            <p style={{ ...say, maxWidth: 600 }}>The line you move along follows the mood of the writing. It rises where the book is brighter and falls where it is darker, so you can see the heavy chapter coming and find the calm one again.</p>
          </div>
          <MoodLine wide={wide} />
        </section>

        <section data-enter="" style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', columnGap: 56, rowGap: 36, alignItems: 'center' }}>
          <div style={{ order: wide ? 2 : 0 }}>
            <div style={label}>04 · Your language</div>
            <h2 style={{ ...h2, marginTop: 16 }}>Hear it in<br />your language.</h2>
            <p style={say}>A paper written in English, heard in Telugu. Noesis translates the whole document on your own device, free, and reads the translation to you. With your own AI key the translation is more natural still.</p>
            <p style={{ margin: '18px 0 0', maxWidth: 520, fontFamily: T.code, fontSize: 11.5, lineHeight: 1.8, letterSpacing: '0.04em', color: T.faint }}>{Object.entries(LANGS).filter(([code]) => voicesFor(code).length > 0 || code === 'hi').map(([, l]) => l.name).join(' · ')}</p>
          </div>
          <Tongues wide={wide} />
        </section>

        <section data-enter="" style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', columnGap: 56, rowGap: 32, alignItems: 'center' }}>
          <div>
            <div style={label}>05 · When you want more</div>
            <h2 style={{ ...h2, marginTop: 16 }}>Ask the<br />document.</h2>
            <p style={say}>Add your own AI key and Noesis can do more with what you are hearing. It is off until you turn it on, and the key is kept on your device.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ASKS.map(a => (
              <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 44, padding: '0 18px', borderRadius: T.r.pill, border: `1px solid ${T.borderHi}`, color: T.text, fontSize: 14.5, fontWeight: 600 }}>
                <Icon name="sparkle" size={15} style={{ color: T.sub }} />{a}
              </div>
            ))}
          </div>
        </section>

        <section data-enter="" style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', columnGap: 56, rowGap: 32, alignItems: 'center' }}>
          <div style={{ order: wide ? 2 : 0 }}>
            <div style={label}>06 · Open</div>
            <h2 style={{ ...h2, marginTop: 16 }}>Every line,<br />in the open.</h2>
            <p style={say}>You do not have to take our word that your documents stay on your device. The code is public, under the {LICENCE.name}: anyone can read what Noesis does, run their own copy and make it better.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
              <Button kind="primary" onClick={() => { location.href = SOURCE }} style={{ height: 48, padding: '0 24px', fontSize: 15, fontWeight: 700, borderRadius: T.r.pill }}>Read the code <Icon name="next" size={15} /></Button>
              <Button onClick={() => { location.href = '/open-source' }} style={{ height: 48, padding: '0 22px', fontSize: 15, background: 'transparent', borderColor: T.borderHi, borderRadius: T.r.pill }}>Why it is open</Button>
            </div>
          </div>
          <OwnCopy wide={wide} />
        </section>

        {/* ── and the way in, once more ── */}
        <section data-enter="" style={{ display: 'grid', justifyItems: wide ? 'center' : 'stretch', textAlign: wide ? 'center' : 'left', gap: 0, paddingBottom: wide ? 120 : 72 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: wide ? 'center' : 'flex-start' }}>
            {FORMATS.map(f => <span key={f} style={{ ...label, color: T.sub, padding: '7px 12px', borderRadius: T.r.pill, border: `1px solid ${T.border}` }}>{f}</span>)}
          </div>
          <h2 style={{ ...h2, marginTop: 28, fontSize: wide ? 72 : 40 }}>
            Hear your <span style={{ fontFamily: T.serif, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.03em' }}>first page.</span>
          </h2>
          <div style={{ marginTop: 32, width: wide ? 'auto' : '100%' }}>
            <Button kind="primary" onClick={add} full={!wide} style={{ height: 56, padding: '0 34px', fontSize: 16, fontWeight: 700, borderRadius: wide ? T.r.pill : T.r.lg }}>
              Add a document <Icon name="next" size={16} />
            </Button>
          </div>
          <div style={{ marginTop: 56, fontFamily: T.code, fontSize: 11.5, lineHeight: 1.7, color: T.faint }}>
            Your documents stay on this device. Sign in, and a copy is kept in your own Google Drive for your other devices.<br />The audio never leaves it. <a href="/listen-to-pdf" style={{ color: T.sub, textUnderlineOffset: 3 }}>Listen to a PDF</a> · <a href="/alternatives" style={{ color: T.sub, textUnderlineOffset: 3 }}>Noesis next to other reader apps</a> · <a href="/guides" style={{ color: T.sub, textUnderlineOffset: 3 }}>All guides</a> · <a href="/privacy" style={{ color: T.sub, textUnderlineOffset: 3 }}>Privacy</a> · <a href={SOURCE} style={{ color: T.sub, textUnderlineOffset: 3 }}>Source code</a> · Noesis {__APP_VERSION__}
          </div>
        </section>
      </main>
    </div>
  )
}

// The thing itself, small: a document being read. The lime word moves on by itself (one style rule, no script).
function NowReading({ wide }) {
  return (
    <div aria-hidden data-rise="5" style={{ borderRadius: T.r.xl, border: `1px solid ${T.border}`, background: T.surface, padding: wide ? 30 : 22, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: wide ? 26 : 20 }}>
      <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="waves" size={14} style={{ color: T.lime }} /> Now reading · {SAMPLE.title}
      </div>
      <div style={{ fontFamily: T.serif, fontSize: wide ? 24 : 20, lineHeight: 1.55, color: T.sub }}>
        {SAYS.map((w, i) => <span key={i}><span data-now={w} style={{ '--i': i }}>{w}</span>{' '}</span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: T.r.pill, background: T.text, color: T.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="pause" size={18} /></div>
        {/* the progress line is the mood of the writing, as it is in the player */}
        <svg viewBox="0 0 300 24" preserveAspectRatio="none" style={{ flex: '1 1 0', width: 0, minWidth: 0, height: 24 }}>
          <path d="M0 12 C 30 4, 55 4, 80 11 S 130 20, 160 13 S 215 3, 245 10 S 285 16, 300 12" fill="none" stroke={T.borderHi} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d="M0 12 C 30 4, 55 4, 80 11 S 110 17, 118 16.5" fill="none" stroke={T.text} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ fontFamily: T.code, fontSize: 12, color: T.faint, flexShrink: 0 }}>1x</div>
      </div>
    </div>
  )
}

// The thing itself again: three lines, and Noesis is running on your own computer. Each line is lit in turn by
// the same one keyframe rule as the word being "spoken" above (no script).
const OWN = [['git clone', SOURCE], ['npm', 'install'], ['npm', 'run dev']] // a command shown is a command that runs
function OwnCopy({ wide }) {
  return (
    <div aria-label={`To run Noesis yourself: ${OWN.map(l => l.join(' ')).join(', then ')}.`} role="img" style={{ borderRadius: T.r.xl, border: `1px solid ${T.border}`, background: T.surface, padding: wide ? 30 : 20, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: wide ? 22 : 16 }}>
      <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 6, height: 6, borderRadius: 6, background: T.lime }} /> Your own copy</div>
      <div aria-hidden style={{ display: 'grid', gap: wide ? 14 : 10, fontFamily: T.code, fontSize: wide ? 15 : 13, lineHeight: 1.5, color: T.sub, minWidth: 0 }}>
        {OWN.map(([cmd, arg], i) => (
          <div key={cmd + arg} style={{ display: 'flex', gap: 10, minWidth: 0 }}>
            <span style={{ color: T.faint }}>$</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><span data-now={cmd} style={{ '--i': i * 2, color: T.text }}>{cmd}</span> {arg}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: T.sub }}>{LICENCE.name}. The voices, models and libraries inside keep their own licences, listed in the app.</div>
    </div>
  )
}

// The reader's own switch, working: the same control, and a small picture of what each view is.
function ThreeWays({ wide }) {
  const [view, setView] = useState('text')
  const stage = { height: wide ? 250 : 210, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.bg, overflow: 'hidden', display: 'grid', alignContent: 'center', padding: wide ? 28 : 20 }
  return (
    <div style={{ borderRadius: T.r.xl, border: `1px solid ${T.border}`, background: T.surface, padding: wide ? 24 : 16, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <Segmented value={view} options={VIEWS} onChange={setView} />
      <div style={stage}>
        <div key={view} data-rise="view">
          {view === 'text' && (
            <div style={{ fontFamily: T.serif, fontSize: wide ? 21 : 18, lineHeight: 1.6, color: T.sub }}>
              Stories, laws and arguments travelled by <span style={{ color: T.lime }}>voice</span> long before they travelled on paper.
            </div>
          )}
          {view === 'pages' && (
            <div style={{ width: wide ? 190 : 160, margin: '0 auto', padding: '18px 16px', borderRadius: T.r.xs, background: T.text, display: 'grid', gap: 7 }}>
              {[88, 100, 94, 100, 72, 100, 90, 58].map((w, i) => (
                <div key={i} style={{ height: 6, width: `${w}%`, borderRadius: 3, background: i === 3 || i === 4 ? T.lime : 'rgba(0,0,0,0.22)' }} />
              ))}
            </div>
          )}
          {view === 'focus' && (
            <div style={{ textAlign: 'center', fontSize: wide ? 56 : 44, fontWeight: 800, letterSpacing: '-0.04em', color: T.text }}>
              lis<span style={{ color: T.lime }}>t</span>ening
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: T.sub, minHeight: 42 }}>{VIEW_SAYS[view]}</div>
    </div>
  )
}

// The player's progress line, large: the mood of the writing, played as the page is scrolled.
function MoodLine({ wide }) {
  const h = wide ? 150 : 96
  const line = (colour, width) => (
    <svg viewBox="0 0 640 80" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      <path d={MOOD} fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
  const tag = { ...label, display: 'flex', alignItems: 'center', gap: 6 }
  return (
    <div aria-hidden style={{ borderRadius: T.r.xl, border: `1px solid ${T.border}`, background: T.surface, padding: wide ? '26px 30px' : '18px 18px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <div style={tag}><Icon name="up" size={12} /> brighter</div>
      <div style={{ position: 'relative', height: h, overflow: 'hidden', viewTimelineName: '--noesis-mood' }}>
        {line(T.borderHi, 2)}
        <div data-played="" style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `translateX(${PLAYED_STILL - 100}%)` }}>
          <div data-played-in="" style={{ position: 'absolute', inset: 0, transform: `translateX(${100 - PLAYED_STILL}%)` }}>{line(T.text, 2.5)}</div>
          {/* where the voice is */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, borderRadius: 2, background: T.lime }} />
        </div>
      </div>
      <div style={tag}><Icon name="down" size={12} /> darker</div>
    </div>
  )
}

// One sentence, in the language chosen: what "Listen in another language" does to a whole document.
function Tongues({ wide }) {
  const [at, setAt] = useState('te')
  const now = TONGUES.find(t => t.value === at)
  return (
    <div style={{ borderRadius: T.r.xl, border: `1px solid ${T.border}`, background: T.surface, padding: wide ? 24 : 16, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <Segmented value={at} options={TONGUES} onChange={setAt} />
      <div style={{ minHeight: wide ? 220 : 190, borderRadius: T.r.lg, border: `1px solid ${T.border}`, background: T.bg, display: 'grid', alignContent: 'center', padding: wide ? 28 : 20 }}>
        <div key={at} data-rise="view" lang={at} style={{ fontFamily: T.serif, fontSize: wide ? 24 : 20, lineHeight: 1.6, color: T.sub }}>
          <span style={{ color: T.lime }}>{now.first}</span> {now.rest}
        </div>
      </div>
    </div>
  )
}
