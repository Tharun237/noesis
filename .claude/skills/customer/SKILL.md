---
name: customer
description: Test Noesis the way a real customer uses it, not the way its author walks it. Use before calling ANY screen, gesture, view or animation done, after any change to the reader, library, player, sheets or navigation, and whenever Tharun reports something "breaking", "blank", "stuck" or "not feeling right". Runs the impatient random customer (e2e/chaos.mjs) and tells how to read it.
---

# The customer does not follow your script

Tharun, 2026-10-12, after finding by hand that the reader went blank when he scrolled, and that the page view
had no way back to the place being read: "The customer won't follow your code. He won't follow your gestures.
He won't do sequential orders. He will be snappy, aggressive, clicking everything. The issue is ME exploring
and finding every single bug: that is a very bad way."

A scripted walk (`e2e/qa.mjs`, `e2e/sweep.mjs`) proves only the paths its author thought of. Both passed
41 of 41 while the reader went blank after one change of view, because no script changed the view and THEN
scrolled. So no screen is done until the impatient customer has walked it.

## What to run, every time something a customer can see has changed

```
node e2e/chaos.mjs                      # phone, a new random walk
node e2e/chaos.mjs --wide               # desktop
node e2e/chaos.mjs --seed 7 --show      # walk a finding again, printing every action
```
Fresh dev server on port 5180 first (`npx vite --port 5180 --strictPort --host`). At least three seeds on the
phone and one on desktop before shipping. It uses its own browser profile (`.chaos-profile`), so it may
delete, rename and re-voice freely. Exit code 1 means it found something.

It taps whatever is really on screen (several things in a row, before the first has finished), hammers the
same control, flings with real finger swipes, presses Back and Escape mid-animation, pulls sheets down, types
into fields, turns the phone. After every burst it looks at the screen as a person would:

| It checks | Because a customer sees |
|---|---|
| the page is not blank between the header and the bottom bar | "the complete page becomes blank" |
| while it is reading, the place is on screen or "Back to now" is offered | "it doesn't give proper back to the current status" |
| one page, one header, at most one sheet and one menu | things stacked on things |
| a sheet on screen has a history entry | Back leaving the page instead of closing the sheet |
| nothing is wider than the screen, nothing stuck half-faded, no flying copy left behind | broken layout, stuck animations |
| the app threw nothing and did not leave itself | crashes |
| (listed, not failed) taps after which nothing changed, and freezes over 0.7 s | dead buttons, jank |

## Rules that came out of using it

1. **Prove the checker before trusting it.** The first version said "nothing broke" while a known bug was put
   back on purpose: its swipe did not move the page, and it counted one floating button as "not blank". Every
   new check is tried against a deliberately broken build first (break it, run, see the finding, restore).
2. **Every bug Tharun finds by hand becomes a check here**, in his words, before it is fixed. Then it is fixed
   and the same seed is walked again.
3. **A finding is looked at, not argued with.** Open the screenshot it saved. If the app is right and the
   checker wrong (the Focus word is pinned, and is still content), fix the checker and say so in a comment.
4. **Each kind of fault is fixed as a kind.** The blank text came from watching elements once; the missing
   "Back to now" from reading the first of several reports. Look for the same mistake elsewhere before moving on.
5. **A build that passes can still not start.** A missing import builds without a word and throws on the first
   screen. The walk's own start-up is the check: never ship on "the build passed" alone.
6. **Scripted walks stay.** They prove the main paths still work after the fix. They are not evidence that a
   screen is finished.

## How it feels on a phone, in numbers

A desktop is several times faster than a phone, so "smooth here" proves nothing (Tharun, 2026-10-12: "working
well on laptop but phone is lagging"). `e2e/feel.mjs` runs the production build at phone size with the
processor slowed down and reports, for each thing a customer does, how soon the screen answers, the longest
stall, how many frames were late, and whose script took the time.

```
npx vite build && npx vite preview --port 5190 --strictPort     # another terminal
node e2e/feel.mjs            # 4x slower: a mid-range phone.  node e2e/feel.mjs 6  for an old one
FUNCS=1 node e2e/feel.mjs    # also the slowest functions (build with --minify false to read their names)
```
Run it before and after any change to motion, lists or the reader, and put both sets of numbers in the commit
or the report. The first run after a new build updates the installed app and reloads: run it twice.

## What this cannot see (say so; do not claim it)

How it feels in the hand: whether motion is smooth on Tharun's phone, real touch latency, sound. For motion
there is a setting (Settings, Motion): a phone in battery saver or with "Remove animations" on asks apps for
less motion, and Noesis follows that unless the customer chooses Full. If Tharun says "it feels static", ask
what that card says on his phone before changing any animation.
