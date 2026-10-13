// How fast the customer listens: one number, theirs, set by a slider (Tharun, 13 October 2026: "instead of giving
// fixed preset numbers, you can give a slider here: it enables the customer's free will").
// The slider is not even: from 0.5x to 3x is six times faster, and most listening is between 0.8x and 1.5x.
// Each step along it is the same CHANGE in speed (a ratio), so 1x sits well in from the left and the speeds
// people use have room for a finger. Pure: tested in speed.test.js.
export const SPEED_MIN = 0.5
export const SPEED_MAX = 3
export const SPEED_STEP = 0.05
// 0.9x: about the pace a person talks at. The voices at their own pace (1x) were "really fast" (Tharun).
export const SPEED_USUAL = 0.9
export const SPEED_MARKS = [0.5, 1, 1.5, 2, 3] // named under the slider

const clamp = s => Math.min(SPEED_MAX, Math.max(SPEED_MIN, s))
const toStep = s => Math.round(Math.round(s / SPEED_STEP) * SPEED_STEP * 100) / 100

// where along the slider (0..1) a speed is, and the speed at a place along it
export const speedToPlace = s => Math.log(clamp(s) / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN)
export const placeToSpeed = f => clamp(toStep(SPEED_MIN * (SPEED_MAX / SPEED_MIN) ** Math.min(1, Math.max(0, f))))
export const speedLabel = s => `${+(+s).toFixed(2)}x`
