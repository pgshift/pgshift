import { describe, expect, it } from 'vitest'
import { schedule } from '../../../packages/cron/source/schedule'

describe('schedule.every', () => {
  it('produces a step expression for minutes', () => {
    expect(schedule.every({ minutes: 5 })).toBe('*/5 * * * *')
  })

  it('produces a step expression for 1 minute', () => {
    expect(schedule.every({ minutes: 1 })).toBe('*/1 * * * *')
  })

  it('produces a step expression for hours', () => {
    expect(schedule.every({ hours: 2 })).toBe('0 */2 * * *')
  })

  it('throws when neither minutes nor hours are provided', () => {
    expect(() => schedule.every({})).toThrow('[PgShift]')
  })
})

describe('schedule.hourly', () => {
  it('defaults to minute 0', () => {
    expect(schedule.hourly()).toBe('0 * * * *')
  })

  it('accepts a custom minute', () => {
    expect(schedule.hourly({ minute: 30 })).toBe('30 * * * *')
  })
})

describe('schedule.daily', () => {
  it('defaults to midnight', () => {
    expect(schedule.daily()).toBe('0 0 * * *')
  })

  it('accepts a custom hour', () => {
    expect(schedule.daily({ hour: 8 })).toBe('0 8 * * *')
  })

  it('accepts hour and minute', () => {
    expect(schedule.daily({ hour: 14, minute: 30 })).toBe('30 14 * * *')
  })
})

describe('schedule.weekly', () => {
  it('runs on the correct day of week', () => {
    expect(schedule.weekly({ day: 'monday' })).toBe('0 0 * * 1')
    expect(schedule.weekly({ day: 'friday' })).toBe('0 0 * * 5')
    expect(schedule.weekly({ day: 'sunday' })).toBe('0 0 * * 0')
  })

  it('accepts a custom hour', () => {
    expect(schedule.weekly({ day: 'monday', hour: 8 })).toBe('0 8 * * 1')
  })

  it('accepts hour and minute', () => {
    expect(schedule.weekly({ day: 'wednesday', hour: 9, minute: 15 })).toBe('15 9 * * 3')
  })
})

describe('schedule.monthly', () => {
  it('runs on the given day of month at midnight by default', () => {
    expect(schedule.monthly({ day: 1 })).toBe('0 0 1 * *')
  })

  it('accepts a custom hour', () => {
    expect(schedule.monthly({ day: 15, hour: 9 })).toBe('0 9 15 * *')
  })

  it('accepts day, hour, and minute', () => {
    expect(schedule.monthly({ day: 1, hour: 9, minute: 30 })).toBe('30 9 1 * *')
  })
})
