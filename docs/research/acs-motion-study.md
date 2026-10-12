# Motion study: the ACS categories and shop pages against Noesis (2026-10-12)

Roadmap item 8 asked for transitions "modelled on the ACS categories page". This is the comparison, from the
ACS source (`acs-customer-v3-fixed/src/components/Categories.jsx`, `pages/Shop.jsx`, `theme.js`), read by a
Haiku agent and checked against Noesis by Opus. Numbers are copied from the code, not estimated.

## What ACS does

| Pattern | ACS values |
|---|---|
| Things entering | opacity 0 to 1, y 20 to 0 (cards 32, with scale 0.97 to 1), 0.55 to 0.6 s, ease `[0.05,0.7,0.1,1]` |
| Stagger | 0.1 s per card (three cards); shop grid 0.05 s per card, capped at 0.4 s (card 8 onward) |
| Things leaving | faster than entering: 0.28 to 0.3 s, opacity and scale to 0.97 |
| Press | by size: cards 0.982 to 0.985, tabs 0.93, small pills and buttons 0.92; spring 400 / 35 / 0.8 |
| Lists that reorder | layout animation, spring 170 / 30 / 1.0 |
| Selection | background, text and border swap on the same spring as the press |
| Scroll-linked, shared elements | none on these pages |
| Hover (desktop) | card lifts 5 to 7 px, image scales to 1.05 over 0.65 s, border and shadow deepen |

## Noesis beside it

| Pattern | Noesis | Verdict |
|---|---|---|
| Pages | leave 0.12 s, arrive 0.24 s with direction | faster than ACS on purpose: an app used many times an hour, not a landing page |
| Things entering | opacity and y 6 to 16, 0.2 to 0.36 s | same shape, shorter |
| Stagger | 0.028 s per row, first ten rows only; first-run screen 0.06 s | same idea, same cap |
| Things leaving | 0.09 to 0.14 s | same rule (leave faster than arrive) |
| Press | 0.96 on buttons; **nothing on document cards** | gap: fixed, cards now give 0.985, rows 0.98 (`T.tap`) |
| Lists that reorder | `layout="position"`, timed spring 0.3 s | same |
| Selection | one white pill slides between choices (`layoutId`) | goes further than ACS |
| Scroll-linked, shared elements | reading line, bar title, cover that flies between library and reader, player cover | goes further than ACS |
| Hover (desktop) | background only | left: rows in a list should not jump under the pointer |

## Taken from ACS
Press depth by size (the one real gap). Everything else was already the same rule at app speed.

## Not taken, and why
The 0.55 to 0.6 s entrances (too slow for something opened dozens of times a day), hover lift and image zoom
(Noesis rows are a dense list, not a showcase), the video and ripple effects (showcase decoration).
