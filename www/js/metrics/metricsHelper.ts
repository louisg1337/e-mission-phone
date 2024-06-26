import { DateTime } from 'luxon';
import { DayOfMetricData } from './metricsTypes';
import { logDebug } from '../plugin/logger';
import { isoDateWithOffset, isoDatesDifference } from '../diary/timelineHelper';
import { MetricName, groupingFields } from '../types/appConfigTypes';
import { ImperialConfig, formatForDisplay } from '../config/useImperialConfig';
import i18next from 'i18next';

export function getUniqueLabelsForDays(metricDataDays: DayOfMetricData[]) {
  const uniqueLabels: string[] = [];
  metricDataDays.forEach((e) => {
    Object.keys(e).forEach((k) => {
      const trimmed = trimGroupingPrefix(k);
      if (trimmed && !uniqueLabels.includes(trimmed)) {
        uniqueLabels.push(trimmed);
      }
    });
  });
  return uniqueLabels;
}

/**
 * @description Trims the "grouping field" prefix from a metrics key. Grouping fields are defined in appConfigTypes.ts
 * @example removeGroupingPrefix('mode_purpose_access_recreation') => 'access_recreation'
 * @example removeGroupingPrefix('primary_ble_sensed_mode_CAR') => 'CAR'
 * @returns The key without the prefix (or undefined if the key didn't start with a grouping field)
 */
export const trimGroupingPrefix = (label: string) => {
  for (let field of groupingFields) {
    if (label.startsWith(field)) {
      return label.substring(field.length + 1);
    }
  }
};

export const getLabelsForDay = (metricDataDay: DayOfMetricData) =>
  Object.keys(metricDataDay).reduce((acc, k) => {
    const trimmed = trimGroupingPrefix(k);
    if (trimmed) acc.push(trimmed);
    return acc;
  }, [] as string[]);

export const secondsToMinutes = (seconds: number) => seconds / 60;
export const secondsToHours = (seconds: number) => seconds / 3600;

// segments metricsDays into weeks, with the most recent week first
export function segmentDaysByWeeks(days: DayOfMetricData[], lastDate: string) {
  const weeks: DayOfMetricData[][] = [[]];
  let cutoff = isoDateWithOffset(lastDate, -7 * weeks.length);
  for (let i = days.length - 1; i >= 0; i--) {
    // if date is older than cutoff, start a new week
    if (isoDatesDifference(days[i].date, cutoff) > 0) {
      weeks.push([]);
      cutoff = isoDateWithOffset(lastDate, -7 * weeks.length);
    }
    weeks[weeks.length - 1].push(days[i]);
  }
  return weeks.map((week) => week.reverse());
}

export function formatDate(day: DayOfMetricData) {
  const dt = DateTime.fromISO(day.date, { zone: 'utc' });
  return dt.toLocaleString({ ...DateTime.DATE_SHORT, year: undefined });
}

export function formatDateRangeOfDays(days: DayOfMetricData[]) {
  if (!days?.length) return '';
  const firstDayDt = DateTime.fromISO(days[0].date, { zone: 'utc' });
  const lastDayDt = DateTime.fromISO(days[days.length - 1].date, { zone: 'utc' });
  const firstDay = firstDayDt.toLocaleString({ ...DateTime.DATE_SHORT, year: undefined });
  const lastDay = lastDayDt.toLocaleString({ ...DateTime.DATE_SHORT, year: undefined });
  return `${firstDay} - ${lastDay}`;
}

/* formatting data form carbon footprint calculations */

//modes considered on foot for carbon calculation, expandable as needed
export const ON_FOOT_MODES = ['WALKING', 'RUNNING', 'ON_FOOT'] as const;

/*
 * metric2val is a function that takes a metric entry and a field and returns
 * the appropriate value.
 * for regular data (user-specific), this will return the field value
 * for avg data (aggregate), this will return the field value/nUsers
 */
export const metricToValue = (population: 'user' | 'aggregate', metric, field) =>
  population == 'user' ? metric[field] : metric[field] / metric.nUsers;

//testing agains global list of what is "on foot"
//returns true | false
export function isOnFoot(mode: string) {
  for (let ped_mode of ON_FOOT_MODES) {
    if (mode === ped_mode) {
      return true;
    }
  }
  return false;
}

//from two weeks fo low and high values, calculates low and high change
export function calculatePercentChange(pastWeekRange, previousWeekRange) {
  let greaterLesserPct = {
    low: (pastWeekRange.low / previousWeekRange.low) * 100 - 100,
    high: (pastWeekRange.high / previousWeekRange.high) * 100 - 100,
  };
  return greaterLesserPct;
}

export function parseDataFromMetrics(metrics, population) {
  logDebug(`parseDataFromMetrics: metrics = ${JSON.stringify(metrics)}; 
    population = ${population}`);
  let mode_bins: { [k: string]: [number, number, string][] } = {};
  metrics?.forEach((metric) => {
    let onFootVal = 0;

    for (let field in metric) {
      /*For modes inferred from sensor data, we check if the string is all upper case 
      by converting it to upper case and seeing if it is changed*/
      if (field == field.toUpperCase()) {
        /*sum all possible on foot modes: see https://github.com/e-mission/e-mission-docs/issues/422 */
        if (isOnFoot(field)) {
          onFootVal += metricToValue(population, metric, field);
          field = 'ON_FOOT';
        }
        if (!(field in mode_bins)) {
          mode_bins[field] = [];
        }
        //for all except onFoot, add to bin - could discover mult onFoot modes
        if (field != 'ON_FOOT') {
          mode_bins[field].push([
            metric.ts,
            metricToValue(population, metric, field),
            metric.fmt_time,
          ]);
        }
      }
      const trimmedField = trimGroupingPrefix(field);
      if (trimmedField) {
        logDebug('Mapped field ' + field + ' to mode ' + trimmedField);
        if (!(trimmedField in mode_bins)) {
          mode_bins[trimmedField] = [];
        }
        mode_bins[trimmedField].push([
          metric.ts,
          Math.round(metricToValue(population, metric, field)),
          DateTime.fromISO(metric.fmt_time).toISO() as string,
        ]);
      }
    }
    //handle the ON_FOOT modes once all have been summed
    if ('ON_FOOT' in mode_bins) {
      mode_bins['ON_FOOT'].push([metric.ts, Math.round(onFootVal), metric.fmt_time]);
    }
  });

  return Object.entries(mode_bins).map(([key, values]) => ({ key, values }));
}

const _datesTsCache = {};
export const tsForDayOfMetricData = (day: DayOfMetricData) => {
  if (_datesTsCache[day.date] == undefined)
    _datesTsCache[day.date] = DateTime.fromISO(day.date).toSeconds();
  return _datesTsCache[day.date];
};

export const valueForFieldOnDay = (day: DayOfMetricData, field: string, key: string) =>
  day[`${field}_${key}`];

export type MetricsSummary = { key: string; values: number };
export function generateSummaryFromData(modeMap, metric) {
  logDebug(`Invoked getSummaryDataRaw on ${JSON.stringify(modeMap)} with ${metric}`);

  let summaryMap: MetricsSummary[] = [];

  for (let i = 0; i < modeMap.length; i++) {
    let vals = 0;
    for (let j = 0; j < modeMap[i].values.length; j++) {
      vals += modeMap[i].values[j][1]; //2nd item of array is value
    }
    if (metric === 'mean_speed') {
      // For speed, we take the avg. For other metrics we keep the sum
      vals = vals / modeMap[i].values.length;
    }
    summaryMap.push({
      key: modeMap[i].key,
      values: Math.round(vals),
    });
  }

  return summaryMap;
}

/*
 * We use the results to determine whether these results are from custom
 * labels or from the automatically sensed labels. Automatically sensedV
 * labels are in all caps, custom labels are prefixed by label, but have had
 * the label_prefix stripped out before this. Results should have either all
 * sensed labels or all custom labels.
 */
export function isCustomLabels(modeMap) {
  const isSensed = (mode) => mode == mode.toUpperCase();
  const isCustom = (mode) => mode == mode.toLowerCase();
  const metricSummaryChecksCustom: boolean[] = [];
  const metricSummaryChecksSensed: boolean[] = [];

  const distanceKeys = modeMap.map((e) => e.key);
  const isSensedKeys = distanceKeys.map(isSensed);
  const isCustomKeys = distanceKeys.map(isCustom);
  logDebug(`Checking metric keys ${distanceKeys}; sensed ${isSensedKeys}; custom ${isCustomKeys}`);
  const isAllCustomForMetric = isAllCustom(isSensedKeys, isCustomKeys);
  metricSummaryChecksSensed.push(!isAllCustomForMetric);
  metricSummaryChecksCustom.push(Boolean(isAllCustomForMetric));
  logDebug(`overall custom/not results for each metric 
    is ${JSON.stringify(metricSummaryChecksCustom)}`);
  return isAllCustom(metricSummaryChecksSensed, metricSummaryChecksCustom);
}

export function isAllCustom(isSensedKeys, isCustomKeys) {
  const allSensed = isSensedKeys.reduce((a, b) => a && b, true);
  const anySensed = isSensedKeys.reduce((a, b) => a || b, false);
  const allCustom = isCustomKeys.reduce((a, b) => a && b, true);
  const anyCustom = isCustomKeys.reduce((a, b) => a || b, false);
  if (allSensed && !anyCustom) {
    return false; // sensed, not custom
  }
  if (!anySensed && allCustom) {
    return true; // custom, not sensed; false implies that the other option is true
  }
  // Logger.displayError("Mixed entries that combine sensed and custom labels",
  //     "Please report to your program admin");
  return undefined;
}

// [unit suffix, unit conversion function, unit display function]
// e.g. ['hours', (seconds) => seconds/3600, (seconds) => seconds/3600 + ' hours']
type UnitUtils = [string, (v) => number, (v) => string];
export function getUnitUtilsForMetric(
  metricName: MetricName,
  imperialConfig: ImperialConfig,
): UnitUtils {
  const fns: { [k in MetricName]: UnitUtils } = {
    distance: [
      imperialConfig.distanceSuffix,
      (x) => imperialConfig.convertDistance(x),
      (x) => imperialConfig.getFormattedDistance(x) + ' ' + imperialConfig.distanceSuffix,
    ],
    duration: [
      i18next.t('metrics.hours'),
      (v) => secondsToHours(v),
      (v) => formatForDisplay(secondsToHours(v)) + ' ' + i18next.t('metrics.hours'),
    ],
    count: [i18next.t('metrics.trips'), (v) => v, (v) => v + ' ' + i18next.t('metrics.trips')],
    response_count: [
      i18next.t('metrics.responses'),
      (v) => v.responded || 0,
      (v) => {
        const responded = v.responded || 0;
        const total = responded + (v.not_responded || 0);
        return `${responded}/${total} ${i18next.t('metrics.responses')}`;
      },
    ],
  };
  return fns[metricName];
}
