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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ResourceTableProps } from './ResourceTable';

export interface ResourceTableState {
  /**
   * List of table columns processors. Allowing the modification of what tables show.
   */
  tableColumnsProcessors: TableColumnsProcessor[];
}

export type TableColumnsProcessor = {
  /** Unique ID for this processor. */
  id: string;
  /** Function that will be called to process the columns.
   * @param args.id The table ID.
   * @param args.columns The current table columns.
   *
   * @returns The new table columns.
   */
  processor: <T>(args: {
    id: string;
    columns: ResourceTableProps<T>['columns'];
  }) => ResourceTableProps<T>['columns'];
};

const initialState: ResourceTableState = {
  tableColumnsProcessors: [],
};

const resourceTableSlice = createSlice({
  name: 'resourceTable',
  initialState,
  reducers: {
    /**
     * Adds a table columns processor.
     */
    addResourceTableColumnsProcessor(
      state,
      action: PayloadAction<TableColumnsProcessor | TableColumnsProcessor['processor']>
    ) {
      let processor = action.payload as TableColumnsProcessor;

      if (typeof action.payload === 'function') {
        processor = {
          id: `generated-id-${Date.now().toString(36)}`,
          processor: action.payload,
        };
      }

      state.tableColumnsProcessors.push(processor);
    },
  },
});

export const { addResourceTableColumnsProcessor } = resourceTableSlice.actions;
export { resourceTableSlice };
export default resourceTableSlice.reducer;
