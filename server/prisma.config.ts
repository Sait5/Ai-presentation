import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
