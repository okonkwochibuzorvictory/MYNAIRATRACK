import { describe, expect, it } from 'vitest'
import { alertLabel } from './insights'

describe('alert labels', () => {
  it('maps threshold types to friendly labels', () => {
    expect(alertLabel('threshold_50')).toBe('50% reached')
    expect(alertLabel('threshold_80')).toBe('80% reached')
    expect(alertLabel('threshold_100')).toBe('100% reached')
    expect(alertLabel('threshold_over')).toBe('Over budget')
  })
})
