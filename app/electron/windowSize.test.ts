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

import windowSize from './windowSize';

describe('windowSize', () => {
  const withMargin = true;
  const noMargin = false;
  const table = [
    [{ width: 1366, height: 768 }, withMargin, { width: 1286, height: 608 }], // "Popular"
    [{ width: 1920, height: 1080 }, withMargin, { width: 1840, height: 920 }], // "HD"
    [{ width: 2880, height: 1800 }, withMargin, { width: 1840, height: 920 }], // "Mac retina"
    [{ width: 3240, height: 2160 }, withMargin, { width: 1840, height: 920 }], // "SB3"
    [{ width: 3840, height: 2160 }, withMargin, { width: 1840, height: 920 }], // "4K"
    [{ width: 1366, height: 768 }, noMargin, { width: 1366, height: 768 }], // "Popular"
    [{ width: 1920, height: 1080 }, noMargin, { width: 1920, height: 1080 }], // "HD"
    [{ width: 2880, height: 1800 }, noMargin, { width: 1920, height: 1080 }], // "Mac retina"
    [{ width: 3240, height: 2160 }, noMargin, { width: 1920, height: 1080 }], // "SB3"
    [{ width: 3840, height: 2160 }, noMargin, { width: 1920, height: 1080 }], // "4K"
  ];

  it.each(table)('windowSize(%p, %p) == %p', (workArea, useMargin, expected) => {
    expect(windowSize(workArea, useMargin)).toEqual(expected);
  });
});
