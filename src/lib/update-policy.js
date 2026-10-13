// When is it safe to switch to a newly deployed version? Pure, so it is unit-tested.
// Never while listening, while a document is being prepared, or with a sheet open (the user is mid-task).
// Otherwise: right after launch before any interaction (costs nothing), or once the app is in the background.
export const FRESH_MS = 20_000 // the new version may still be downloading right after launch

export const shouldSwitch = ({ playing, preparing, sheetOpen, interacted, sinceLaunch, hidden }) =>
  !playing && !preparing && !sheetOpen && ((!interacted && sinceLaunch < FRESH_MS) || hidden)

// Is the build the server has newer than the one running? Both are the build's own stamp (a time written the
// same way), so the later one sorts after the earlier. An unknown one is never "newer".
export const newerBuild = (latest, running) => typeof latest === 'string' && typeof running === 'string' && latest > running
