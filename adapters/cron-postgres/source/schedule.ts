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
  /**
   * Run every N minutes or hours.
   *
   * @example
   * schedule.every({ minutes: 5 })   // "5 * * * *"
   * schedule.every({ hours: 2 })     // "0 2 * * *"
   */
  every(options: EveryOptions): string {
    if (options.minutes !== undefined) {
      return `${options.minutes} * * * *`
    }
    if (options.hours !== undefined) {
      return `0 ${options.hours} * * *`
    }
    throw new Error('[PgShift] schedule.every requires minutes or hours.')
  },

  /**
   * Run once per hour at a specific minute.
   *
   * @example
   * schedule.hourly()              // "0 * * * *"
   * schedule.hourly({ minute: 30 }) // "30 * * * *"
   */
  hourly(options: HourlyOptions = {}): string {
    const minute = options.minute ?? 0
    return `${minute} * * * *`
  },

  /**
   * Run once per day at a specific hour and minute.
   *
   * @example
   * schedule.daily()               // "0 0 * * *"
   * schedule.daily({ hour: 8 })    // "0 8 * * *"
   */
  daily(options: DailyOptions = {}): string {
    const hour = options.hour ?? 0
    const minute = options.minute ?? 0
    return `${minute} ${hour} * * *`
  },

  /**
   * Run once per week on a specific day and time.
   *
   * @example
   * schedule.weekly({ day: 'monday' })             // "0 0 * * 1"
   * schedule.weekly({ day: 'friday', hour: 17 })   // "0 17 * * 5"
   */
  weekly(options: WeeklyOptions): string {
    const day = DAYS[options.day]
    const hour = options.hour ?? 0
    const minute = options.minute ?? 0
    return `${minute} ${hour} * * ${day}`
  },

  /**
   * Run once per month on a specific day and time.
   *
   * @example
   * schedule.monthly({ day: 1 })              // "0 0 1 * *"
   * schedule.monthly({ day: 15, hour: 9 })    // "0 9 15 * *"
   */
  monthly(options: MonthlyOptions): string {
    const hour = options.hour ?? 0
    const minute = options.minute ?? 0
    return `${minute} ${hour} ${options.day} * *`
  },
}
