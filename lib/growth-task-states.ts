// ── B6：Growth Plan 任务完成状态存储（Spec §9）──
// Neon 表 growth_task_states：PK (email, username, task_key)。
// task_key 为 buildGrowthTasks 生成的稳定 slug，评估数据更新后仍可复用。
// 模式同 share-store.ts：动态 import neon、initTable 惰性、DATABASE_URL 环境读取。

import type { NeonQueryFunction } from '@neondatabase/serverless'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let initPromise: Promise<void> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (sql) return sql
  const { neon } = await import('@neondatabase/serverless')
  sql = neon(DATABASE_URL)
  return sql
}

async function initTable(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS growth_task_states (
          email TEXT NOT NULL,
          username TEXT NOT NULL,
          task_key TEXT NOT NULL,
          completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (email, username, task_key)
        )
      `
    })()
  }
  return initPromise
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}

/**
 * 标记任务完成（幂等）：INSERT ON CONFLICT DO NOTHING，重复完成不报错。
 */
export async function completeTask(email: string, username: string, taskKey: string): Promise<void> {
  await initTable()
  const s = await getSql()
  const e = email.toLowerCase().trim()
  const u = normalizeUsername(username)

  await s`
    INSERT INTO growth_task_states (email, username, task_key)
    VALUES (${e}, ${u}, ${taskKey})
    ON CONFLICT (email, username, task_key) DO NOTHING
  `
}

/**
 * 列出该用户该账号已完成的 task_key 集合。
 */
export async function listCompleted(email: string, username: string): Promise<string[]> {
  await initTable()
  const s = await getSql()
  const e = email.toLowerCase().trim()
  const u = normalizeUsername(username)

  const rows = await s`
    SELECT task_key FROM growth_task_states
    WHERE email = ${e} AND username = ${u}
  `
  return (rows as Array<{ task_key: string }>).map(r => String(r.task_key))
}
