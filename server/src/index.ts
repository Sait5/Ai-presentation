import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createDatabase } from './database.js'
import { createApi } from './routes/api.js'

const config = loadConfig()
const database = createDatabase(config.DATABASE_URL)
const app = createApp({ clientOrigin: config.CLIENT_ORIGIN, checkDatabase: database.check, api: createApi(database.client, config) })
const server = app.listen(config.PORT, config.HOST, () => {
  console.info(`API listening on http://${config.HOST}:${config.PORT}`)
})
server.requestTimeout = 15000
server.headersTimeout = 10000
server.on('error', () => {
  console.error('HTTP server failed to start; check HOST and PORT')
  void database.close().finally(() => process.exit(1))
})

let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  const timeout = setTimeout(() => process.exit(1), 10000)
  timeout.unref()
  server.close(() => {
    void database.close().then(() => {
      clearTimeout(timeout)
      process.exit(0)
    }, () => process.exit(1))
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
