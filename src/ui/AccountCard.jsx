import { useState } from 'react'
import { T, label } from '../theme.js'
import { useStore } from '../lib/store.js'
import { toast } from '../lib/nav.js'
import { account, syncState, flush, signOut, devSignIn, deviceName } from '../lib/sync.js'
import { Button, inputStyle } from './kit.jsx'
import { Avatar, GoogleButton, SyncStatus } from './SyncStatus.jsx'

export function AccountCard({ Card }) {
  const a = useStore(account)
  const st = useStore(syncState)
  const [devName, setDevName] = useState('')

  if (!a.user) {
    return (
      <Card title="Account & sync">
        <div style={{ fontSize: 14, color: T.sub, lineHeight: 1.6 }}>
          Sign in to keep your library in step on every device. Start a book on your laptop and pick it up on your phone, <span style={{ color: T.text }}>to the same sentence</span>. Your documents, positions, bookmarks and collections sync automatically. Noesis works fully without an account too.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <GoogleButton disabled={!a.google} />
          {!a.checked && <span style={{ fontSize: 12.5, color: T.faint }}>Checking sign-in...</span>}
          {!a.google && a.checked && (a.reachable
            ? <span style={{ fontSize: 12.5, color: T.faint }}>Google sign-in isn't configured on this server yet.</span>
            : <span style={{ fontSize: 12.5, color: T.faint }}>Can't reach Noesis. Sign-in needs a connection.</span>)}
        </div>
        {a.dev && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, borderTop: `1px dashed ${T.border}` }}>
            <span style={{ ...label, flexShrink: 0 }}>Dev only</span>
            <input value={devName} onChange={e => setDevName(e.target.value)} placeholder="test account name" style={{ ...inputStyle, height: 38, fontSize: 13 }} />
            <Button onClick={() => devSignIn(devName).catch(e => toast(e.message))} disabled={!devName.trim()}>Sign in</Button>
          </div>
        )}
        <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
          Your library is kept in your own Google Drive, in a folder only Noesis can open; Noesis keeps no copy. From Google it receives your name, email and picture. Audio is never uploaded: each device voices the text itself.
        </div>
      </Card>
    )
  }

  return (
    <Card title="Account & sync" right={<SyncStatus />}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar user={a.user} size={48} />
        <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 3 }}>
          <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.user.name}</div>
          <div style={{ fontSize: 13, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.user.email}</div>
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.55 }}>
        Sign in with the same Google account on your other devices: your library and listening position follow you automatically. They are kept in your own Google Drive.
      </div>
      {st.status === 'error' && <div style={{ fontSize: 12.5, color: T.danger }}>{st.error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button icon="refresh" disabled={st.status === 'syncing'} onClick={() => flush()}>Sync now</Button>
        <span style={{ flex: 1 }} />
        <span style={{ ...label, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>This device: {deviceName()}</span>
        <Button kind="danger" onClick={() => (confirm('Sign out? Noesis opens fresh and empty on this device. Your library stays in your Google Drive, and is back the moment you sign in again.') ? signOut().catch(e => toast(e.message)) : undefined)}>Sign out</Button>
      </div>
    </Card>
  )
}
