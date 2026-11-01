import { POLL_INTERVAL_MS } from '@/server/shared/queue/config'
import { runWorker } from '@/server/shared/queue/worker'
import { handlers } from '@/server/tasks/handlers'

/** Aborted by Ctrl+C or a container stop; the task in progress finishes first */
const stop = new AbortController()
process.on('SIGINT', () => stop.abort())
process.on('SIGTERM', () => stop.abort())

console.info(`✓ Worker polling every ${POLL_INTERVAL_MS / 1000} s`)
await runWorker(handlers, stop.signal)
console.info('✓ Worker stopped')
process.exit(0)
