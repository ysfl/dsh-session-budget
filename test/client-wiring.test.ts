import assert from 'node:assert/strict'
import test from 'node:test'
import type { ClientContext } from '../src/client/context.ts'
import { apply, name } from '../src/client/index.tsx'

test('the client half registers exactly the two Session-scoped seats', () => {
  const registered: Array<{ name: string; id?: string; order?: number }> = []
  const dictionaries: Array<{ namespace: string; keys: [number, number] }> = []

  const ctx = {
    effect: (fn: () => unknown) => fn(),
    locale: {
      register: (namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }) => {
        dictionaries.push({ namespace, keys: [Object.keys(dicts.zh).length, Object.keys(dicts.en).length] })
        return () => {}
      },
      bind: () => (key: string) => key,
    },
    slots: {
      inject: (_key: string, callback: () => unknown) => callback(),
      register: (options: { name: string; id?: string; order?: number }) => {
        registered.push({ name: options.name, id: options.id, order: options.order })
        return () => {}
      },
    },
  } as unknown as ClientContext

  apply(ctx)

  assert.equal(name, 'dsh-session-budget')
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0]?.namespace, 'dsh-session-budget')
  assert.deepEqual(dictionaries[0]?.keys[0], dictionaries[0]?.keys[1])

  assert.deepEqual(registered.map(entry => entry.name), [
    'conversation.session.header.utilities',
    'conversation.input.dock',
  ])
  assert.deepEqual(registered.map(entry => entry.id), [
    'dsh-session-budget-badge',
    'dsh-session-budget-dock',
  ])
})
