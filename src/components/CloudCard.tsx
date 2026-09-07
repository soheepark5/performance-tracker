import { useState } from 'react'
import { useAuth } from '../store/auth'
import { useApp } from '../store/state'
import { formatTime } from '../domain/date'
import { Card, Tile } from './ui'

/**
 * Account, sync status, and the one-time upload of a record that predates the
 * cloud. The upload is never automatic: it reports what it found, pushes, then
 * reads the rows back and compares counts before calling itself done — and the
 * original local record is preserved either way.
 */

const PHASE_TEXT: Record<string, string> = {
  off: 'This build has no cloud configured — the record lives on this device only.',
  'signed-out': 'Signed out.',
  loading: 'Reading your record…',
  synced: 'Everything on this device is in the cloud.',
  pushing: 'Saving…',
  offline: 'Offline — changes are safe on this device and will sync when you are back.',
  error: 'Something went wrong.',
  'needs-migration': 'This device holds a record the cloud has never seen.',
}

export function CloudCard() {
  const { sync, migrateLocal } = useApp()
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  if (!sync.enabled) {
    return (
      <Card title="Sync" desc={PHASE_TEXT.off}>
        <p className="tiny muted" style={{ margin: 0 }}>
          Export regularly from Backup below — it is the only copy.
        </p>
      </Card>
    )
  }

  const p = sync.pending

  return (
    <Card
      title="Account & sync"
      right={
        auth.session ? (
          <button className="btn small ghost" onClick={() => auth.signOut()}>Sign out</button>
        ) : null
      }
    >
      <div className="tiles" style={{ marginBottom: 12 }}>
        <Tile label="Signed in as" value={<span style={{ fontSize: 13 }}>{auth.email ?? '—'}</span>} />
        <Tile
          label="Status"
          value={
            <span style={{ fontSize: 13, color: sync.phase === 'synced' ? 'var(--accent)' : undefined }}>
              {sync.phase === 'synced' ? 'Synced' : sync.phase === 'pushing' ? 'Saving' : sync.phase === 'offline' ? 'Offline' : sync.phase === 'loading' ? 'Loading' : sync.phase === 'needs-migration' ? 'Action needed' : 'Error'}
            </span>
          }
          detail={sync.lastSyncedAt ? `last at ${formatTime(sync.lastSyncedAt)}` : undefined}
        />
      </div>

      <p className="small" style={{ margin: 0, color: sync.phase === 'error' ? 'var(--critical)' : 'var(--ink-2)' }}>
        {sync.message ?? PHASE_TEXT[sync.phase] ?? ''}
      </p>

      {sync.phase === 'needs-migration' && p && (
        <>
          <hr className="rule" />
          <h3>Move this record to the cloud</h3>
          <p className="tiny muted" style={{ margin: '0 0 10px' }}>
            Found on this device: {p.days} days · {p.workouts} sessions · {p.weekly} weekly checks · {p.targets}{' '}
            targets · {p.stress} stress · {p.impulses} impulses · {p.focusPoints} focus points. Uploading verifies by
            reading the rows back, and your local copy is kept either way.
          </p>
          <button
            className="btn primary full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setResult(null)
              const r = await migrateLocal()
              setBusy(false)
              setResult(r.message)
            }}
          >
            {busy ? 'Uploading and verifying…' : 'Upload this record'}
          </button>
          {result && <p className="tiny muted" style={{ margin: '10px 0 0' }}>{result}</p>}
        </>
      )}

      <p className="tiny muted" style={{ margin: '12px 0 0' }}>
        Your rows are readable only by this account. Stages, thresholds and bottlenecks are still calculated here on
        the device — the database only stores and syncs.
      </p>
    </Card>
  )
}
