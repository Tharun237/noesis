// One unit for every length of time a document is shown with: how long it takes YOU, at the speed it would be
// heard at. That is the player's speed for the document in the player, and the default speed for every other.
// A length, what is done, what is left, the player's elapsed and remaining, and a chapter's time all go through
// here, so two of them on one screen cannot be in two units. (Before, a card said 1x, the player divided by its
// speed, and the elapsed time was not divided at all.) Pure.
//
// The listening LOG is not a length of a document but the time that really passed while sound played: it is
// already in the customer's own time, and is never put through here.

// The speed a document is heard at. `playing` is the player's { id, rate }, `defaults` the settings' { speed }.
export function paceFor(docId, playing, defaults) {
  const rate = playing.id === docId ? playing.rate : defaults.speed
  return rate > 0 ? rate : 1 // a stored speed of 0 would make every length infinite
}

// Seconds of audio at 1x → seconds it takes at that pace.
export const atPace = (seconds, rate) => seconds / rate
