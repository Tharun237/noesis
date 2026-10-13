// The plain pages people arrive at from a search: one page for each thing someone types when they want what
// Noesis does ("pdf to audio", "epub to audiobook", "hindi text to speech"...). Each answers that one question
// with what the app really does for it, how, and what to know first. Written here once, in one shape, so they
// cannot drift apart; `node tools/pages.mjs` writes them into public/ with the sitemap.
//
// Rules for every line (the same as /listen-to-pdf and /privacy): a fact about the app as it is today, nothing
// about other products, no promise the app does not keep. When the app changes, the page changes with it.
// /listen-to-pdf, /alternatives and /privacy are written by hand and are only listed here (HAND).
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SITE = 'https://www.noesisaudio.com'
const out = name => fileURLToPath(new URL(`../public/${name}`, import.meta.url))
const HAND = [
  { slug: 'listen-to-pdf', name: 'Listen to a PDF' },
  { slug: 'alternatives', name: 'Noesis next to other reader apps' },
]
const LANGUAGES = 'English, Hindi, Telugu, Spanish, French, German, Italian, Portuguese and Vietnamese'
const FIRST = 'The first time, the voice downloads once (about 60 MB). After that it works with no connection.'

const PAGES = [
  {
    slug: 'pdf-to-audio', name: 'PDF to audio',
    title: 'PDF to audio, free and on your own device',
    description: 'Turn a PDF into audio with Noesis: a natural voice made on your own phone or computer reads it to you, and you can save the audio as a file. Free, offline, nothing uploaded.',
    short: 'Add a PDF to Noesis and it becomes audio: a natural voice, made on your own device, reads it to you. You can listen in the app or save the audio as a file. It is free to use, and the PDF is never uploaded.',
    parts: [
      ['How to turn a PDF into audio', `<ol><li><strong>Open Noesis</strong> in your browser. There is nothing to install and no account to make.</li><li><strong>Add the PDF.</strong> Its text is read on your device.</li><li><strong>Press Play.</strong> ${FIRST}</li><li><strong>To keep the audio,</strong> open the document's menu and choose Save audio once the whole document has been made.</li></ol>`],
      ['What the audio is like', '<ul><li><strong>It sounds like prose.</strong> Page numbers, running headers and reference lists are left out.</li><li><strong>A table is described,</strong> not read out cell by cell.</li><li><strong>You choose the voice and the speed,</strong> and can change either at any time.</li><li><strong>The saved file is Opus audio</strong> (or WAV in a browser that cannot make Opus). It is not MP3; most players and phones open Opus.</li></ul>'],
      ['What to know first', '<ul><li>Your device makes the audio, so a long book takes a while to finish on an older phone. You can start listening after a few seconds; the rest is made ahead of you.</li><li>A scanned PDF is read from the text stored inside the scan. If that text is poor, the audio will be too.</li></ul>'],
    ],
    faq: [
      ['Is it really free?', 'Yes. The voice runs on your own device, so there is no per-minute cost to pass on. There is no account, no trial and no limit on length.'],
      ['Is my PDF uploaded anywhere?', 'No. The PDF is opened and read by your own browser. Only if you sign in, to keep the same library on two devices, is the text kept in your own Google Drive.'],
      ['Can I get an MP3?', 'Not an MP3. Save audio gives an Opus file (WAV where a browser cannot make Opus), which phones and most players open.'],
    ],
  },
  {
    slug: 'text-to-speech', name: 'Text to speech',
    title: 'Text to speech that runs on your own device',
    description: 'Paste any text into Noesis and hear it in a natural voice made on your own device. Free, no account, works offline, and the text is not sent anywhere.',
    short: 'Paste text into Noesis and a natural voice reads it to you. The voice is made by your own phone or computer: the text is not sent to a server, it works with no connection, and it is free to use.',
    parts: [
      ['How to hear a text', `<ol><li><strong>Open Noesis</strong> and choose Add, then Text.</li><li><strong>Paste the text.</strong> Markdown headings are understood, so a long text keeps its chapters.</li><li><strong>Press Play.</strong> ${FIRST}</li></ol>`],
      ['More than a read-aloud button', '<ul><li><strong>The word being said is lit</strong> as it is said, so you can read along.</li><li><strong>Focus</strong> shows one word at a time, large, for reading without moving your eyes.</li><li><strong>It remembers your place,</strong> and keeps every text you add in a library.</li><li><strong>Speed, sleep timer and bookmarks</strong> work as in any player.</li></ul>'],
      ['Voices and languages', `<p>There are natural voices for ${LANGUAGES}. Each voice downloads once and then works offline. If you would rather not wait for a download, the voice built into your device can read instead.</p>`],
    ],
    faq: [
      ['Is there a limit on how much text?', 'No. A whole book can be pasted. Your device makes the audio as you listen.'],
      ['Does it need the internet?', 'Only to open the app the first time and to download a voice once. After that it works with no connection.'],
      ['Where does my text go?', 'Nowhere. It is kept in your browser, on your device.'],
    ],
  },
  {
    slug: 'epub-to-audiobook', name: 'EPUB to audiobook',
    title: 'Turn an EPUB into an audiobook, free',
    description: 'Open an EPUB book in Noesis and listen to it as an audiobook: a natural voice made on your own device, chapters kept, your place remembered. Free and offline.',
    short: 'Open an EPUB in Noesis and listen to it like an audiobook. The voice is made on your own device, the chapters are kept, and your place is remembered. It is free to use and works offline.',
    parts: [
      ['How to listen to an EPUB', `<ol><li><strong>Open Noesis</strong> and add the EPUB file.</li><li><strong>Press Play.</strong> ${FIRST}</li><li><strong>Use Contents</strong> to move between chapters.</li></ol>`],
      ['What you get', '<ul><li><strong>The book starts at the book,</strong> not at the copyright page.</li><li><strong>A sleep timer</strong> that can stop at the end of the chapter.</li><li><strong>Your place, on every device,</strong> if you sign in: the library is kept in your own Google Drive.</li><li><strong>A line that follows the mood of the book,</strong> so you can see the heavy chapter coming.</li><li><strong>The audio as a file,</strong> if you want to take it to another player.</li></ul>'],
      ['What to know first', '<ul><li>The book must be an EPUB without copy protection. Books bought inside a store app are usually locked to that app and cannot be opened by anything else.</li><li>A long book takes your device a while to turn into audio. You can start within seconds; the rest is made ahead of you.</li></ul>'],
    ],
    faq: [
      ['Does it work with Kindle books?', 'Only with books that are not copy-protected. Most books bought in a store app are locked to it.'],
      ['Can I listen in another language?', `Yes. A book can be translated on your device and read in ${LANGUAGES}. You can translate one chapter or the whole book.`],
      ['Do I need an account?', 'No. Signing in with Google is optional and only keeps the same library on your phone and your computer.'],
    ],
  },
  {
    slug: 'listen-to-research-papers', name: 'Listen to research papers',
    title: 'Listen to research papers, without the page furniture',
    description: 'Give Noesis a paper as a PDF or an arXiv link and hear it read as prose: no page numbers, running headers or reference lists. Free, on your own device.',
    short: 'Give Noesis a paper, as a PDF or as an arXiv link, and it is read to you as prose. Page numbers, running headers and the reference list are left out, and a table is described instead of recited. It is free to use and runs on your own device.',
    parts: [
      ['How to listen to a paper', `<ol><li><strong>Open Noesis</strong> and add the PDF, or choose Link and paste the paper's address. An arXiv link fetches the paper itself, not the abstract page.</li><li><strong>Press Play.</strong> ${FIRST}</li></ol>`],
      ['Made for papers', '<ul><li><strong>Only what matters is read.</strong> Headers, footers, page numbers and the reference list are skipped.</li><li><strong>Figures, tables and equations are marked,</strong> and you can choose to skip them while listening.</li><li><strong>Follow on the original pages,</strong> with the sentence being read marked on the page.</li><li><strong>The works a passage cites</strong> can be opened from the passage.</li><li><strong>Hard words</strong> in the paper are listed, most used first.</li></ul>'],
      ['With your own AI key', '<p>Noesis has no AI subscription of its own. If you add a key from your own Google or NVIDIA account, it can also summarise a paper, answer questions about it, take an equation apart step by step and describe a figure. Without a key, everything above still works.</p>'],
    ],
    faq: [
      ['Does it read the equations?', 'Equations are marked as equations. With your own AI key an equation can be explained step by step; without one you can have equations skipped.'],
      ['Is the paper uploaded?', 'A PDF you add is read by your own browser. For a link, the page is fetched for you and handed to your device; it is not kept.'],
      ['Can I listen to it in my own language?', `Yes. It can be translated on your device and read in ${LANGUAGES}.`],
    ],
  },
  {
    slug: 'article-to-audio', name: 'Web article to audio',
    title: 'Listen to any web article by its link',
    description: 'Paste the link of an article into Noesis and hear it in a natural voice made on your own device. Free, no account, and it joins your library for later.',
    short: 'Paste the link of an article into Noesis and it is read to you in a natural voice. It joins your library, so a reading list becomes a listening list. It is free to use.',
    parts: [
      ['How to listen to an article', `<ol><li><strong>Open Noesis</strong>, choose Add, then Link.</li><li><strong>Paste the address</strong> of the article.</li><li><strong>Press Play.</strong> ${FIRST}</li></ol>`],
      ['What happens to the page', '<ul><li><strong>The article is kept;</strong> the menus and the rest of the page around it are left out.</li><li><strong>It is saved in your library</strong> with its place, so you can stop and come back.</li><li><strong>Queue several:</strong> with autoplay turned on in Settings, the next one starts when one ends.</li></ul>'],
      ['What to know first', '<ul><li>A browser does not let one site read another, so the page is fetched for you by Noesis and handed to your device. It is not kept.</li><li>A page behind a login or a paywall cannot be fetched. Paste its text instead.</li></ul>'],
    ],
    faq: [
      ['Does it work on any site?', 'On pages anyone can open. A page that needs a login cannot be fetched; its text can be pasted in instead.'],
      ['Can I listen later with no connection?', 'Yes. Once an article is in your library and its audio is made, it plays offline.'],
      ['Is there a browser extension?', 'No. Noesis is a web app you can add to your home screen; links are pasted into it.'],
    ],
  },
  {
    slug: 'word-to-audio', name: 'Word document to audio',
    title: 'Listen to a Word document',
    description: 'Open a Word document (.docx) in Noesis and hear it read in a natural voice made on your own device. Free, offline, and the file is not uploaded.',
    short: 'Open a Word document in Noesis and hear it read to you. The voice is made on your own device, so the document stays with you. It is free to use.',
    parts: [
      ['How to listen to a Word document', `<ol><li><strong>Open Noesis</strong> and add the .docx file.</li><li><strong>Press Play.</strong> ${FIRST}</li></ol>`],
      ['Useful for your own writing', '<ul><li><strong>Hearing a draft</strong> shows what the eye skips: a missing word, a sentence that runs too long.</li><li><strong>The word being said is lit,</strong> so you can find the place in your document.</li><li><strong>Headings are kept,</strong> so a long report has its sections.</li></ul>'],
      ['What to know first', '<ul><li>The file must be .docx. An older .doc file needs saving as .docx first.</li><li>Nothing is changed in your document; Noesis only reads it.</li></ul>'],
    ],
    faq: [
      ['Is my document private?', 'Yes. It is read by your own browser and kept on your device.'],
      ['Does it work offline?', 'Yes, once the app has been opened once and a voice has been downloaded.'],
      ['What about Google Docs?', 'Download the document as .docx or PDF, or paste its text.'],
    ],
  },
  {
    slug: 'hindi-text-to-speech', name: 'Hindi text to speech', lang: 'hi',
    title: 'Hindi text to speech: listen to PDFs and books in Hindi',
    description: 'Hear documents in Hindi with Noesis: a natural Hindi voice made on your own device, and free translation of English documents into Hindi. Works offline.',
    short: 'Noesis reads documents aloud in Hindi with a natural voice made on your own device. A Hindi document is read as it is; an English one can be translated into Hindi on your device first. It is free to use.',
    own: 'नोएसिस आपके PDF, किताबें और लेख हिंदी में पढ़कर सुनाता है। आवाज़ आपके अपने फ़ोन या कंप्यूटर पर बनती है, इसलिए फ़ाइल कहीं अपलोड नहीं होती और यह इंटरनेट के बिना भी चलता है। इसका इस्तेमाल मुफ़्त है।',
    parts: [
      ['How to listen in Hindi', `<ol><li><strong>Open Noesis</strong> and add a PDF, a book, a link or pasted text.</li><li><strong>If the document is in English,</strong> open its menu, choose Listen in another language, then Hindi. The translator downloads once (20 to 55 MB) and then works offline.</li><li><strong>Press Play.</strong> The Hindi voice downloads once, then works with no connection.</li></ol>`],
      ['What to know first', '<ul><li>Translation is done by your own device. It is plain and accurate rather than literary; with your own AI key it reads more naturally.</li><li>A long book can be translated a chapter at a time, and you are told how long it will take before you start.</li><li>A Hindi document can also be heard in English, or in another of the languages Noesis reads.</li></ul>'],
    ],
    faq: [
      ['Is the Hindi voice free?', 'Yes. It runs on your device, so nothing is charged for using it.'],
      ['Can it read a Hindi PDF?', 'Yes, if the PDF holds real text. A scanned page is read from the text stored in the scan.'],
      ['Does translation need the internet?', 'Only to download the translator once. After that it works offline.'],
    ],
  },
  {
    slug: 'telugu-text-to-speech', name: 'Telugu text to speech', lang: 'te',
    title: 'Telugu text to speech: listen to PDFs and books in Telugu',
    description: 'Hear documents in Telugu with Noesis: natural Telugu voices made on your own device, and free translation of English documents into Telugu. Works offline.',
    short: 'Noesis reads documents aloud in Telugu with a natural voice made on your own device. A Telugu document is read as it is; an English one can be translated into Telugu on your device first. It is free to use.',
    own: 'నోయెసిస్ మీ PDFలు, పుస్తకాలు, వ్యాసాలను తెలుగులో చదివి వినిపిస్తుంది. స్వరం మీ ఫోన్ లేదా కంప్యూటర్‌లోనే తయారవుతుంది, కాబట్టి ఫైల్ ఎక్కడికీ అప్‌లోడ్ కాదు, ఇంటర్నెట్ లేకపోయినా పనిచేస్తుంది. దీన్ని ఉచితంగా వాడుకోవచ్చు.',
    parts: [
      ['How to listen in Telugu', `<ol><li><strong>Open Noesis</strong> and add a PDF, a book, a link or pasted text.</li><li><strong>If the document is in English,</strong> open its menu, choose Listen in another language, then Telugu. The translator downloads once (20 to 55 MB) and then works offline.</li><li><strong>Press Play.</strong> The Telugu voice downloads once, then works with no connection.</li></ol>`],
      ['What to know first', '<ul><li>There are two Telugu voices to choose from.</li><li>Translation is done by your own device. It is plain and accurate rather than literary; with your own AI key it reads more naturally.</li><li>A long book can be translated a chapter at a time, and you are told how long it will take before you start.</li></ul>'],
    ],
    faq: [
      ['Is the Telugu voice free?', 'Yes. It runs on your device, so nothing is charged for using it.'],
      ['Can it read a Telugu PDF?', 'Yes, if the PDF holds real text. A scanned page is read from the text stored in the scan.'],
      ['Does translation need the internet?', 'Only to download the translator once. After that it works offline.'],
    ],
  },
]

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const CSS = `:root { color-scheme: dark; }
      body { margin: 0; background: #000; color: rgba(255, 255, 255, 0.72); font: 17px/1.65 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
      main { max-width: 680px; margin: 0 auto; padding: 56px 24px 96px; }
      a { color: #fff; text-underline-offset: 3px; }
      .mark { font-size: 15px; font-weight: 700; letter-spacing: 0.02em; color: #fff; text-decoration: none; }
      h1 { margin: 56px 0 8px; font-size: 44px; line-height: 1.05; letter-spacing: -0.04em; color: #fff; }
      h2 { margin: 52px 0 10px; font-size: 22px; line-height: 1.25; letter-spacing: -0.02em; color: #fff; }
      h3 { margin: 26px 0 6px; font-size: 17px; color: #fff; }
      p, li { margin: 0 0 14px; }
      ul, ol { margin: 0 0 14px; padding-left: 22px; }
      strong { color: #fff; font-weight: 600; }
      .short { margin-top: 28px; font-size: 21px; line-height: 1.5; color: #fff; }
      .own { font-size: 19px; line-height: 1.7; color: rgba(255, 255, 255, 0.86); }
      .go { display: inline-block; margin: 18px 0 6px; padding: 15px 28px; border-radius: 999px; background: #fff; color: #000; font-weight: 700; text-decoration: none; }
      .foot { margin-top: 64px; font-size: 14px; color: rgba(255, 255, 255, 0.45); }`
const HEAD = (title, description, slug) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <title>${esc(title)} · Noesis</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${SITE}/${slug}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Noesis" />
    <meta property="og:url" content="${SITE}/${slug}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/png" sizes="192x192" href="/pwa-192x192.png" />
    <!-- Written by tools/pages.mjs: change it there. A plain page, readable by anyone and anything. Every statement
         is a fact about what the app does today; nothing is said about other products. -->
    <style>
      ${CSS}
    </style>`
const BEACON = `    <!-- the anonymous visit counter (see /privacy): the only script on this page -->
    <script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "42ae1636ca594588a3e90d9a07a7209d"}'></script>`

function page(p) {
  const others = [...PAGES.filter(q => q.slug !== p.slug), ...HAND]
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
  return `${HEAD(p.title, p.description, p.slug)}
    <script type="application/ld+json">${JSON.stringify(faq)}</script>
  </head>
  <body>
    <main>
      <a class="mark" href="/">Noesis</a>
      <h1>${esc(p.title)}</h1>

      <p class="short">${p.short}</p>
${p.own ? `      <p class="own" lang="${p.lang}">${p.own}</p>\n` : ''}      <a class="go" href="/">Open Noesis</a>
${p.parts.map(([h, body]) => `\n      <h2>${esc(h)}</h2>\n      ${body}`).join('\n')}

      <h2>Questions</h2>
${p.faq.map(([q, a]) => `      <h3>${esc(q)}</h3>\n      <p>${a}</p>`).join('\n')}

      <a class="go" href="/">Open Noesis</a>

      <h2>More that Noesis does</h2>
      <ul>
${others.map(q => `        <li><a href="/${q.slug}">${esc(q.name)}</a></li>`).join('\n')}
      </ul>

      <p class="foot"><a href="/guides">All guides</a> · <a href="/privacy">Privacy</a> · <a href="/">noesisaudio.com</a></p>
    </main>
${BEACON}
  </body>
</html>
`
}

// Paying for Noesis (.claude/skills/goods-and-services): written only when there is somewhere to pay
// (src/lib/support.json has a link). It says what the payment is, who takes it and what it does not do, before
// the customer is sent to the payment page.
const SUPPORT = JSON.parse(readFileSync(fileURLToPath(new URL('../src/lib/support.json', import.meta.url)), 'utf8'))
function support() {
  return `${HEAD('Support Noesis', 'Noesis is free to use. If it is worth something to you, you can support it with a payment of any amount. Nothing in the app changes.', 'support')}
  </head>
  <body>
    <main>
      <a class="mark" href="/">Noesis</a>
      <h1>Support Noesis</h1>
      <p class="short">Noesis is free to use, and stays as it is whether you pay or not. If it is worth something to you, you can support it with a payment of any amount, once.</p>
      <a class="go" href="${esc(SUPPORT.url)}" rel="noopener">Support Noesis</a>

      <h2>What this payment is</h2>
      <ul>
        <li><strong>It is voluntary.</strong> Nothing in the app is unlocked by paying, and nothing is held back if you do not.</li>
        <li><strong>It is a payment to the maker, not a gift to a charity.</strong> There is no tax receipt for giving.</li>
        <li><strong>It is taken on Razorpay's payment page, in the name of ${esc(SUPPORT.receiver)}</strong>, the maker's company. That is the name you will see on the payment page and on your statement.</li>
        <li><strong>Noesis never sees your card or bank details.</strong> They are entered on Razorpay's page, not here, and nothing about your library goes with them.</li>
        <li><strong>What it pays for:</strong> the address you are on, and the time to keep building.</li>
      </ul>

      <h2>A question about a payment</h2>
      <p>Write to <a href="mailto:${esc(SUPPORT.email)}">${esc(SUPPORT.email)}</a>.</p>

      <p class="foot"><a href="/guides">All guides</a> · <a href="/privacy">Privacy</a> · <a href="/">noesisaudio.com</a></p>
    </main>
${BEACON}
  </body>
</html>
`
}

function hub() {
  const all = [...HAND, ...PAGES]
  return `${HEAD('What you can listen to with Noesis', 'Everything Noesis reads aloud, one page for each: PDFs, EPUB books, Word documents, research papers, web articles and pasted text, in nine languages.', 'guides')}
  </head>
  <body>
    <main>
      <a class="mark" href="/">Noesis</a>
      <h1>What you can listen to with Noesis</h1>
      <p class="short">Noesis reads documents aloud in a natural voice made on your own device. It is free to use, works offline, and nothing you add is uploaded. One page for each thing it does:</p>
      <ul>
${all.map(q => `        <li><a href="/${q.slug}">${esc(q.name)}</a>${q.description ? `: ${esc(q.description.split('. ')[0])}.` : ''}</li>`).join('\n')}
      </ul>
      <a class="go" href="/">Open Noesis</a>
      <p class="foot"><a href="/privacy">Privacy</a> · <a href="/">noesisaudio.com</a></p>
    </main>
${BEACON}
  </body>
</html>
`
}

for (const p of PAGES) writeFileSync(out(`${p.slug}.html`), page(p))
writeFileSync(out('guides.html'), hub())
if (SUPPORT.url) writeFileSync(out('support.html'), support()); else rmSync(out('support.html'), { force: true })
const urls = ['', ...HAND.map(p => p.slug), ...PAGES.map(p => p.slug), 'guides', ...(SUPPORT.url ? ['support'] : []), 'privacy']
writeFileSync(out('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<!-- The pages of Noesis that are for everyone (written by tools/pages.mjs). The app itself (a library, a document
     being read) is each person's own and lives on their device: it has no public pages to list. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}/${u}</loc></url>`).join('\n')}
</urlset>
`)
// the addresses the app's service worker must leave alone (vite.config.js reads this)
export const PLAIN_PAGES = [...PAGES.map(p => p.slug), 'guides', 'support', 'voice-test'] // voice-test: a page for measuring a voice on a device, not linked from anywhere
console.log(`${PAGES.length + 1} pages and the sitemap written:`, PLAIN_PAGES.join(', '))
