import test from 'node:test'
import assert from 'node:assert/strict'
import { isStrongPassword } from './password-utils.js'

test('accepts a password with at least 10 characters and a special character', () => {
  assert.equal(isStrongPassword('GrillTime!2026'), true)
})

test('rejects passwords shorter than 10 characters', () => {
  assert.equal(isStrongPassword('Grill!123'), false)
})

test('rejects passwords without a special character', () => {
  assert.equal(isStrongPassword('GrillTime2026'), false)
})
