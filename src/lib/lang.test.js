// M7: Telugu/Hindi documents are voiced with eSpeak-ng phonemes. Pure — runs in Node tests.
// M10: twelve more listening languages with NVIDIA cloud voices.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LANGS, detectLang, isEnglish } from './lang.js'

test('plain English is en', () => {
  assert.equal(detectLang('Hello there. This is a plain English document with several sentences.'), 'en')
})

test('plain Hindi is hi', () => {
  assert.equal(detectLang('नमस्ते, यह एक परीक्षण है। आप कैसे हैं? यह हिंदी में एक लंबा वाक्य है।'), 'hi')
})

test('plain Telugu is te', () => {
  assert.equal(detectLang('నమస్కారం, ఇది ఒక పరీక్ష. మీరు ఎలా ఉన్నారు? ఇది తెలుగులో ఒక పొడవైన వాక్యం.'), 'te')
})

test('English with one Hindi sentence stays en', () => {
  const english = 'This is an English paper. '.repeat(20)
  assert.equal(detectLang(`${english} यह एक हिंदी वाक्य है।`), 'en')
})

test('Telugu with English names and numbers stays te', () => {
  const telugu = 'నమస్కారం, ఇది ఒక పరీక్ష. మీరు ఎలా ఉన్నారు? '.repeat(6)
  assert.equal(detectLang(`${telugu} John Smith 2024 Hyderabad.`), 'te')
})

test('empty text is en', () => {
  assert.equal(detectLang(''), 'en')
  assert.equal(detectLang(null), 'en')
  assert.equal(detectLang('1234 ... !!!'), 'en')
})

test('LANGS holds thirteen languages with NVIDIA codes (Telugu has none)', () => {
  assert.deepEqual(Object.keys(LANGS), ['en', 'hi', 'te', 'es', 'fr', 'de', 'it', 'pt', 'vi', 'zh', 'ja', 'ko', 'ar'])
  assert.equal(LANGS.hi.locale, 'hi')
  assert.equal(LANGS.te.locale, 'te')
  assert.equal(LANGS.en.nv, 'en-US')
  assert.equal(LANGS.es.nv, 'es-US')
  assert.equal(LANGS.fr.nv, 'fr-FR')
  assert.equal(LANGS.de.nv, 'de-DE')
  assert.equal(LANGS.zh.nv, 'zh-CN')
  assert.equal(LANGS.vi.nv, 'vi-VN')
  assert.equal(LANGS.it.nv, 'it-IT')
  assert.equal(LANGS.hi.nv, 'hi-IN')
  assert.equal(LANGS.ja.nv, 'ja-JP')
  assert.equal(LANGS.ko.nv, 'ko-KR')
  assert.equal(LANGS.ar.nv, 'ar-AR')
  assert.equal(LANGS.pt.nv, 'pt-BR')
  assert.equal(LANGS.te.nv, undefined)
})

test('isEnglish: English by its common words; French and Telugu are not', () => {
  assert.equal(isEnglish('The listener hears a sentence long before the eye would have found it on the page, and that is the point of this book.'), true)
  assert.equal(isEnglish("Le lecteur entend une phrase bien avant que l'oeil ne la trouve sur la page, et c'est tout l'objet de ce livre."), false)
  assert.equal(isEnglish('నమస్కారం, ఇది ఒక పరీక్ష. మీరు ఎలా ఉన్నారు?'), false)
  assert.equal(isEnglish(''), false)
})

test('Spanish paragraph detects es', () => {
  assert.equal(detectLang('El libro está entre los más leídos donde hay lectores. Los capítulos están llenos de historias que cruzan esta tierra y aquella. Pero sus páginas también hablan de viajes, porque este autor cuenta lo que vio y lo que soñó.'), 'es')
})

test('French paragraph detects fr', () => {
  assert.equal(detectLang('Le livre est dans les mains de son lecteur. Les pages racontent cette histoire avec des mots simples. Nous lisons tout avec plaisir, vous aussi, quand voici venus les jours où leurs voix portent loin.'), 'fr')
})

test('German paragraph detects de', () => {
  assert.equal(detectLang('Der Mann und die Frau gehen mit dem Buch von Haus zu Haus. Das Wetter ist nicht gut, aber ein Gedanke trägt sie weiter. Eine Geschichte und den Bericht, die auf dem Tisch liegen, oder wenn Worte fehlen, auch Schweigen hilft und sich Zeit nimmt.'), 'de')
})

test('Italian paragraph detects it', () => {
  assert.equal(detectLang('Il libro della sera è nella casa dove molto si legge. Lo sguardo corre sopra le pagine e sotto la luce, senza fretta. Della storia e degli amici sono parte, hanno detto che questo racconto è bello, quello invece è lungo, quale scegliere quando non ce tempo.'), 'it')
})

test('Portuguese paragraph detects pt', () => {
  assert.equal(detectLang('O livro está na mesa para quem chega hoje. Os leitores dizem como foi bom ler essa história e esse capítulo. Eles falam muito pois aquilo que leram não se esquece, uma tarde inteira com palavras, não há mais pressa.'), 'pt')
})

test('Vietnamese paragraph detects vi', () => {
  assert.equal(detectLang('Cuốn sách này là của tôi, trong đó có những câu chuyện mà người đọc không thể quên. Bạn sẽ thấy rằng với một buổi chiều, chúng ta được sống nhiều cuộc đời, tôi tin là vậy, bạn có nghĩ gì không.'), 'vi')
})

test('Chinese paragraph detects zh', () => {
  assert.equal(detectLang('这本书讲述了一个关于旅行和记忆的故事。读者在每一个章节中都能看到山川和城市，听到风的声音，感受到时间的流逝。'), 'zh')
})

test('Japanese paragraph detects ja', () => {
  assert.equal(detectLang('この本は旅と記憶についての物語です。読者はそれぞれの章で山や街を見て、風の音を聞きながら時間の流れを感じます。'), 'ja')
})

test('Korean paragraph detects ko', () => {
  assert.equal(detectLang('이 책은 여행과 기억에 대한 이야기입니다. 독자는 각 장에서 산과 도시를 보고 바람 소리를 들으며 시간의 흐름을 느낍니다.'), 'ko')
})

test('Arabic paragraph detects ar', () => {
  assert.equal(detectLang('هذا الكتاب يحكي قصة عن السفر والذاكرة. يرى القارئ في كل فصل الجبال والمدن، ويسمع صوت الريح، ويشعر بمرور الوقت.'), 'ar')
})
