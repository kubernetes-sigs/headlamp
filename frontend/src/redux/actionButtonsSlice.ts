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

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { get, set } from 'lodash';
import type { ReactElement, ReactNode } from 'react';
import type { KubeObject } from '../lib/k8s/KubeObject';

export type HeaderActionType = ((...args: any[]) => ReactNode) | null | ReactElement | ReactNode;
export type DetailsViewFunc = HeaderActionType;

export type AppBarActionType = ((...args: any[]) => ReactNode) | null | ReactElement | ReactNode;
export type RowActionType = ((item: any) => JSX.Element | null | ReactNode) | null;

export type HeaderAction = {
  id: string;
  action?: HeaderActionType;
};

export type RowAction = {
  id: string;
  action?: RowActionType;
};

export type AppBarAction = {
  id: string;
  action?: AppBarActionType;
};

export enum DefaultHeaderAction {
  RESTART = 'RESTART',
  DELETE = 'DELETE',
  EDIT = 'EDIT',
  VIEW = 'VIEW',
  SCALE = 'SCALE',
  POD_LOGS = 'POD_LOGS',
  POD_TERMINAL = 'POD_TERMINAL',
  POD_DEBUG = 'POD_DEBUG',
  POD_ATTACH = 'POD_ATTACH',
  NODE_TOGGLE_CORDON = 'NODE_TOGGLE_CORDON',
  NODE_DRAIN = 'NODE_DRAIN',
  NODE_SHELL = 'NODE_SHELL',
}

export enum DefaultAppBarAction {
  CLUSTER = 'CLUSTER',
  NOTIFICATION = 'NOTIFICATION',
  SETTINGS = 'SETTINGS',
  USER = 'USER',
  GLOBAL_SEARCH = 'GLOBAL_SEARCH',
}

type HeaderActionFuncType = (
  resource: KubeObject | null,
  actions: HeaderAction[]
) => HeaderAction[];

export type HeaderActionsProcessor = {
  id: string;
  processor: HeaderActionFuncType;
};

export type AppBarActionsProcessorArgs = { actions: AppBarAction[] };
export type AppBarActionProcessorType = (info: AppBarActionsProcessorArgs) => AppBarAction[];
export type AppBarActionsProcessor = {
  id: string;
  processor: AppBarActionProcessorType;
};

export interface HeaderActionState {
  headerActions: HeaderAction[];
  headerActionsProcessors: HeaderActionsProcessor[];
  appBarActions: AppBarAction[];
  appBarActionsProcessors: AppBarActionsProcessor[];
}
const initialState: HeaderActionState = {
  headerActions: [],
  headerActionsProcessors: [],
  appBarActions: [],
  appBarActionsProcessors: [],
};

/**
 * Normalizes a header actions processor by ensuring it has an 'id' and a processor function.
 *
 * If the processor is passed as a function, it will be wrapped in an object with a generated ID.
 *
 * @param action - The payload action containing the header actions processor.
 * @returns The normalized header actions processor.
 */
function _normalizeProcessor<Processor, ProcessorProcessor>(
  action: PayloadAction<Processor | ProcessorProcessor>
) {
  let headerActionsProcessor: Processor = action.payload as Processor;
  if (
    get(headerActionsProcessor, 'id') === undefined &&
    typeof headerActionsProcessor === 'function'
  ) {
    const headerActionsProcessor2: unknown = {
      id: '',
      processor: headerActionsProcessor,
    };
    headerActionsProcessor = headerActionsProcessor2 as Processor;
  }
  set(
    headerActionsProcessor as Object,
    'id',
    get(headerActionsProcessor, 'id') || `generated-id-${Date.now().toString(36)}`
  );
  return headerActionsProcessor;
}

export const actionButtonsSlice = createSlice({
  name: 'actionButtons',
  initialState,
  reducers: {
    setDetailsViewHeaderAction(state, action: PayloadAction<HeaderActionType | HeaderAction>) {
      let headerAction = action.payload as HeaderAction;

      if (headerAction.id === undefined) {
        if (headerAction.action === undefined) {
          headerAction = { id: '', action: headerAction as unknown as HeaderActionType };
        } else {
          headerAction = { id: '', action: headerAction.action };
        }
      }
      headerAction.id = headerAction.id || `generated-id-${Date.now().toString(36)}`;

      state.headerActions.push(headerAction);
    },
    addDetailsViewHeaderActionsProcessor(
      state,
      action: PayloadAction<HeaderActionsProcessor | HeaderActionsProcessor['processor']>
    ) {
      state.headerActionsProcessors.push(
        _normalizeProcessor<HeaderActionsProcessor, HeaderActionsProcessor['processor']>(action)
      );
    },

    setAppBarAction(state, action: PayloadAction<AppBarAction | AppBarAction>) {
      state.appBarActions.push(action.payload);
    },

    setAppBarActionsProcessor(
      state,
      action: PayloadAction<AppBarActionsProcessor | AppBarActionsProcessor['processor']>
    ) {
      state.appBarActionsProcessors.push(
        _normalizeProcessor<AppBarActionsProcessor, AppBarActionsProcessor['processor']>(action)
      );
    },
  },
});

export const {
  setDetailsViewHeaderAction,
  addDetailsViewHeaderActionsProcessor,
  setAppBarAction,
  setAppBarActionsProcessor,
} = actionButtonsSlice.actions;

export default actionButtonsSlice.reducer;
