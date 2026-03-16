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

import { configureStore, Middleware } from '@reduxjs/toolkit';
import clusterActionSliceReducer, {
  CallbackAction,
  cancelClusterAction,
  CLUSTER_ACTION_GRACE_PERIOD,
  executeClusterAction,
  updateClusterAction,
} from './clusterActionSlice';

vi.setConfig({ testTimeout: 10000 });

function getStore() {
  const createActionTracker = () => {
    const actions: any[] = [];

    const middleware: Middleware = () => next => action => {
      actions.push(action);
      return next(action);
    };

    const getActions = () => actions;

    return { middleware, getActions };
  };
  const { middleware: actionTracker, getActions } = createActionTracker();

  const store = configureStore({
    reducer: {
      clusterAction: clusterActionSliceReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(actionTracker),
  });

  const customStore = store as typeof store & { getActions: () => any[] };
  customStore.getActions = getActions;

  return customStore;
}

describe('clusterActionSlice', () => {
  let store = getStore();

  beforeEach(() => {
    // Reset the store after each test
    store = getStore();
  });

  describe('executeClusterAction', () => {
    it('should execute cluster action', async () => {
      const callback = vi.fn(() => Promise.resolve());
      const action: CallbackAction = {
        callback,
        startMessage: 'Starting',
        successMessage: 'Success',
        errorMessage: 'Error',
        cancelledMessage: 'Cancelled',
        startOptions: {},
        successOptions: { variant: 'success' },
        errorOptions: { variant: 'error' },
        cancelledOptions: {},
      };

      vi.useFakeTimers();
      const dispatchedAction = store.dispatch(executeClusterAction(action));
      vi.advanceTimersByTime(CLUSTER_ACTION_GRACE_PERIOD);
      await dispatchedAction;
      const actions = store.getActions();
      expect(actions[0].type).toBe('clusterAction/execute/pending');
      expect(callback).toHaveBeenCalledTimes(1);

      // sucess action is done
      expect(actions).toContainEqual(
        expect.objectContaining({
          type: updateClusterAction.type,
          payload: expect.objectContaining({
            message: 'Success',
          }),
        })
      );
      vi.advanceTimersByTime(CLUSTER_ACTION_GRACE_PERIOD);
    });

    it('should dispatch a cancelled action if is cancelled within grace period', async () => {
      const callback = vi.fn(() => Promise.resolve());
      const cancelCallback = vi.fn(() => Promise.resolve());

      const action: CallbackAction = {
        callback,
        startMessage: 'Starting',
        successMessage: 'Success',
        errorMessage: 'Error',
        cancelledMessage: 'Cancelled',
        startOptions: {},
        successOptions: { variant: 'success' },
        errorOptions: { variant: 'error' },
        cancelledOptions: {},
        cancelCallback: cancelCallback,
      };

      vi.useFakeTimers();
      const dispatchedAction = store.dispatch(executeClusterAction(action));

      vi.advanceTimersByTime(CLUSTER_ACTION_GRACE_PERIOD / 2);

      const actionKey = store.getActions().find(action => action.payload?.id !== undefined)
        ?.payload?.id;

      clusterActionSliceReducer(undefined, cancelClusterAction(actionKey));
      await dispatchedAction;

      // cancelled action is done
      const actions = store.getActions();
      expect(actions).toContainEqual(
        expect.objectContaining({
          type: updateClusterAction.type,
          payload: expect.objectContaining({
            message: 'Cancelled',
          }),
        })
      );

      expect(callback).not.toHaveBeenCalled();
      expect(cancelCallback).toHaveBeenCalled();
    });

    it('should dispatch an error action if the callback throws an error', async () => {
      const callback = vi.fn(() => {
        throw new Error('Something went wrong');
      });

      const action: CallbackAction = {
        callback,
        startMessage: 'Starting',
        successMessage: 'Success',
        errorMessage: 'Error',
        cancelledMessage: 'Cancelled',
        startOptions: {},
        successOptions: { variant: 'success' },
        errorOptions: { variant: 'error' },
        cancelledOptions: {},
      };

      vi.useFakeTimers();
      const dispatchedAction = store.dispatch(executeClusterAction(action));
      vi.advanceTimersByTime(CLUSTER_ACTION_GRACE_PERIOD);
      await dispatchedAction;

      // error action is done
      const actions = store.getActions();
      expect(actions).toContainEqual(
        expect.objectContaining({
          type: updateClusterAction.type,
          payload: expect.objectContaining({
            message: 'Error',
          }),
        })
      );

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('updateClusterAction', () => {
    it('should remove an action from the state if only id is provided', () => {
      const actionKey = 'actionKey';
      // first add an action with something other than id, then remove it.
      const action = updateClusterAction({ id: actionKey, message: 'test' });
      const state1 = clusterActionSliceReducer(undefined, action);
      expect(state1[actionKey]).toBeDefined();

      // now remove it by only passing in the id.
      const action2 = updateClusterAction({ id: actionKey });
      const state = clusterActionSliceReducer(undefined, action2);
      expect(state[actionKey]).toBeUndefined();
    });
  });

  describe('cancelClusterAction', () => {
    it('should cancel an action', () => {
      const actionKey = 'actionKey';
      const action = updateClusterAction({ id: actionKey, message: 'test' });
      const state1 = clusterActionSliceReducer(undefined, action);
      expect(state1[actionKey]).toBeDefined();

      const action2 = cancelClusterAction(actionKey);
      const state = clusterActionSliceReducer(undefined, action2);
      expect(state[actionKey]).toBeUndefined();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
