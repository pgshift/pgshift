const DAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const

type DayName = keyof typeof DAYS

export interface EveryOptions {
  minutes?: number
  hours?: number
}

export interface HourlyOptions {
  minute?: number
}

export interface DailyOptions {
  hour?: number
  minute?: number
}

export interface WeeklyOptions {
  day: DayName
  hour?: number
  minute?: number
}

export interface MonthlyOptions {
  day: number
  hour?: number
  minute?: number
}

/**
 * Human-readable cron expression builder.
 *
 * All methods return a standard cron string compatible with pg_cron.
 * Raw cron strings are also accepted wherever a schedule is expected.
 *
 * @example
 * schedule.every({ minutes: 5 })        // "5 * * * *"
 * schedule.daily({ hour: 8 })           // "0 8 * * *"
 * schedule.weekly({ day: 'monday' })    // "0 0 * * 1"
 */
export const schedule = {
  every(options: EveryOptions): string {
    if (options.minutes !== undefined) {
      return `${options.minutes} * * * *`
    }
    if (options.hours !== undefined) {
      return `0 ${options.hours} * * *`
    }
    throw new Error('[PgShift] schedule.every requires minutes or hours.')
  },

  hourly(options: HourlyOptions = {}): string {
    const minute = options.minute ?? 0
    return `${minute} * * * *`
  },

  daily(options: DailyOptions = {}): string {
    const hour = options.hour ?? 0
    const minute = options.minute ?? 0
    return `${minute} ${hour} * * *`
  },

  weekly(options: WeeklyOptions): string {
    const day = DAYS[options.day]
    const hour = options.hour ?? 0
    const minute = options.minute ?? 0
    return `${minute} ${hour} * * ${day}`
  },

  monthly(options: MonthlyOptions): string {
    const hour = options.hour ?? 0
    const minute = options.minute ?? 0
    return `${minute} ${hour} ${options.day} * *`
  },
}
