import { T } from '../theme.js'
import { useStore } from '../lib/store.js'
import { go } from '../lib/nav.js'
import { account, syncState, signInWithGoogle } from '../lib/sync.js'
import { Icon } from './icons.jsx'
import { Pulse } from './kit.jsx'

export function ago(t) {
  if (!t) return 'not yet'
  const s = Math.round((Date.now() - t) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}

export function SyncStatus() {
  const user = useStore(account, s => s.user)
  const st = useStore(syncState)
  if (!user) return null
  const color = st.status === 'error' ? T.danger : st.status === 'offline' ? T.faint : T.ok
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.sub }}>
      {st.status === 'syncing' ? <Pulse /> : <span style={{ width: 6, height: 6, borderRadius: 6, background: color }} />}
      {st.status === 'syncing' ? 'Syncing…' : st.status === 'offline' ? 'Offline · will sync' : st.status === 'error' ? 'Sync problem' : `Synced ${ago(st.last)}`}
    </span>
  )
}

export function Avatar({ user, size = 32 }) {
  const initial = (user.name || user.email || '?').trim()[0]?.toUpperCase()
  return user.picture
    ? <img src={user.picture} alt="" width={size} height={size} referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: T.r.pill, display: 'block', flexShrink: 0, border: `1px solid ${T.border}` }} />
    : <span style={{ width: size, height: size, borderRadius: T.r.pill, display: 'grid', placeItems: 'center', background: T.surfaceTop, color: T.text, fontSize: size * 0.45, fontWeight: 700, flexShrink: 0 }}>{initial}</span>
}

// Google's sign-in button (dark theme) per Google's branding guidelines; colours are Google's spec, not Noesis tokens.
export function GoogleButton({ onClick = signInWithGoogle, disabled, full }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 42, padding: '0 16px', width: full ? '100%' : undefined,
        borderRadius: T.r.pill, border: '1px solid #8E918F', background: '#131314', color: '#E3E3E3', fontFamily: T.font, fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap',
      }}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Sign in with Google
    </button>
  )
}

// Sidebar / header entry point: avatar when signed in, a quiet "Sign in" otherwise.
export function AccountChip({ compact }) {
  const user = useStore(account, s => s.user)
  const checked = useStore(account, s => s.checked)
  if (!checked) return null
  if (!user) {
    return (
      <button type="button" onClick={() => go('settings')} aria-label="Sign in to sync"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: compact ? 'auto' : '100%', height: compact ? 40 : 44, padding: compact ? '0 12px' : '0 12px', border: `1px solid ${T.border}`, borderRadius: T.r.pill, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
        <Icon name="refresh" size={16} style={{ color: T.accent }} />
        {compact ? 'Sign in' : 'Sign in to sync devices'}
      </button>
    )
  }
  return (
    <button type="button" onClick={() => go('settings')} aria-label={`Account: ${user.name || user.email}`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: compact ? 'auto' : '100%', padding: compact ? 2 : '6px 10px', border: 'none', borderRadius: T.r.pill, background: 'transparent', color: T.text, fontFamily: T.font, cursor: 'pointer', textAlign: 'left' }}>
      <Avatar user={user} size={compact ? 34 : 30} />
      {!compact && (
        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || user.email}</span>
          <SyncStatus />
        </span>
      )}
    </button>
  )
}
