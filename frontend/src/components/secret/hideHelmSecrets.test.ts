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

import {
  loadHideHelm,
  parseStoredHideHelm,
  SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY,
  storeHideHelm,
} from './hideHelmSecrets';

describe('parseStoredHideHelm', () => {
  it('defaults to true when nothing is stored', () => {
    expect(parseStoredHideHelm(null)).toBe(true);
  });

  it('parses stored true/false', () => {
    expect(parseStoredHideHelm('true')).toBe(true);
    expect(parseStoredHideHelm('false')).toBe(false);
  });

  it('falls back to the default on corrupt values instead of throwing', () => {
    expect(parseStoredHideHelm('not-json')).toBe(true);
    expect(parseStoredHideHelm('{truncated')).toBe(true);
    expect(parseStoredHideHelm('123')).toBe(true);
    expect(parseStoredHideHelm('')).toBe(true);
  });
});

describe('loadHideHelm/storeHideHelm', () => {
  afterEach(() => {
    localStorage.removeItem(SECRET_LIST_HELM_SECRET_HIDE_STORAGE_KEY);
  });

  it('round-trips the preference through localStorage', () => {
    storeHideHelm(false);
    expect(loadHideHelm()).toBe(false);

    storeHideHelm(true);
    expect(loadHideHelm()).toBe(true);
  });

  it('falls back to the default and warns when localStorage.getItem throws', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spyGetItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    try {
      expect(loadHideHelm()).toBe(true);
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to read hide-Helm-secrets preference from localStorage:',
        expect.any(Error)
      );
    } finally {
      spyGetItem.mockRestore();
      spyWarn.mockRestore();
    }
  });

  it('does not throw and warns when localStorage.setItem throws', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spySetItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    try {
      expect(() => storeHideHelm(false)).not.toThrow();
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to store hide-Helm-secrets preference in localStorage:',
        expect.any(Error)
      );
    } finally {
      spySetItem.mockRestore();
      spyWarn.mockRestore();
    }
  });
});
