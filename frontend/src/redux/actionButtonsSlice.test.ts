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
import { describe, expect, it } from 'vitest';
import actionButtonsReducer, {
  addDetailsViewHeaderActionsProcessor,
  addResourceActionProvider,
  HeaderActionState,
  ResourceActionProvider,
  setAppBarAction,
  setAppBarActionsProcessor,
  setDetailsViewHeaderAction,
} from './actionButtonsSlice';

describe('actionButtonsSlice', () => {
  const initialState: HeaderActionState = {
    headerActions: [],
    headerActionsProcessors: [],
    appBarActions: [],
    appBarActionsProcessors: [],
    resourceActionProviders: [],
  };

  it('should return the initial state', () => {
    expect(actionButtonsReducer(undefined, { type: '' })).toEqual(initialState);
  });

  describe('setDetailsViewHeaderAction', () => {
    it('should add a header action with a generated ID if none is provided', () => {
      const action = { action: () => 'Test action' };
      const nextState = actionButtonsReducer(
        initialState,
        setDetailsViewHeaderAction(action as any)
      );
      expect(nextState.headerActions).toHaveLength(1);
      expect(nextState.headerActions[0].id).toMatch(/^generated-id-/);
      expect(nextState.headerActions[0].action).toBe(action.action);
    });

    it('should preserve an existing ID if provided', () => {
      const action = { id: 'customID', action: () => 'Test action' };
      const nextState = actionButtonsReducer(initialState, setDetailsViewHeaderAction(action));
      expect(nextState.headerActions[0].id).toBe('customID');
    });
  });

  describe('addDetailsViewHeaderActionsProcessor', () => {
    it('should add a processor with a generated ID if none is provided', () => {
      const processor = (resource: any, actions: any[]) => actions;
      const nextState = actionButtonsReducer(
        initialState,
        addDetailsViewHeaderActionsProcessor(processor as any)
      );
      expect(nextState.headerActionsProcessors).toHaveLength(1);
      expect(nextState.headerActionsProcessors[0].id).toMatch(/^generated-id-/);
      expect(nextState.headerActionsProcessors[0].processor).toBe(processor);
    });

    it('should preserve an existing ID if provided', () => {
      const processorObj = {
        id: 'headerProcessor',
        processor: (resource: any, actions: any[]) => actions,
      };
      const nextState = actionButtonsReducer(
        initialState,
        addDetailsViewHeaderActionsProcessor(processorObj)
      );
      expect(nextState.headerActionsProcessors[0].id).toBe('headerProcessor');
    });
  });

  describe('setAppBarAction', () => {
    it('should add an app bar action', () => {
      const action = { id: 'appBar', action: () => 'AppBar Action' };
      const nextState = actionButtonsReducer(initialState, setAppBarAction(action));
      expect(nextState.appBarActions).toHaveLength(1);
      expect(nextState.appBarActions[0]).toEqual(action);
    });
  });

  describe('setAppBarActionsProcessor', () => {
    it('should add an app bar actions processor with a generated ID if none is provided', () => {
      const processor = (info: any) => info.actions;
      const nextState = actionButtonsReducer(
        initialState,
        setAppBarActionsProcessor(processor as any)
      );
      expect(nextState.appBarActionsProcessors).toHaveLength(1);
      expect(nextState.appBarActionsProcessors[0].id).toMatch(/^generated-id-/);
      expect(nextState.appBarActionsProcessors[0].processor).toBe(processor);
    });

    it('should preserve an existing ID if provided', () => {
      const processorObj = {
        id: 'customAppBarProcessor',
        processor: (info: any) => info.actions,
      };
      const nextState = actionButtonsReducer(initialState, setAppBarActionsProcessor(processorObj));
      expect(nextState.appBarActionsProcessors[0].id).toBe('customAppBarProcessor');
    });
  });

  describe('resourceActionProviders', () => {
    it('should handle initial state for resourceActionProviders', () => {
      const store = configureStore({
        reducer: { actionButtons: actionButtonsReducer },
        middleware: getDefaultMiddleware =>
          getDefaultMiddleware({
            serializableCheck: false,
          }),
      });
      expect(store.getState().actionButtons.resourceActionProviders).toEqual([]);
    });

    it('should register a resource action provider', () => {
      const store = configureStore({
        reducer: { actionButtons: actionButtonsReducer },
        middleware: getDefaultMiddleware =>
          getDefaultMiddleware({
            serializableCheck: false,
          }),
      });
      const dummyProvider: ResourceActionProvider = () => [
        {
          id: 'test-action',
          label: 'Test Action',
          action: () => {},
        },
      ];

      store.dispatch(addResourceActionProvider(dummyProvider));
      const providers = store.getState().actionButtons.resourceActionProviders;
      expect(providers).toHaveLength(1);
      expect(providers[0]).toBe(dummyProvider);
    });
  });
});
