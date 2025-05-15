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

import { configureStore } from '@reduxjs/toolkit';
import resourceTableReducer, {
  addResourceTableColumnsProcessor,
  TableColumnsProcessor,
} from './resourceTableSlice';

describe('resourceTableSlice', () => {
  let store = configureStore({
    reducer: {
      resourceTable: resourceTableReducer,
    },
  });

  beforeEach(() => {
    store = configureStore({
      reducer: {
        resourceTable: resourceTableReducer,
      },
    });
  });

  it('should start with an empty list of processors', () => {
    expect(store.getState().resourceTable.tableColumnsProcessors).toEqual([]);
  });

  it('should add a processor when provided a processor object', () => {
    const processor: TableColumnsProcessor = {
      id: 'test-processor',
      processor: ({ columns }) => columns,
    };

    store.dispatch(addResourceTableColumnsProcessor(processor));

    expect(store.getState().resourceTable.tableColumnsProcessors).toEqual([processor]);
  });

  it('should add a processor with a generated ID when provided a function', () => {
    const processorFunc = ({ columns }: { id: string; columns: any[] }) => columns;

    store.dispatch(addResourceTableColumnsProcessor(processorFunc));

    const processors = store.getState().resourceTable.tableColumnsProcessors;
    expect(processors).toHaveLength(1);
    expect(processors[0].processor).toBe(processorFunc);
    expect(processors[0].id).toMatch(/^generated-id-/);
  });

  it('should not overwrite existing processors when adding a new one', () => {
    const processor1: TableColumnsProcessor = {
      id: 'test-processor-1',
      processor: ({ columns }) => columns,
    };

    const processor2: TableColumnsProcessor = {
      id: 'test-processor-2',
      processor: ({ columns }) => columns,
    };

    store.dispatch(addResourceTableColumnsProcessor(processor1));
    store.dispatch(addResourceTableColumnsProcessor(processor2));

    expect(store.getState().resourceTable.tableColumnsProcessors).toEqual([processor1, processor2]);
  });
});
