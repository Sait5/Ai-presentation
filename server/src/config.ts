import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  JWT_SECRET: z.string().min(48),
  AI_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9._-]+$/).default('gemini-3.5-flash-lite'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-6-astra'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-2.5-sunburst'),
  CLIENT_ORIGIN: z.url().refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value
  }, 'Expected an HTTP origin without a path').default('http://localhost:5173'),
  DATABASE_URL: z.url().refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return ['postgresql:', 'postgres:'].includes(url.protocol) && url.pathname.length > 1
  }, 'Expected a PostgreSQL database URL'),
})

export type AppConfig = z.infer<typeof environmentSchema>

export function parseEnvironment(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(environment)
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
    // Never include input values: DATABASE_URL can contain credentials.
    throw new Error(`Invalid environment variables: ${fields.join(', ')}`)
  }
  return result.data
}

export function loadConfig(): AppConfig {
  config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
  return parseEnvironment(process.env)
}
