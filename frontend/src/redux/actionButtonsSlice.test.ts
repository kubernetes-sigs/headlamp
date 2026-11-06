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

import { vi } from 'vitest';
import reducer, {
  addDetailsViewHeaderActionsProcessor,
  setAppBarAction,
  setAppBarActionsProcessor,
  setDetailsViewHeaderAction,
} from './actionButtonsSlice';
import { HeaderActionState } from './actionButtonsSlice';

describe('actionButtonsSlice', () => {
  const initialState: HeaderActionState = {
    headerActions: [],
    headerActionsProcessors: [],
    appBarActions: [],
    appBarActionsProcessors: [],
  };

  it('should return the initial state', () => {
    expect(reducer(undefined, { type: '' })).toEqual(initialState);
  });

  describe('setDetailsViewHeaderAction', () => {
    it('should add a header action with a generated ID if none is provided', () => {
      const action = { action: () => 'Test action' };
      const nextState = reducer(initialState, setDetailsViewHeaderAction(action as any));
      expect(nextState.headerActions).toHaveLength(1);
      expect(nextState.headerActions[0].id).toMatch(/^generated-id-/);
      expect(nextState.headerActions[0].action).toBe(action.action);
    });

    it('should preserve an existing ID if provided', () => {
      const action = { id: 'customID', action: () => 'Test action' };
      const nextState = reducer(initialState, setDetailsViewHeaderAction(action));
      expect(nextState.headerActions[0].id).toBe('customID');
    });

    it('should keep two ID-less registrations as separate actions even in the same millisecond', () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
      try {
        const first = reducer(
          initialState,
          setDetailsViewHeaderAction({ action: () => 'First' } as any)
        );
        const second = reducer(
          first,
          setDetailsViewHeaderAction({ action: () => 'Second' } as any)
        );
        expect(second.headerActions).toHaveLength(2);
        expect(second.headerActions[0].id).not.toBe(second.headerActions[1].id);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('should update the existing action when the same ID is registered again', () => {
      const firstAction = () => 'First';
      const updatedAction = () => 'Updated';
      const first = reducer(
        initialState,
        setDetailsViewHeaderAction({ id: 'my-action', action: firstAction } as any)
      );
      const second = reducer(
        first,
        setDetailsViewHeaderAction({ id: 'my-action', action: updatedAction } as any)
      );
      expect(second.headerActions).toHaveLength(1);
      expect(second.headerActions[0].action).toBe(updatedAction);
    });

    it('should remove the action when a null action is registered for an existing ID', () => {
      const first = reducer(
        initialState,
        setDetailsViewHeaderAction({ id: 'my-action', action: (() => 'Test') as any } as any)
      );
      const second = reducer(
        first,
        setDetailsViewHeaderAction({ id: 'my-action', action: null } as any)
      );
      expect(second.headerActions).toHaveLength(0);
    });
  });

  describe('addDetailsViewHeaderActionsProcessor', () => {
    it('should add a processor with a generated ID if none is provided', () => {
      const processor = (resource: any, actions: any[]) => actions;
      const nextState = reducer(
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
      const nextState = reducer(initialState, addDetailsViewHeaderActionsProcessor(processorObj));
      expect(nextState.headerActionsProcessors[0].id).toBe('headerProcessor');
    });
  });

  describe('setAppBarAction', () => {
    it('should add an app bar action', () => {
      const action = { id: 'appBar', action: () => 'AppBar Action' };
      const nextState = reducer(initialState, setAppBarAction(action));
      expect(nextState.appBarActions).toHaveLength(1);
      expect(nextState.appBarActions[0]).toEqual(action);
    });
  });

  describe('setAppBarActionsProcessor', () => {
    it('should add an app bar actions processor with a generated ID if none is provided', () => {
      const processor = (info: any) => info.actions;
      const nextState = reducer(initialState, setAppBarActionsProcessor(processor as any));
      expect(nextState.appBarActionsProcessors).toHaveLength(1);
      expect(nextState.appBarActionsProcessors[0].id).toMatch(/^generated-id-/);
      expect(nextState.appBarActionsProcessors[0].processor).toBe(processor);
    });

    it('should preserve an existing ID if provided', () => {
      const processorObj = {
        id: 'customAppBarProcessor',
        processor: (info: any) => info.actions,
      };
      const nextState = reducer(initialState, setAppBarActionsProcessor(processorObj));
      expect(nextState.appBarActionsProcessors[0].id).toBe('customAppBarProcessor');
    });
  });
});
