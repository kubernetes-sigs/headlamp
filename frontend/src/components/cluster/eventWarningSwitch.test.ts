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
  EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY,
  loadEventWarningSwitch,
  parseStoredEventWarningSwitch,
  storeEventWarningSwitch,
} from './eventWarningSwitch';

describe('parseStoredEventWarningSwitch', () => {
  it('defaults to true when nothing is stored', () => {
    expect(parseStoredEventWarningSwitch(null)).toBe(true);
  });

  it('parses stored true/false', () => {
    expect(parseStoredEventWarningSwitch('true')).toBe(true);
    expect(parseStoredEventWarningSwitch('false')).toBe(false);
  });

  it('falls back to the default on corrupt values instead of throwing', () => {
    expect(parseStoredEventWarningSwitch('not-json')).toBe(true);
    expect(parseStoredEventWarningSwitch('{truncated')).toBe(true);
    expect(parseStoredEventWarningSwitch('123')).toBe(true);
    expect(parseStoredEventWarningSwitch('')).toBe(true);
  });
});

describe('loadEventWarningSwitch/storeEventWarningSwitch', () => {
  afterEach(() => {
    localStorage.removeItem(EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY);
  });

  it('defaults to true when nothing is stored', () => {
    expect(loadEventWarningSwitch()).toBe(true);
  });

  it('does not throw and returns the default on corrupt stored values', () => {
    localStorage.setItem(EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY, 'not-json');
    expect(() => loadEventWarningSwitch()).not.toThrow();
    expect(loadEventWarningSwitch()).toBe(true);
  });

  it('round-trips the preference through localStorage', () => {
    storeEventWarningSwitch(false);
    expect(loadEventWarningSwitch()).toBe(false);

    storeEventWarningSwitch(true);
    expect(loadEventWarningSwitch()).toBe(true);
  });

  it('falls back to the default and warns when localStorage.getItem throws', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spyGetItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    try {
      expect(loadEventWarningSwitch()).toBe(true);
      expect(spyWarn).toHaveBeenCalledWith(
        `Failed to read ${EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY} from localStorage, falling back to the default:`,
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
      expect(() => storeEventWarningSwitch(false)).not.toThrow();
      expect(spyWarn).toHaveBeenCalledWith(
        `Failed to set ${EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY} in localStorage:`,
        expect.any(Error)
      );
    } finally {
      spySetItem.mockRestore();
      spyWarn.mockRestore();
    }
  });
});
