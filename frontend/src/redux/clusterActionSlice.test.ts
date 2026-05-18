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
            message: 'Error. Something went wrong',
          }),
        })
      );

      expect(callback).toHaveBeenCalled();
    });

    it('should strip regex suffix from Kubernetes API validation errors', async () => {
      const callback = vi.fn(() => {
        throw new Error(
          `Unprocessable Entity - Deployment.apps "myapp" is invalid: ` +
            `[metadata.labels: Invalid value: "bad val": a valid label must be alphanumeric, ` +
            `regex used for validation is '(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?']`
        );
      });

      const action: CallbackAction = {
        callback,
        errorMessage: 'Failed to apply.',
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
      const errorAction = actions.find(
        a => a.type === updateClusterAction.type && a.payload?.state === 'error'
      );
      expect(errorAction?.payload?.message).not.toContain('regex used for validation');
      expect(errorAction?.payload?.message).toContain('metadata.labels');
    });

    it('should format multi-error K8s validation list into bullet lines', async () => {
      const callback = vi.fn(() => {
        throw new Error(
          `Unprocessable Entity - Deployment.apps "myapp" is invalid: ` +
            `[spec.template.spec.containers[0].image: Invalid value: "bad image": invalid, ` +
            `spec.selector: Invalid value: {}: field is immutable]`
        );
      });

      const action: CallbackAction = {
        callback,
        errorMessage: 'Failed to apply.',
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
      const errorAction = actions.find(
        a => a.type === updateClusterAction.type && a.payload?.state === 'error'
      );
      const msg: string = errorAction?.payload?.message ?? '';
      expect(msg).toContain('• spec.template.spec.containers[0].image');
      expect(msg).toContain('• spec.selector');
      const bulletCount = (msg.match(/•/g) ?? []).length;
      expect(bulletCount).toBeGreaterThanOrEqual(2);
    });

    it('should split multi-error list when later fields contain indexed paths', async () => {
      const callback = vi.fn(() => {
        throw new Error(
          `Unprocessable Entity - Deployment.apps "myapp" is invalid: ` +
            `[spec.replicas: Invalid value: -1: must be greater than or equal to 0, ` +
            `spec.template.spec.containers[0].name: Required value, ` +
            `spec.template.spec.containers[1].image: Invalid value: "": must not be empty]`
        );
      });

      const action: CallbackAction = {
        callback,
        errorMessage: 'Failed to apply.',
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
      const errorAction = actions.find(
        a => a.type === updateClusterAction.type && a.payload?.state === 'error'
      );
      const msg: string = errorAction?.payload?.message ?? '';
      expect(msg).toContain('• spec.replicas');
      expect(msg).toContain('• spec.template.spec.containers[0].name');
      expect(msg).toContain('• spec.template.spec.containers[1].image');
      const bulletCount = (msg.match(/•/g) ?? []).length;
      expect(bulletCount).toBeGreaterThanOrEqual(3);
    });

    it('should not let a bracket inside a quoted value affect depth tracking', async () => {
      const callback = vi.fn(() => {
        throw new Error(
          `Unprocessable Entity - Deployment.apps "myapp" is invalid: ` +
            `[spec.foo: Invalid value: "bad[value": invalid, ` +
            `spec.bar: Required value]`
        );
      });

      const action: CallbackAction = {
        callback,
        errorMessage: 'Failed to apply.',
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
      const errorAction = actions.find(
        a => a.type === updateClusterAction.type && a.payload?.state === 'error'
      );
      const msg: string = errorAction?.payload?.message ?? '';
      expect(msg).toContain('• spec.foo');
      expect(msg).toContain('• spec.bar');
      const bulletCount = (msg.match(/•/g) ?? []).length;
      expect(bulletCount).toBe(2);
    });

    it('should not split a single error whose value contains Go struct fields', async () => {
      // K8s sometimes embeds Go-style struct printouts (e.g. v1.LabelSelector with
      // MatchLabels: / MatchExpressions: fields) inside `Invalid value: ...`. A naive
      // splitter would treat ", MatchExpressions:" as a new error and produce bogus
      // bullets — this is a single field error and must stay on one line.
      const goValue =
        'v1.LabelSelector{MatchLabels:map[string]string{"app":"x"}, ' +
        'MatchExpressions:[]v1.LabelSelectorRequirement(nil)}';
      const callback = vi.fn(() => {
        throw new Error(
          `Unprocessable Entity - Deployment.apps "myapp" is invalid: ` +
            `[spec.selector: Invalid value: ${goValue}: field is immutable]`
        );
      });

      const action: CallbackAction = {
        callback,
        errorMessage: 'Failed to apply.',
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
      const errorAction = actions.find(
        a => a.type === updateClusterAction.type && a.payload?.state === 'error'
      );
      const msg: string = errorAction?.payload?.message ?? '';
      // The whole Go value (including MatchExpressions) must remain on the same bullet.
      expect(msg).toContain('• spec.selector');
      expect(msg).toContain('MatchExpressions');
      // And the result must contain exactly one bullet.
      const bulletCount = (msg.match(/•/g) ?? []).length;
      expect(bulletCount).toBe(1);
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
