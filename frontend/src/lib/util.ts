import humanizeDuration from 'humanize-duration';
import merge from 'lodash/merge';
import React from 'react';
import { useHistory } from 'react-router';
import { filterGeneric, filterResource } from '../redux/filterSlice';
import { useTypedSelector } from '../redux/reducers/reducers';
import store from '../redux/stores/store';
import { getCluster, getClusterGroup, getClusterPrefixedPath } from './cluster';
import { ApiError } from './k8s/apiProxy';
import { KubeMetrics } from './k8s/cluster';
import { KubeEvent } from './k8s/event';
import { KubeObjectInterface } from './k8s/KubeObject';
import Node from './k8s/node';
import { Workload } from './k8s/Workload';
import { parseCpu, parseRam, unparseCpu, unparseRam } from './units';

// Exported to keep compatibility for plugins that may have used them.
export { filterGeneric, filterResource, getClusterPrefixedPath, getCluster, getClusterGroup };

const humanize = humanizeDuration.humanizer();
humanize.languages['en-mini'] = {
  y: () => 'y',
  mo: () => 'mo',
  w: () => 'w',
  d: () => 'd',
  h: () => 'h',
  m: () => 'm',
  s: () => 's',
  ms: () => 'ms',
};

export const CLUSTER_ACTION_GRACE_PERIOD = 5000; // ms

export type DateParam = string | number | Date;

export type DateFormatOptions = 'brief' | 'mini';

export interface TimeAgoOptions {
  format?: DateFormatOptions;
}

/**
 * Show the time passed since the given date, in the desired format.
 *
 * @param date - The date since which to calculate the duration.
 * @param options - `format` takes "brief" or "mini". "brief" rounds the date and uses the largest suitable unit (e.g. "4 weeks"). "mini" uses something like "4w" (for 4 weeks).
 * @returns The formatted date.
 */
export function timeAgo(date: DateParam, options: TimeAgoOptions = {}) {
  const fromDate = new Date(date);
  let now = new Date();

  if (import.meta.env.UNDER_TEST === 'true') {
    // For testing, we consider the current moment to be 3 months from the dates we are testing.
    const days = 24 * 3600 * 1000; // in ms
    now = new Date(fromDate.getTime() + 90 * days);
  }

  return formatDuration(now.getTime() - fromDate.getTime(), options);
}

/** Format a duration in milliseconds to a human-readable string.
 *
 * @param duration - The duration in milliseconds.
 * @param options - `format` takes "brief" or "mini". "brief" rounds the date and uses the largest suitable unit (e.g. "4 weeks"). "mini" uses something like "4w" (for 4 weeks).
 * @returns The formatted duration.
 * */
export function formatDuration(duration: number, options: TimeAgoOptions = {}) {
  const { format = 'brief' } = options;

  if (format === 'brief') {
    return humanize(duration, {
      fallbacks: ['en'],
      round: true,
      largest: 1,
    });
  }

  return humanize(duration, {
    language: 'en-mini',
    spacer: '',
    fallbacks: ['en'],
    round: true,
    largest: 1,
  });
}

export function localeDate(date: DateParam) {
  const options: Intl.DateTimeFormatOptions = { timeZoneName: 'short' };
  let locale: string | undefined = undefined;

  // Force the same conditions under test, so snapshots are the same.
  if (import.meta.env.UNDER_TEST === 'true') {
    options.timeZone = 'UTC';
    options.hour12 = true;
    locale = 'en-US';
    return new Date(date).toISOString();
  } else {
    options.timeZone = store.getState().config.settings.timezone;
  }

  return new Date(date).toLocaleString(locale, options);
}

export function getPercentStr(value: number, total: number) {
  if (total === 0) {
    return null;
  }
  const percentage = (value / total) * 100;
  const decimals = percentage % 10 > 0 ? 1 : 0;
  return `${percentage.toFixed(decimals)} %`;
}

export function getReadyReplicas(item: Workload) {
  return item.status.readyReplicas || item.status.numberReady || 0;
}

export function getTotalReplicas(item: Workload) {
  return item.spec.replicas || item.status.currentNumberScheduled || 0;
}

export function getResourceStr(value: number, resourceType: 'cpu' | 'memory') {
  const resourceFormatters: any = {
    cpu: unparseCpu,
    memory: unparseRam,
  };

  const valueInfo = resourceFormatters[resourceType](value);
  return `${valueInfo.value}${valueInfo.unit}`;
}

export function getResourceMetrics(
  item: Node,
  metrics: KubeMetrics[],
  resourceType: 'cpu' | 'memory'
) {
  if (item.status.capacity === undefined) {
    return [0, 0];
  }
  const resourceParsers: any = {
    cpu: parseCpu,
    memory: parseRam,
  };

  const parser = resourceParsers[resourceType];
  const itemMetrics = metrics.find(itemMetrics => itemMetrics.metadata.name === item.getName());

  const used = parser(itemMetrics ? itemMetrics.usage[resourceType] : '0');
  const capacity = parser(item.status.capacity[resourceType]);

  return [used, capacity];
}

/**
 * Get a function to filter kube resources based on the current global filter state.
 *
 * @returns A filter function that can be used to filter a list of items.
 * @param matchCriteria - The JSONPath criteria to match.
 */
export function useFilterFunc<
  T extends { [key: string]: any } | KubeObjectInterface | KubeEvent =
    | KubeObjectInterface
    | KubeEvent
>(matchCriteria?: string[]) {
  const filter = useTypedSelector(state => state.filter);

  return (item: T, search?: string) => {
    if (item?.metadata) {
      return filterResource(item as KubeObjectInterface | KubeEvent, filter, search, matchCriteria);
    }
    return filterGeneric<T>(item, search, matchCriteria);
  };
}

export function useErrorState(dependentSetter?: (...args: any) => void) {
  const [error, setError] = React.useState<ApiError | null>(null);

  React.useEffect(
    () => {
      if (!!error && !!dependentSetter) {
        dependentSetter(null);
      }
    },
    // eslint-disable-next-line
    [error]
  );

  return [error, setError] as const;
}

/**
 * This function joins a list of items per cluster into a single list of items.
 *
 * @param args The list of objects per cluster to join.
 * @returns The joined list of items, or null if there are no items.
 */
export function flattenClusterListItems<T>(
  ...args: ({ [cluster: string]: T[] | null } | null)[]
): T[] | null {
  const flatItems = args
    .filter(Boolean)
    .flatMap(clusterItems => Object.values(clusterItems ?? {}).flatMap(items => items ?? []));

  return flatItems.length > 0 ? flatItems : null;
}

/**
 * Combines errors per cluster.
 *
 * @param args The list of errors per cluster to join.
 * @returns The joint list of errors, or null if there are no errors.
 */
export function combineClusterListErrors(
  ...args: ({ [cluster: string]: ApiError | null } | null)[]
): { [cluster: string]: ApiError | null } | null {
  const filteredArgs = args.map(clusterErrors => {
    if (clusterErrors === null) {
      return {};
    }
    return Object.fromEntries(Object.entries(clusterErrors).filter(([, error]) => error !== null));
  });

  const errors = merge({}, ...filteredArgs);
  const hasErrors = Object.values(errors).some(error => error !== null);

  return hasErrors ? errors : null;
}

type URLStateParams<T> = {
  /** The defaultValue for the URL state. */
  defaultValue: T;
  /** Whether to hide the parameter when the value is the default one (true by default). */
  hideDefault?: boolean;
  /** The prefix of the URL key to use for this state (a prefix 'my' with a key name 'key' will be used in the URL as 'my.key'). */
  prefix?: string;
};
export function useURLState(
  key: string,
  defaultValue: number
): [number, React.Dispatch<React.SetStateAction<number>>];
export function useURLState(
  key: string,
  valueOrParams: number | URLStateParams<number>
): [number, React.Dispatch<React.SetStateAction<number>>];
/**
 * A hook to manage a state variable that is also stored in the URL.
 *
 * @param key The name of the key in the URL. If empty, then the hook behaves like useState.
 * @param paramsOrDefault The default value of the state variable, or the params object.
 *
 */
export function useURLState<T extends string | number | undefined = string>(
  key: string,
  paramsOrDefault: T | URLStateParams<T>
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const params: URLStateParams<T> =
    typeof paramsOrDefault === 'object' ? paramsOrDefault : { defaultValue: paramsOrDefault };
  const { defaultValue, hideDefault = true, prefix = '' } = params;
  const history = useHistory();
  // Don't even use the prefix if the key is empty
  const fullKey = !key ? '' : !!prefix ? prefix + '.' + key : key;

  function getURLValue() {
    // An empty key means that we don't want to use the state from the URL.
    if (fullKey === '') {
      return null;
    }

    const urlParams = new URLSearchParams(history.location.search);
    const urlValue = urlParams.get(fullKey);
    if (urlValue === null) {
      return null;
    }
    let newValue: string | number = urlValue;
    if (typeof defaultValue === 'number') {
      newValue = Number(urlValue);
      if (Number.isNaN(newValue)) {
        return null;
      }
    }

    return newValue;
  }

  const initialValue = React.useMemo(() => {
    const newValue = getURLValue();
    if (newValue === null) {
      return defaultValue;
    }
    return newValue;
  }, []);
  const [value, setValue] = React.useState<T>(initialValue as T);

  React.useEffect(
    () => {
      const newValue = getURLValue();
      if (newValue === null) {
        if (defaultValue !== undefined && defaultValue !== value) {
          setValue(defaultValue);
        }
      } else if (newValue !== value) {
        setValue(newValue as T);
      }
    },
    // eslint-disable-next-line
    [history]
  );

  React.useEffect(() => {
    // An empty key means that we don't want to use the state from the URL.
    if (fullKey === '') {
      return;
    }

    const urlCurrentValue = getURLValue();

    if (urlCurrentValue === value) {
      return;
    }

    const urlParams = new URLSearchParams(history.location.search);
    let shouldUpdateURL = false;

    if ((value === null || value === defaultValue) && hideDefault) {
      if (urlParams.has(fullKey)) {
        urlParams.delete(fullKey);
        shouldUpdateURL = true;
      }
    } else if (value !== undefined) {
      const urlValue = value as NonNullable<T>;

      urlParams.set(fullKey, urlValue.toString());
      shouldUpdateURL = true;
    }

    if (shouldUpdateURL) {
      history.replace({ search: urlParams.toString() });
    }
  }, [value]);

  return [value, setValue] as [T, React.Dispatch<React.SetStateAction<T>>];
}

// compareUnits compares two units and returns true if they are equal
export function compareUnits(quantity1: string, quantity2: string) {
  // strip whitespace and convert to lowercase
  const qty1 = quantity1.replace(/\s/g, '').toLowerCase();
  const qty2 = quantity2.replace(/\s/g, '').toLowerCase();

  // compare numbers
  return parseInt(qty1) === parseInt(qty2);
}

export function normalizeUnit(resourceType: string, quantity: string) {
  let type = resourceType;

  if (type.includes('.')) {
    type = type.split('.')[1];
  }

  let normalizedQuantity = '';
  let bytes = 0;
  switch (type) {
    case 'cpu':
      normalizedQuantity = quantity?.endsWith('m')
        ? `${Number(quantity.substring(0, quantity.length - 1)) / 1000}`
        : `${quantity}`;
      if (normalizedQuantity === '1') {
        normalizedQuantity = normalizedQuantity + ' ' + 'core';
      } else {
        normalizedQuantity = normalizedQuantity + ' ' + 'cores';
      }
      break;

    case 'memory':
      /**
       * Decimal: m | n | "" | k | M | G | T | P | E
       * Binary: Ki | Mi | Gi | Ti | Pi | Ei
       * Refer https://github.com/kubernetes-client/csharp/blob/840a90e24ef922adee0729e43859cf6b43567594/src/KubernetesClient.Models/ResourceQuantity.cs#L211
       */
      console.log('debug:', quantity, parseInt(quantity), quantity.endsWith('m'));
      bytes = parseInt(quantity);
      if (quantity.endsWith('Ki')) {
        bytes *= 1024;
      } else if (quantity.endsWith('Mi')) {
        bytes *= 1024 * 1024;
      } else if (quantity.endsWith('Gi')) {
        bytes *= 1024 * 1024 * 1024;
      } else if (quantity.endsWith('Ti')) {
        bytes *= 1024 * 1024 * 1024 * 1024;
      } else if (quantity.endsWith('Ei')) {
        bytes *= 1024 * 1024 * 1024 * 1024 * 1024;
      } else if (quantity.endsWith('m')) {
        bytes /= 1000;
      } else if (quantity.endsWith('u')) {
        bytes /= 1000 * 1000;
      } else if (quantity.endsWith('n')) {
        bytes /= 1000 * 1000 * 1000;
      } else if (quantity.endsWith('k')) {
        bytes *= 1000;
      } else if (quantity.endsWith('M')) {
        bytes *= 1000 * 1000;
      } else if (quantity.endsWith('G')) {
        bytes *= 1000 * 1000 * 1000;
      } else if (quantity.endsWith('T')) {
        bytes *= 1000 * 1000 * 1000 * 1000;
      } else if (quantity.endsWith('E')) {
        bytes *= 1000 * 1000 * 1000 * 1000 * 1000;
      }

      if (bytes === 0) {
        normalizedQuantity = '0 Bytes';
      } else {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const k = 1000;
        const dm = 2;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        console.debug('debug bytes:', bytes, i, sizes);
        normalizedQuantity = parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      }
      break;

    default:
      normalizedQuantity = quantity;
      break;
  }
  return normalizedQuantity;
}

/** Creates a unique ID, with the given prefix.
 * If UNDER_TEST is set to true, it will return the same ID every time, so snapshots do not get invalidated.
 */
export function useId(prefix = '') {
  const [id] = React.useState<string | undefined>(
    import.meta.env.UNDER_TEST === 'true'
      ? prefix + 'id'
      : prefix + Math.random().toString(16).slice(2)
  );

  return id;
}

// Make units available from here
export * as auth from './auth';
export * as units from './units';
