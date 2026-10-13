---
name: goods-and-services
description: How Noesis earns money without breaking what it promised. Use before proposing, designing, pricing or wording anything that is paid for (a plan, a licence, a one-time purchase, a service for a school or a publisher), before adding any third-party voice, model or library, and whenever a page, a video or the app says what Noesis costs.
---

# Goods and services

Tharun, while the app was being built: "Noesis initial will be free but later it'll start generating good and
services and profits for me. That is the plan. You might ask how: I really don't know here but we'll figure it
out, because licensing complication exists." And, when asked whether "₹0 · Free forever" was still a promise
to make: "Let it be for now. After full development is done, we'll work on goods and services skill here."

This skill is that work's starting point. It holds what is already true and decided, the rules any paid thing
must pass, and the questions only Tharun can answer. **It does not decide what is sold or for how much.**
Nothing here is legal or tax advice: before the first rupee is taken, a lawyer reads the licences and a
chartered accountant reads the tax.

## What is already said in public (do not contradict without a decision)

- "Free to use" may be said (Tharun said yes to saying it in public, October 2026). **Never "forever"**, never a price promise. The welcome
  page says "Everyone has access." (He replaced "₹0 Free forever" with that, in the app and in the film.)
- No advertising. Visits are counted without cookies; nothing is sold or shared (privacy page).
- Documents and audio stay on the customer's device; signing in keeps the library in the customer's OWN Google
  Drive; "Noesis keeps no copy of any of it."
- AI features use the customer's own key. Noesis has no AI subscription of its own.

If a paid thing would make any of these false, the page changes in the same release, and Tharun decides it
first. A customer who was told "free to use" for what they use today is not quietly moved behind a price:
if something free becomes paid, that is his decision, announced in the app before it happens.

## Why this is not an ordinary pricing problem

Noesis costs almost nothing to run as customers grow, by design (Tharun: "if any money involved us buying
storage, cloudflare sub is bad... use their phone, hardware, services"):

- the voice, the translation and the reading run on the customer's device;
- sync uses the customer's Google Drive; AI uses the customer's key;
- what is paid for today is fixed and small: the domain (Wix), and free tiers with ceilings that must be watched
  (Cloudflare Pages; redirect.pizza free: 5 hostnames, 250,000 requests a month; Cloudflare Web Analytics).

So there is no meter to charge by, and nothing sold needs to cover a per-customer cost. Whatever is sold is
sold for what it is worth to the customer. **Rule: nothing may be added whose cost grows with customers unless
its price covers that cost from the first sale** (a Noesis-provided AI key or cloud voice is exactly that).

There is also no database of accounts. A purchase needs a way to know who paid that fits this: for example a
signed licence the device keeps, with the payment company as the only record. A plan that needs a customer
database is a change to the architecture and to the privacy page, and is said so when it is proposed.

## The licences, as this repository states them (Credits.jsx, voices.js)

| What | Licence | What it asks |
|---|---|---|
| Voices: 6 | CC BY 4.0 | credit and a link to the licence (shown in Credits) |
| Voices: 5 CC0, 6 public domain | none needed | nothing |
| Voice: 1 | CC BY-SA 4.0 | credit; changes to the voice itself are shared alike |
| Voice: Hindi (Rohan) | IIT Madras TTS licence | its notice stays with the voice; the app says it "may not be resold or sublicensed on its own" |
| NVIDIA online voice | NVIDIA's terms | runs on the customer's own key: their agreement, not Noesis's |
| eSpeak NG (sounds out non-English text) | GPL-3.0 | its notice, its licence text and its source link come with the app; it is run as its own program files |
| Translation: bergamot-translator and the Firefox Translations models | MPL 2.0 | used unchanged, source linked |
| ONNX Runtime, React, PDF.js, Readability and the other libraries; the three fonts | permissive (MIT, Apache-2.0, BSD and the like; the fonts, the SIL Open Font License) | their notices. Credits lists the main ones: the lawyer's reading starts from `package.json`, not from this row |

Rules already in force:

- **Credit yes, money no.** Never add a voice, model, font or library that forbids commercial use (CC BY-NC,
  "research only") or that states no licence. This is why there is no free natural voice for Japanese, Korean,
  Arabic or Chinese yet.
- Every new component gets its line in Credits in the same release.
- **Do not sell a voice, a model or a translator as a thing in itself.** They are other people's work, given
  freely. What Noesis can charge for is its own work and its own service. (This is my reading of "may not be
  resold on its own" and of the spirit of the rest; the lawyer confirms it.)
- The GPL part is the "licensing complication". Selling the app is not forbidden by the GPL, but what charging
  changes about the duties around eSpeak NG is a question for the lawyer, asked before the first sale.

## What a paid thing must pass (ask these in order)

1. **Is it Noesis's own work or service?** Not a third party's voice or model with a price put on it.
2. **Does it leave today's free app as it is** for people who have it?
3. **Does it cost Noesis nothing per customer,** or does its price cover that cost from the first sale?
4. **Do the privacy promises still hold?** Paying must not need a document to leave the device.
5. **Can it be known who paid without a customer database?** If not, say that the architecture changes.
6. **Is every licence above still satisfied** when money changes hands? (Lawyer.)
7. **Can it be said in one plain sentence** what the customer gets and what it costs, with no asterisk?

## How a price is shown (when there is one)

- One sentence: what you get, what it costs, how often. The currency the customer pays in. Tax said plainly.
- No countdown, no "only today", no free trial that turns into a charge unasked, no feature shown and then
  locked at the moment it is needed. A locked thing says it is paid before it is tapped.
- Cancelling is as easy as buying, in the same place.
- Design follows `.claude/skills/design`: one place for it (not a banner on every screen).

## Kinds of thing that could be sold (options to weigh, not decisions)

These are mine, offered for Tharun to accept, change or throw out:

- **A licence for an organisation** (a school, a library, a company): the same app, with help setting it up, a
  named contact, and an invoice. A service, sold to few, with no change to the app.
- **A one-time "supporter" purchase** that changes nothing but says thank you (and perhaps a mark in Settings).
- **Paid extras that are Noesis's own work,** added later and never taken from the free app: for example
  tools for study or for teams.
- **Work for publishers:** their books or journals made listenable through Noesis. A service.
- Not on the list, because they break a rule above: advertising, selling data, selling individual voices, a
  Noesis-provided AI key priced below its cost.

## When Tharun says "let's price it"

1. Write the offer as the one plain sentence (rule 7) and run it through the seven questions.
2. List every place that says what Noesis costs and change them in the same release: the welcome page
   ("Everyone has access."), `/alternatives`, the pages written by `tools/pages.mjs` ("free to use"), the film,
   the privacy page (payment data is new data), Credits.
3. Name the payment company and what it keeps; add it to the privacy page.
4. Have the lawyer read the licences and the accountant read the tax (India: GST on a digital service, and
   what selling abroad adds). **Not verified here; do not state a rate or a threshold from memory.**
5. Be the customer (`.claude/skills/customer`): find the price where a customer would look, pay with a test
   payment, cancel, and check the free app is untouched.

## Decided, 2026-10-13: the first thing offered is a supporter payment

Tharun chose it from the options above: a voluntary payment of any amount, once, that changes nothing in the
app. It passes the seven questions (no entitlement, so no record of who paid is needed).

- **Built and switched off:** a "Support Noesis" card in Settings, About (the only place the app mentions it:
  no banner, no reminder) and the page `/support`, which says before any money moves what the payment is, that
  it is not a charity gift, who takes it and that Noesis never sees card details. Both appear only when
  `src/lib/support.json` has a `url`.
- **Where the money goes:** a payment link from the Razorpay account of Aetheral Catch Seafoods, Tharun's
  company ("setting up separate Noesis Razorpay is hectic and not possible"). The page names that company,
  because that is the name the customer sees on the payment page and their statement.
- **To switch it on:** Tharun creates the payment link or page in Razorpay (the customer chooses the amount) and
  gives the address. Put it in `support.json`, add to the privacy page that a payment is made on Razorpay's
  page and what Razorpay keeps, build, deploy, then pay once with a small real amount and check the name shown.
- **Before switching on, Tharun checks with Razorpay** (not verified here: do not state their rules from
  memory): that this account may take payments for a second product and website, and how such a payment must
  be described. It is worded as a payment to the maker, never as a "donation", on purpose.
- Questions about a payment go to the address in `support.json` (his choice: his Gmail, shown publicly).
- No refund promise is made on the page: that is his to decide and add.

## Questions only Tharun can answer

- Who pays first: one person, or an organisation?
- Is anything that is free today ever to become paid? (Default until he says otherwise: no.)
- One payment, or every month or year?
- Which countries first? (It decides the payment company and the tax work.)
- Is a small customer record acceptable if a plan needs one, or must it stay "the server keeps nothing"?
