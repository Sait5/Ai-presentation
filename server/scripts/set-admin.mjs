import { loadConfig } from '../dist/config.js'
import { createDatabase } from '../dist/database.js'
const email = process.argv[2]?.trim().toLowerCase()
if (!email || !email.includes('@')) throw new Error('Usage: node scripts/set-admin.mjs account@example.com')
const db = createDatabase(loadConfig().DATABASE_URL)
try {
  const user = await db.client.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) throw new Error('Account does not exist. Register it first; this script never creates accounts or passwords.')
  await db.client.user.update({ where: { id: user.id }, data: { isAdmin: true } })
  console.log('Administrator role assigned to the specified existing account.')
} finally { await db.close() }
