import { llmSettings } from '@/server/shared/connectors/llm'
import { POLL_INTERVAL_MS } from '@/server/shared/queue/config'
import { runWorker } from '@/server/shared/queue/worker'
import { handlers } from '@/server/tasks/handlers'

/** Aborted by Ctrl+C or a container stop; the task in progress finishes first */
const stop = new AbortController()
process.on('SIGINT', () => stop.abort())
process.on('SIGTERM', () => stop.abort())

try {
  const llm = llmSettings()
  if (llm.provider === 'fake') {
    console.warn(
      '! LLM is fake: every answer is a placeholder. Set LLM_MODEL, such as azure:<deployment>, to rank for real'
    )
  } else {
    console.info(
      `✓ LLM: ${llm.provider} ${llm.modelId}, up to ${llm.rpm} calls a minute`
    )
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`✗ LLM settings: ${reason}`)
  process.exit(1)
}

console.info(`✓ Worker polling every ${POLL_INTERVAL_MS / 1000} s`)
await runWorker(handlers, stop.signal)
console.info('✓ Worker stopped')
process.exit(0)
