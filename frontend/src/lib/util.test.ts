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

import { combineClusterListErrors, flattenClusterListItems } from './util';

describe('flattenClusterListItems', () => {
  it('should return a flattened list of items', () => {
    const result = flattenClusterListItems(
      { cluster1: [1, 2, 3], cluster2: [4, 5] },
      { cluster3: [6, 7], cluster4: null },
      null
    );
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('should return null if all clusters are null', () => {
    const result = flattenClusterListItems({ cluster1: null }, { cluster2: null }, null);
    expect(result).toBeNull();
  });

  it('should return null if there are no items', () => {
    const result = flattenClusterListItems({ cluster1: [] }, { cluster2: [] });
    expect(result).toBeNull();
  });

  it('should handle mixed null and non-null clusters', () => {
    const result = flattenClusterListItems(
      { cluster1: [1, 2], cluster2: null },
      { cluster3: [3, 4] },
      null
    );
    expect(result).toEqual([1, 2, 3, 4]);
  });
});

describe('combineClusterListErrors', () => {
  it('should return null if there are no errors', () => {
    const result = combineClusterListErrors(null, null);
    expect(result).toBeNull();
  });

  it('should combine errors from multiple clusters', () => {
    const error1 = { message: 'Error 1', status: 500, name: 'InternalServerError' };
    const error2 = { message: 'Error 2', status: 404, name: 'NotFoundError' };
    const clusterErrors1 = { clusterA: error1 };
    const clusterErrors2 = { clusterB: error2 };

    const result = combineClusterListErrors(clusterErrors1, clusterErrors2);
    expect(result).toEqual({
      clusterA: error1,
      clusterB: error2,
    });
  });

  it('should ignore null errors', () => {
    const error1 = { message: 'Error 1', status: 500, name: 'InternalServerError' };
    const clusterErrors1 = { clusterA: error1 };
    const clusterErrors2 = { clusterB: null };

    const result = combineClusterListErrors(clusterErrors1, clusterErrors2);
    expect(result).toEqual({
      clusterA: error1,
    });
  });

  it('should return null if all errors are null', () => {
    const clusterErrors1 = { clusterA: null };
    const clusterErrors2 = { clusterB: null };

    const result = combineClusterListErrors(clusterErrors1, clusterErrors2);
    expect(result).toBeNull();
  });
});
