import { defineConfig } from 'drizzle-kit'

import { databaseUrl } from './src/server/config/env'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/shared/database/schema/index.ts',
  out: './src/server/shared/database/migrations',
  dbCredentials: { url: databaseUrl },
})
