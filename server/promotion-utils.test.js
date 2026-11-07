import test from 'node:test'
import assert from 'node:assert/strict'
import { isPromotionActive } from './promotion-utils.js'

test('promotion starts on its Manila calendar date before UTC midnight', () => {
  const promotion = { active: true, startDate: '2026-11-07', expirationDate: '2026-11-30' }

  assert.equal(isPromotionActive(promotion, new Date('2026-11-06T19:55:00.000Z')), true)
  assert.equal(isPromotionActive(promotion, new Date('2026-11-06T15:59:00.000Z')), false)
})

test('promotion remains valid through its Manila expiration date', () => {
  const promotion = { active: true, startDate: '2026-11-07', expirationDate: '2026-11-30' }

  assert.equal(isPromotionActive(promotion, new Date('2026-11-30T15:59:59.000Z')), true)
  assert.equal(isPromotionActive(promotion, new Date('2026-11-30T16:00:00.000Z')), false)
})

test('inactive promotions remain inactive regardless of date range', () => {
  assert.equal(isPromotionActive({ active: false, startDate: '', expirationDate: '' }), false)
})
