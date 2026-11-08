// The room the text is read in: silk. Folds of cloth in the colour of the writing's mood at the sentence being
// read (the same count as the player's line and Focus's light, ArcScrubber): amber where the writing is brighter
// than the book's usual, blue where darker, a quiet grey sheen where it is even. ("It looks so cheap. Make it
// premium, like a silk of cloth, colours spreading across the page with motion", Tharun, 8 November 2026; the
// waves and rings before it were.) What moves, and what it says:
//   the silk     the voice going on: its folds flow while the book is read and rest when it stops
//   the glow     each word as it is said: the cloth brightens and flows a little faster, more for a heavier word
//   the sheen    a new sentence: a band of light passes across the cloth
// The middle of the page, where the text is, stays darker than its edges: the words are the subject.
//
// Drawn by the graphics chip (WebGL), at a quarter of the screen's size and stretched: silk is soft, so the
// stretch is what smooths it. The page's own thread only passes a few numbers once a frame, at most 30 frames a
// second, and only while the book is read; still, it draws one frame and stops. A colour moves to the next mood
// over a second and a half inside the drawing (nothing is repainted by the page). Without WebGL, or for someone who
// asked for less motion, it is one still frame, or two soft lights.
import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { T } from '../theme.js'
import { useArc, moodAt, moodRgb, moodColour } from './ArcScrubber.jsx'
import { useLitWord } from './litword.js'

const STEPS = 8 // the mood in eighths, so a colour is sought once a sentence at most
const SCALE = 4 // the silk is drawn this many times smaller than the screen, then stretched
const FPS = 30 // the most frames a second it is drawn; silk needs no more
const STRENGTH = [0.16, 0.34] // the brightest a fold gets, where the writing is even … where it is felt most
const GLOW_FALL = 1.6 // how quickly a word's glow fades, a share a second
const GLOW_WORD = 0.55 // how much the heaviest word adds to the glow
const SHEEN_S = 2.2 // a sentence's sheen crossing the page
const BLEND_S = 1.5 // one mood's colours becoming the next's

// How heavy a word is when said, 0 to 1: its length, and a stress the text marks (capitals, ! or ?, a pause after it).
export function weightOf(w = '') {
  const letters = w.replace(/[^\p{L}\p{N}]/gu, '')
  const caps = letters.length > 1 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)
  return Math.min(1, Math.min(letters.length, 10) / 14 + (/[!?]/.test(w) ? 0.45 : 0) + (caps ? 0.4 : 0) + (/[,;:.…—]["”')]?$/.test(w) ? 0.12 : 0))
}

const VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
// Silk: the plane is folded by itself a few times (each fold bends the next), and the light falls on the folds'
// crests. `hi` is the mood's colour, `lo` its shadow; `k` how bright, `g` the word's glow, `s` where the sheen is.
const FRAGMENT = `precision mediump float;
uniform vec2 r;uniform float t,k,g,s;uniform vec3 hi,lo;
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec2 q=uv*vec2(r.x/r.y,1.)*1.7;
  for(int i=0;i<4;i++){float f=float(i);q+=.42*vec2(sin(q.y*1.25+t*.19+f*1.3),cos(q.x*1.05-t*.16+f*.9));}
  float fold=.5+.5*sin(q.x*1.5+q.y*.85+t*.24);
  float crest=pow(fold,5.);
  vec3 c=mix(lo,hi,smoothstep(.15,.95,fold))*(.6+.4*g)+hi*crest*(.45+.55*g);
  float band=uv.x*.8+uv.y*.35-s;
  c+=hi*exp(-band*band*55.)*.5*fold;
  float edge=.55+.45*smoothstep(.12,.48,abs(uv.x-.5));
  gl_FragColor=vec4(c*k*edge,1.);
}`

function silk(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' })
  if (!gl) return null
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null }
  const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vs || !fs) return null
  const prog = gl.createProgram()
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW) // one triangle over the screen
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const u = Object.fromEntries(['r', 't', 'k', 'g', 's', 'hi', 'lo'].map(n => [n, gl.getUniformLocation(prog, n)]))
  return (w, h, v) => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h) }
    gl.uniform2f(u.r, w, h); gl.uniform1f(u.t, v.t); gl.uniform1f(u.k, v.k); gl.uniform1f(u.g, v.g); gl.uniform1f(u.s, v.s)
    gl.uniform3fv(u.hi, v.hi); gl.uniform3fv(u.lo, v.lo)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

const target = mood => {
  const hi = moodRgb(mood).map(c => c / 255)
  return { hi, lo: hi.map(c => c * 0.18), k: STRENGTH[0] + (STRENGTH[1] - STRENGTH[0]) * Math.min(1, Math.abs(mood)) ** 0.6 }
}

export function MoodLight({ d, doc, active, reading, spoken }) {
  const line = useArc(d)
  const canvas = useRef(null)
  const state = useRef(null) // what the drawing is now, and what it is moving to
  const { ws, lit } = useLitWord(spoken?.text, spoken?.dur, spoken?.tail, !!reading && !!spoken)
  const at = active >= 0 ? active : d.pos || 0
  const ready = !!line && !!doc?.segs?.length // the mood is counted for English writing long enough to have one
  const mood = ready ? Math.round(moodAt(line, doc.segs.length > 1 ? at / (doc.segs.length - 1) : 0) * STEPS) / STEPS : 0

  // the drawing: started once there is a canvas (when the mood line is ready), it reads what to show from `state`
  useEffect(() => {
    if (!ready) return undefined
    const draw = canvas.current && silk(canvas.current)
    if (!draw) { if (canvas.current) canvas.current.style.display = 'none'; return undefined } // the two lights under it show
    const s = state.current = { ...target(mood), aim: target(mood), t: Math.random() * 100, g: 0, s: -1, reading: !!reading, wake: null }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, last = performance.now(), drawn = 0
    const frame = now => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const ease = Math.min(1, dt / BLEND_S * 3)
      s.hi = s.hi.map((c, i) => c + (s.aim.hi[i] - c) * ease); s.lo = s.lo.map((c, i) => c + (s.aim.lo[i] - c) * ease); s.k += (s.aim.k - s.k) * ease
      if (s.reading && !still) { s.t += dt * (1 + s.g * 1.5); s.g = Math.max(0, s.g - dt * GLOW_FALL); if (s.s >= 0) s.s = s.s > 1.6 ? -1 : s.s + dt / SHEEN_S * 1.8 }
      if (now - drawn >= 1000 / FPS - 2) {
        drawn = now
        const c = canvas.current
        if (c) draw(Math.max(2, Math.round(c.clientWidth / SCALE)), Math.max(2, Math.round(c.clientHeight / SCALE)), { ...s, s: s.s < 0 ? -9 : s.s - 0.3 })
      }
      const settling = Math.abs(s.k - s.aim.k) > 0.002 || s.hi.some((c, i) => Math.abs(c - s.aim.hi[i]) > 0.002)
      if ((s.reading && !still) || settling) raf = requestAnimationFrame(frame)
    }
    s.wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) } }
    s.wake()
    return () => { cancelAnimationFrame(raf); s.wake = null }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // what it is asked to show: the mood, whether the book is being read, a word's glow, a sentence's sheen
  useEffect(() => { const s = state.current; if (s) { s.aim = target(mood); s.wake?.() } }, [mood])
  useEffect(() => { const s = state.current; if (s) { s.reading = !!reading; s.wake?.() } }, [reading])
  useEffect(() => { const s = state.current; if (s && reading && lit >= 0) s.g = Math.min(1, s.g + GLOW_WORD * weightOf(ws[lit])) }, [lit, spoken?.text]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const s = state.current; if (s && reading && spoken?.text) { s.s = 0; s.wake?.() } }, [spoken?.text]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null
  const glow = 0.08 + 0.18 * Math.min(1, Math.abs(mood)) ** 0.6
  return (
    <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: BLEND_S, ease: T.ease }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* without WebGL: two soft lights of the same colour, still */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(60% 50% at 10% 15%, ${moodColour(mood, glow)}, transparent), radial-gradient(60% 50% at 90% 85%, ${moodColour(mood, glow * 0.7)}, transparent)` }} />
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </motion.div>
  )
}
