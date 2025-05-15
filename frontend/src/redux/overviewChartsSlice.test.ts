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

import overviewChartsReducer, {
  addOverviewChartsProcessor,
  OverviewChartsProcessor,
} from './overviewChartsSlice';
import { OverviewChart } from './overviewChartsSlice';

describe('overviewChartsSlice', () => {
  const initialState = {
    processors: [],
  };

  it('should handle initial state', () => {
    expect(overviewChartsReducer(undefined, { type: '' })).toEqual(initialState);
  });

  it('should add a processor to the state', () => {
    const processor: OverviewChartsProcessor = {
      id: 'testProcessor',
      processor: (charts: OverviewChart[]) => charts,
    };

    const nextState = overviewChartsReducer(initialState, addOverviewChartsProcessor(processor));

    expect(nextState.processors).toEqual([processor]);
  });

  it('should add multiple processors to the state', () => {
    const processor1: OverviewChartsProcessor = {
      id: 'testProcessor1',
      processor: (charts: OverviewChart[]) => charts,
    };

    const processor2: OverviewChartsProcessor = {
      id: 'testProcessor2',
      processor: (charts: OverviewChart[]) => charts,
    };

    let nextState = overviewChartsReducer(initialState, addOverviewChartsProcessor(processor1));
    nextState = overviewChartsReducer(nextState, addOverviewChartsProcessor(processor2));

    expect(nextState.processors).toEqual([processor1, processor2]);
  });

  it('should not modify the original state', () => {
    const processor: OverviewChartsProcessor = {
      id: 'testProcessor',
      processor: (charts: OverviewChart[]) => charts,
    };

    overviewChartsReducer(initialState, addOverviewChartsProcessor(processor));

    expect(initialState.processors).toEqual([]);
  });
});
