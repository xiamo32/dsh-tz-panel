/**
 * Client-half smoke test: evaluates lib/client.js in a VM with a stubbed
 * __ModuleLoader__ so the registration can be asserted without a browser.
 *
 *   node scripts/smoke-client.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const source = readFileSync(resolve(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')

let definition
const sandbox = {
  console,
  window: {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  },
}
vm.runInNewContext(source, sandbox)

if (definition === undefined) throw new Error('the module never called __ModuleLoader__.load')
if (definition.id !== 'dsh-tz-panel') throw new Error(`module id is ${definition.id}, expected dsh-tz-panel`)
if (typeof definition.factory !== 'function') throw new Error('factory is missing')

const fakeReact = {
  createElement() {
    return null
  },
  useState() {
    return [undefined, () => {}]
  },
  useEffect() {},
  useCallback(fn) {
    return fn
  },
  useMemo(fn) {
    return fn()
  },
}
const required = []
const clientModule = definition.factory((name) => {
  required.push(name)
  if (name === 'react') return fakeReact
  throw new Error(`unexpected require(${name})`)
})

if (typeof clientModule.apply !== 'function') throw new Error('apply() is not exported')
if (!Array.isArray(clientModule.inject) || !clientModule.inject.includes('slots')) {
  throw new Error('inject must list slots')
}

let registered = null
let injected = []
const ctx = {
  slots: {
    inject(name, factory) {
      injected.push(name)
      return factory()
    },
    register(options, Component) {
      registered = { options, Component }
      return () => {}
    },
  },
}

clientModule.apply(ctx)

if (registered === null) throw new Error('apply() registered nothing')
if (registered.options.name !== 'settings.section') {
  throw new Error(`registered into ${registered.options.name}, expected settings.section`)
}
if (registered.options.id !== 'tz-panel') throw new Error(`section id is ${registered.options.id}`)
if (typeof registered.options.label !== 'function' || typeof registered.options.label() !== 'string') {
  throw new Error('label must resolve to a string')
}
if (typeof registered.Component !== 'function') throw new Error('the section component is not a function')
if (!injected.includes('settings.section')) throw new Error('the registration was not wired through slots.inject')

console.log('ok')
console.log('  module id: ', definition.id)
console.log('  requires:  ', required.join(', '))
console.log('  slot:      ', registered.options.name, '#' + registered.options.id)
console.log('  label:     ', registered.options.label())
