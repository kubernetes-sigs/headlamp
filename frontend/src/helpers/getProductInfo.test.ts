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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDisplayVersion, getProductName, getProductVersion } from './getProductInfo';

describe('getProductName', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured product name', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_NAME', 'AKS Desktop');

    expect(getProductName()).toBe('AKS Desktop');
  });
});

describe('getProductVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the configured product version', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_VERSION', '1.2.3');

    expect(getProductVersion()).toBe('1.2.3');
  });

  it('returns undefined when no product version is configured', () => {
    expect(getProductVersion()).toBeUndefined();
  });
});

describe('getDisplayVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the configured product version', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_VERSION', '1.2.3');
    vi.stubEnv('REACT_APP_HEADLAMP_VERSION', '0.35.0');

    expect(getDisplayVersion()).toBe('1.2.3');
  });

  it('trims the configured product version', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_VERSION', ' 1.2.3\t');
    vi.stubEnv('REACT_APP_HEADLAMP_VERSION', '0.35.0');

    expect(getDisplayVersion()).toBe('1.2.3');
  });

  it('falls back to the Headlamp version', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_VERSION', '0.35.0');

    expect(getDisplayVersion()).toBe('0.35.0');
  });

  it('falls back to the Headlamp version when the product version is empty', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_VERSION', '');
    vi.stubEnv('REACT_APP_HEADLAMP_VERSION', '0.35.0');

    expect(getDisplayVersion()).toBe('0.35.0');
  });

  it('falls back to the Headlamp version when the product version is whitespace', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_PRODUCT_VERSION', ' \t\n');
    vi.stubEnv('REACT_APP_HEADLAMP_VERSION', '0.35.0');

    expect(getDisplayVersion()).toBe('0.35.0');
  });
});
