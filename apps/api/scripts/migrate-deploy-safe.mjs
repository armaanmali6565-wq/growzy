#!/usr/bin/env node
/**
 * Production-safe `prisma migrate deploy` with automatic P3009 recovery for known
 * idempotent migrations that can get stuck if an earlier deploy was interrupted.
 *
 * Recovery: mark the failed migration rolled back, then run `prisma migrate deploy`
 * again (idempotent SQL). Loops up to RECOVERABLE_MIGRATIONS.length times in case
 * more than one known migration needs recovery.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const RECOVERABLE_MIGRATIONS = [
  '20260804220000_phase2_user_admin',
  '20260806120000_deposit_withdrawal_submission_fields',
]

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runPrisma(args) {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: apiRoot,
    encoding: 'utf8',
    env: process.env,
    shell: process.platform === 'win32',
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
  }
}

function print(result) {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function detectRecoverableP3009(result) {
  const text = `${result.stdout}\n${result.stderr}`
  if (!text.includes('P3009') || !/failed migrations|migration started .* failed/i.test(text)) {
    return null
  }
  return RECOVERABLE_MIGRATIONS.find((name) => text.includes(name)) ?? null
}

const resolved = new Set()

for (let attempt = 0; attempt <= RECOVERABLE_MIGRATIONS.length; attempt++) {
  const res = runPrisma(['migrate', 'deploy'])
  print(res)

  if (res.status === 0) {
    process.exit(0)
  }

  const failedMigration = detectRecoverableP3009(res)
  if (!failedMigration || resolved.has(failedMigration)) {
    process.exit(res.status)
  }

  resolved.add(failedMigration)
  console.error(
    `[migrate-deploy-safe] Recovering failed migration ${failedMigration} via resolve --rolled-back (idempotent SQL).`,
  )

  const resolveRes = runPrisma(['migrate', 'resolve', '--rolled-back', failedMigration])
  print(resolveRes)
  if (resolveRes.status !== 0) {
    console.error(`[migrate-deploy-safe] resolve --rolled-back failed for ${failedMigration}`)
    process.exit(resolveRes.status)
  }
}

process.exit(1)
