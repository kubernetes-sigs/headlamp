/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getAppUrl } from '../../../../helpers/getAppUrl';

export const BASE_HTTP_URL = getAppUrl();
export const CLUSTERS_PREFIX = 'clusters';
export const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
export const DEFAULT_TIMEOUT = 2 * 60 * 1000; // ms
export const MIN_LIFESPAN_FOR_TOKEN_REFRESH = 10; // sec
