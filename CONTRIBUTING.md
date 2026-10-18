# Contributing to Noesis

Thank you for wanting to make Noesis better. A few things keep it what it is.

## Before you write code

- **Open an issue first** for anything larger than a fix, so we can agree on the shape before you spend the time.
- **Read the rules the app is built by.** They live in `.claude/skills/`: `design` (one of everything, each
  screen with one purpose), `motion` (transform and opacity only, Back closes the top thing), `customer`
  (test it the way a person uses it) and `goods-and-services` (what may and may not cost money). They were
  written down as the app was made, and a change is judged by them.
- **Promises come first.** Documents and audio stay on the device; sync is the customer's own Drive; AI uses the
  customer's own key. A change that breaks one of these needs a very good reason and a change to the privacy
  page in the same pull request.
- **No new component without a licence that allows commercial use** (no "non-commercial", no "research only",
  nothing without a stated licence), and every new one gets its line in Credits.

## Before you open a pull request

```bash
npm test                     # unit tests
npx vite --port 5180 --strictPort --host
node e2e/qa.mjs              # every feature, on that dev server
node e2e/chaos.mjs           # the impatient random customer
```

Say in the pull request what you changed, why, and how you checked it as a customer would.

## Your contribution and the licence

Noesis is licensed under the GNU AGPL-3.0. So that Noesis can also be offered to organisations under other
terms (that is how its work is paid for), its maker needs the right to do that with every part of it. Before a
contribution is merged you will be asked to agree, in the pull request, that:

- the work is yours to give (or you have the right to give it), and
- you license it to Tharun Gundu under the AGPL-3.0 **and** allow him to offer it under other licences too.

You keep the copyright in what you wrote.

<!-- Draft wording, to be read by a lawyer before the first outside contribution is merged. -->
