import { createApp } from '../server/dist/app.js'
import { loadConfig } from '../server/dist/config.js'
import { createDatabase } from '../server/dist/database.js'
import { createApi } from '../server/dist/routes/api.js'

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)
const app = createApp({ clientOrigin: config.CLIENT_ORIGIN, checkDatabase: db.check, api: createApi(db.client, config) })
// Vercel terminates the trusted proxy hop before invoking this function.
app.set('trust proxy', 1)
export default app
