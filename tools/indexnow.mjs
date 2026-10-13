// Tells the search engines that take IndexNow (Bing, Yandex, Seznam, Naver and those that share with them) which
// pages of the site are new or changed, so they are fetched now and not when a crawler next happens by.
// Google does not take IndexNow: for Google, the sitemap and Search Console's "Request indexing" do this.
//   node tools/indexnow.mjs          after a deploy that added or changed a public page
// The key is public by design: it is the name of a file on the site (public/<key>.txt), which is how the
// engines know the request comes from the site's owner.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const KEY = '8f324514d77d787a27d7192e4f7f507f'
const HOST = 'www.noesisaudio.com'
const sitemap = readFileSync(fileURLToPath(new URL('../public/sitemap.xml', import.meta.url)), 'utf8')
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
})
console.log(`IndexNow: ${urlList.length} addresses sent, answer ${res.status} ${res.statusText}`, (await res.text()).slice(0, 200))
