/**
 * dsh-tz-panel — the host half.
 *
 * Windows exposes 140+ time zones, but every way of changing the machine zone
 * needs an administrator token: `tzutil /s` fails with access denied from an
 * unelevated host. So this half owns one same-origin route on the shared /api
 * channel and does the two things a browser cannot:
 *
 *   GET  /api/tz-panel -> { current, zones: [{ id, name, offset }] }
 *   POST /api/tz-panel { op: 'switch', id } -> { ok, current }
 *
 * Reads go through a fresh PowerShell process every time, because a long-lived
 * process caches `TimeZoneInfo.Local` and would keep reporting the zone it was
 * started under. The write is delegated to `tzutil.exe` started through UAC:
 * Windows asks the user once per switch, and "No" changes nothing.
 */
import { execFile } from 'node:child_process'
import { join } from 'node:path'

export const name = 'tz-panel'
export const inject = ['connection']

const ROUTE = '/api/tz-panel'
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows'
const POWERSHELL = join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const TZUTIL = join(SYSTEM_ROOT, 'System32', 'tzutil.exe')

/** The catalog changes only when Windows ships new zone data; a minute is plenty. */
const CATALOG_TTL_MS = 60_000

/** @type {{ at: number, rows: Array<{ id: string, name: string, offset: number }> }} */
let catalogCache = { at: 0, rows: [] }

/**
 * Run one PowerShell script through -EncodedCommand, which sidesteps every
 * quoting argument between here and Windows.
 * @param script PowerShell source, ASCII only.
 * @param timeout Process timeout in milliseconds.
 * @returns Exit status and captured streams.
 */
function runPowerShell(script, timeout = 30_000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: error === null,
          stdout: String(stdout ?? '').replace(/^\uFEFF/, ''),
          stderr: `${stderr ?? ''}${error === null ? '' : String(error?.message ?? error)}`.trim(),
        })
      },
    )
  })
}

const CATALOG_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false',
  '$rows = @(foreach ($z in [System.TimeZoneInfo]::GetSystemTimeZones()) {',
  '  try {',
  '    $offset = [int]$z.GetUtcOffset([DateTime]::UtcNow).TotalMinutes',
  '    [pscustomobject]@{ id = $z.Id; name = $z.DisplayName; offset = $offset }',
  '  } catch { }',
  '})',
  '[Console]::Out.Write((ConvertTo-Json -InputObject $rows -Compress -Depth 3))',
].join('\n')

/**
 * Every zone Windows knows, with the offset it applies right now.
 * @returns Zone rows; an unreadable registry entry is skipped, not fatal.
 */
async function readCatalog() {
  const fresh = Date.now() - catalogCache.at < CATALOG_TTL_MS
  if (fresh && catalogCache.rows.length > 0) return catalogCache.rows

  const result = await runPowerShell(CATALOG_SCRIPT)
  if (!result.ok) throw new Error(result.stderr || 'could not read the Windows time zone catalog')

  let parsed = JSON.parse(result.stdout)
  if (!Array.isArray(parsed)) parsed = [parsed]
  const rows = parsed
    .filter((row) => row && typeof row.id === 'string' && row.id.length > 0)
    .map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      offset: Number.isFinite(row.offset) ? Number(row.offset) : 0,
    }))

  catalogCache = { at: Date.now(), rows }
  return rows
}

/**
 * The zone the machine is actually on right now.
 * @returns A Windows zone id, or '' when tzutil cannot answer.
 */
function currentZone() {
  return new Promise((resolve) => {
    execFile(TZUTIL, ['/g'], { windowsHide: true, timeout: 15_000 }, (error, stdout) => {
      if (error !== null) return resolve('')
      const first = String(stdout ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
      resolve(first ?? '')
    })
  })
}

/**
 * Change the machine zone. `tzutil /s` needs elevation, so it is started
 * through the shell's RunAs verb: one UAC prompt, and a refusal is reported
 * rather than swallowed.
 * @param id A zone id already present in the catalog.
 * @returns Success flag and a human-readable failure when it did not take.
 */
async function switchZone(id) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$zone = '${id.replace(/'/g, "''")}'`,
    '$exe = Join-Path $env:SystemRoot "System32\\tzutil.exe"',
    '$p = Start-Process -FilePath $exe -ArgumentList @("/s", $zone) -Verb RunAs -Wait -PassThru',
    'if ($p.ExitCode -ne 0) { throw "tzutil exited with $($p.ExitCode)" }',
  ].join('\n')

  const result = await runPowerShell(script, 120_000)
  if (!result.ok) return { ok: false, error: result.stderr || 'the elevation prompt was dismissed' }
  return { ok: true }
}

/**
 * Serve the panel's two operations.
 * @param request The buffered request from the connection channel.
 * @returns A JSON response, never a thrown error.
 */
async function handle(request) {
  try {
    if (request.method === 'GET') {
      const zones = await readCatalog()
      const current = await currentZone()
      return Response.json({ current, zones }, { headers: { 'cache-control': 'no-store' } })
    }

    let body = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    if (body?.op !== 'switch') {
      return Response.json({ ok: false, error: 'unknown operation' }, { status: 400 })
    }

    const target = typeof body.id === 'string' ? body.id : ''
    const zones = await readCatalog()
    if (!zones.some((zone) => zone.id === target)) {
      return Response.json({ ok: false, error: `unknown time zone: ${target}` }, { status: 400 })
    }

    const switched = await switchZone(target)
    if (!switched.ok) return Response.json({ ok: false, error: switched.error })

    const current = await currentZone()
    return Response.json({ ok: true, current })
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error?.message ?? error) },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}

/**
 * Mount one route while the fiber is active; the effect disposes it on reload.
 * @param ctx The plugin context.
 */
export function apply(ctx) {
  if (process.platform !== 'win32') return
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ROUTE,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handle(request),
      }),
    'tz-panel: /api/tz-panel',
  )
}
