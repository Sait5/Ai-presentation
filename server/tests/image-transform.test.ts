import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transformImage, type ImageHandle } from '../src/contracts/image-transform.js'
import { newSlideImage, slideImageSchema } from '../src/contracts/design.js'

test('image dragging and all resize corners stay within the persisted slide contract', () => {
  const rect = { x: 55, y: 27, w: 40, h: 60 }
  assert.deepEqual(transformImage(rect, 'move', -20, 5), { x: 35, y: 32, w: 40, h: 60 })
  assert.deepEqual(transformImage(rect, 'nw', 10, 10), { x: 65, y: 37, w: 30, h: 50 })
  assert.deepEqual(transformImage(rect, 'se', -10, -10), { x: 55, y: 27, w: 30, h: 50 })
  for (const handle of ['move', 'nw', 'ne', 'sw', 'se'] as ImageHandle[]) {
    for (const dx of [-1000, -0.12345, 0, 0.23456, 1000]) for (const dy of [-1000, 0, 1000]) {
      const next = transformImage(rect, handle, dx, dy)
      assert.ok(slideImageSchema.safeParse({ ...newSlideImage('11111111-1111-4111-8111-111111111111'), ...next, placement: 'custom' }).success)
    }
  }
})
