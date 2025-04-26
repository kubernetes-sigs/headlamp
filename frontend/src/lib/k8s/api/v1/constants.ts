import { getAppUrl } from '../../../../helpers/getAppUrl';

export const BASE_HTTP_URL = getAppUrl();
export const CLUSTERS_PREFIX = 'clusters';
export const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
export const DEFAULT_TIMEOUT = 2 * 60 * 1000; // ms
export const MIN_LIFESPAN_FOR_TOKEN_REFRESH = 10; // sec
