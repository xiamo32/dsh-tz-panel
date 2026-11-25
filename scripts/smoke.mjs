/**
 * Host-half smoke test: mounts the plugin against a stub context so the route
 * handler can be exercised without a running DSH host.
 *
 * Only reads are performed. The switch operation is never sent a valid zone, so
 * no elevation prompt can appear while this runs.
 *
 *   node scripts/smoke.mjs
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const entry = pathToFileURL(resolve(import.meta.dirname, '..', 'lib', 'index.js')).href
const mod = await import(entry)

if (typeof mod.apply !== 'function') throw new Error('apply() is not exported')
if (!Array.isArray(mod.inject) || !mod.inject.includes('connection')) throw new Error('inject must list connection')

let registered = null
const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  },
  connection: {
    fetch: {
      register(options) {
        registered = options
        return () => {
          registered = null
        }
      },
    },
  },
}

mod.apply(ctx)
if (registered === null) throw new Error('apply() did not register a route')
if (registered.path !== '/api/tz-panel') throw new Error(`unexpected path ${registered.path}`)
if (!registered.methods.includes('GET') || !registered.methods.includes('POST')) throw new Error('methods incomplete')

const handler = registered.fetch

const getResponse = await handler(new Request('http://local/api/tz-panel', { method: 'GET' }))
const getBody = await getResponse.clone().json().catch(() => ({}))
if (getResponse.status !== 200) {
  throw new Error(`GET answered ${getResponse.status}: ${getBody.error ?? '(no detail)'}`)
}
const snapshot = getBody
if (!Array.isArray(snapshot.zones) || snapshot.zones.length < 100) {
  throw new Error(`expected 100+ zones, received ${snapshot.zones?.length}`)
}
if (typeof snapshot.current !== 'string' || snapshot.current.length === 0) {
  throw new Error('GET did not report the current zone')
}
const sample = snapshot.zones.find((zone) => zone.id === 'China Standard Time')
if (sample === undefined) throw new Error('China Standard Time missing from the catalog')
if (sample.offset !== 480) throw new Error(`China Standard Time offset is ${sample.offset}, expected 480`)
if (!snapshot.zones.every((zone) => typeof zone.id === 'string' && typeof zone.name === 'string' && Number.isFinite(zone.offset))) {
  throw new Error('a catalog row is malformed')
}

const badOp = await handler(
  new Request('http://local/api/tz-panel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'nope' }),
  }),
)
if (badOp.status !== 400) throw new Error(`unknown op answered ${badOp.status}, expected 400`)

const badZone = await handler(
  new Request('http://local/api/tz-panel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'switch', id: 'Not A Zone' }),
  }),
)
if (badZone.status !== 400) throw new Error(`unknown zone answered ${badZone.status}, expected 400`)

console.log('ok')
console.log('  current:', snapshot.current)
console.log('  zones:  ', snapshot.zones.length)
console.log('  china:  ', sample.id, sample.offset)
