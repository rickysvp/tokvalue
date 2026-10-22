import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Evaluation } from '@/types'

const original = {
  dataDir: process.env.DATA_DIR,
  databaseUrl: process.env.DATABASE_URL,
  postgresUrl: process.env.POSTGRES_URL,
}
let testDir: string

beforeAll(() => {
  testDir = mkdtempSync(join(tmpdir(), 'tokvalue-report-cache-'))
  process.env.DATA_DIR = testDir
  delete process.env.DATABASE_URL
  delete process.env.POSTGRES_URL
  vi.resetModules()
})

afterAll(() => {
  if (original.dataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = original.dataDir
  if (original.databaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original.databaseUrl
  if (original.postgresUrl === undefined) delete process.env.POSTGRES_URL
  else process.env.POSTGRES_URL = original.postgresUrl
  rmSync(testDir, { recursive: true, force: true })
})

describe('persistent paid report cache', () => {
  it('finds a saved partial report after module reload', async () => {
    const db = await import('./db')
    const report = { username: 'creator', computedAt: new Date().toISOString(), dataQuality: 'partial', score: 70 } as Evaluation
    await db.saveEvaluation(report, { isFree: false, evaluatedBy: 'first@example.com' })
    vi.resetModules()
    const reloadedDb = await import('./db')
    const cached = await reloadedDb.findReusablePaidEvaluation('@CREATOR')
    expect(cached?.score).toBe(70)
  })

  it('does not return a saved free report or one older than 7 days', async () => {
    const db = await import('./db')
    await db.saveEvaluation({ username: 'free', computedAt: new Date().toISOString() } as Evaluation, { isFree: true })
    await db.saveEvaluation({ username: 'old', computedAt: new Date(Date.now() - 8 * 86400_000).toISOString() } as Evaluation, { isFree: false })
    expect(await db.findReusablePaidEvaluation('free')).toBeNull()
    expect(await db.findReusablePaidEvaluation('old')).toBeNull()
  })
})
