import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.js'

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
  })
  const client = new PrismaClient({ adapter })
  return {
    client,
    async check() { await client.$queryRaw`SELECT 1` },
    async close() { await client.$disconnect() },
  }
}
