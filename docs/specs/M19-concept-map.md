# M19: concept map across the library (roadmap 18, first version)

Create NEW files only. Do NOT edit any existing file (someone else wires them in). No new dependencies.
No AI is used: this works offline, on the device, in any language.

## `src/lib/concepts.js` + `src/lib/concepts.test.js` (all pure, all tested)
- `candidates(text)` returns the candidate concepts in a text with their counts: (a) runs of 1 to 3
  consecutive words that each start with a capital letter and are not at the start of a sentence (names,
  places, terms: "Los Alamos", "Enrico Fermi"), (b) any other word of 7 or more letters that occurs 3 or more
  times. Lower-cased for comparison; the most common written form is kept as the label. Common words are
  dropped with a short stop list (months, weekdays, "The", "This", "However", "Chapter", "Figure", "Table",
  "Section"). Works on Unicode letters (`\p{L}`); languages without capitals simply yield only kind (b).
- `conceptMap(docs, { maxConcepts = 40 })` where `docs = [{ id, title, text }]` returns
  `{ concepts: [{ key, label, docs: [{ id, count }], weight }], links: [{ a, b, shared }] }`:
  each concept's weight is its count times `log(1 + N / documents containing it)` (a term in every document
  matters less), concepts that appear in 2 or more documents are ranked above those in one, at most
  `maxConcepts` are kept, and `links` connects every pair of DOCUMENTS that share at least one kept concept,
  with the number shared.
- `layout(concepts, docs, { width, height })` returns positions `{ docs: [{ id, x, y }], concepts: [{ key, x,
  y }] }`: documents evenly on a circle (radius 38% of the smaller side, first at the top), each concept at
  the average position of the documents that contain it, pulled 25% towards the centre, then nudged apart
  so that no two concepts are closer than 34 px (at most 40 passes, deterministic: no random numbers).
- Tests: names found mid-sentence but not at a sentence start; the 3-times rule; the stop list; a concept
  shared by two documents outranks one in a single document; the link count between two documents; layout
  is deterministic, inside the box, and keeps the minimum distance for a small example.

## `src/ui/ConceptMap.jsx`
`ConceptMap({ wide })`: the content of a sheet. It builds the map from the library on mount: for every
document whose status is 'voicing' or 'ready', read its text with `db.getDoc(id)` (src/lib/db.js; blocks have
`s`, an array of sentences) and yield between documents with `pause()` from src/lib/text.js; show
"Reading your library: 3 of 12" while it works. Then draw an SVG (width 100%, height 420): faint lines
from each concept to its documents, documents as white dots with their titles (cut at 22 characters),
concepts as lime (`T.lime`) text sized by weight (11 to 18 px). Tapping a concept lists under the SVG the
documents that contain it with the count ("Los Alamos: Destroyer of Worlds 14, Notes on the Trinity Test
3"); tapping a document in that list calls `go('reader', id)` (src/lib/nav.js). Fewer than 2 documents with
text: the line "Add at least two documents to see how they connect." No concept shared by two documents:
still show the map, with the line "These documents do not share any names or terms yet."
Store rule: a `useStore` selector returns a primitive or the same object reference; never filter or map
inside it (use `useMemo` after it). Inline styles with tokens from src/theme.js; components at top level.

## Done when
`npm test` passes and `npx vite build` has no errors or warnings. Report: files created, the test list, the
build and test output lines, and what you could not run. Do not commit.
