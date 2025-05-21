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

import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import i18next from 'i18next';
import { OptionsObject as SnackbarProps } from 'notistack';

/**
 * See components/common/ActionsNotifier.tsx for a user of cluster actions.
 */

type ActionState = 'start' | 'complete' | 'error';

/**
 * A button to display on the action.
 */
export interface ClusterActionButton {
  /**
   * The label to display on the button.
   */
  label: string;
  /**
   * The action to dispatch when the button is clicked.
   */
  actionToDispatch: string;
}

export interface ClusterAction {
  /**
   * A unique id for the action.
   */
  id: string;
  /**
   * A unique id for the action.
   */
  key?: string;
  /**
   * The amount of time to display the snackbar.
   */
  autoHideDuration?: number;
  /**
   * The message to display on the action.
   */
  message?: string;
  /**
   * The url to navigate to when the action is complete.
   */
  url?: string;
  /**
   * The state of the action. Helps identify if in progress, complete, or failed.
   */
  state?: ActionState;
  /**
   * The buttons to display on the action.
   */
  buttons?: ClusterActionButton[];
  /**
   * The id of the snackbar to dismiss.
   */
  dismissSnackbar?: string;
  /**
   * The props to pass to the snackbar. Could be { variant: 'success' }.
   */
  snackbarProps?: SnackbarProps;
}

export interface CallbackAction extends CallbackActionOptions {
  callback: (...args: any[]) => void;
}

export interface CallbackActionOptions {
  callbackArgs?: any[];
  /**
   * The url to navigate to when the action has started.
   */
  startUrl?: string;
  /**
   * The url to navigate to when it is cancelled.
   */
  cancelUrl?: string;
  /**
   * The url to navigate to when there is an error.
   */
  errorUrl?: string;
  /**
   * The url to navigate to when it is successful.
   */
  successUrl?: string;
  /**
   * The message to display when the action has started.
   */
  startMessage?: string;
  /**
   * The message to display when the action is cancelled.
   */
  cancelledMessage?: string;
  /**
   * The message to display when there is an error.
   */
  errorMessage?: string;
  /**
   * The message to display when it is successful.
   */
  successMessage?: string;
  /**
   * The props to pass to the snackbar when the action has started.
   */
  startOptions?: SnackbarProps;
  /**
   * The props to pass to the snackbar when the action is cancelled.
   */
  cancelledOptions?: SnackbarProps;
  /**
   * The props to pass to the snackbar when there is an error.
   */
  successOptions?: SnackbarProps;
  /**
   * The props to pass to the snackbar when it is successful.
   */
  errorOptions?: SnackbarProps;
  /**
   * A callback to execute when the action is cancelled.
   */
  cancelCallback?: (...args: any[]) => void;
}

/**
 * A unique key for each action.
 */
export interface ClusterState {
  [id: string]: ClusterAction;
}

export const initialState: ClusterState = {};

const controllers = new Map<string, AbortController>();

/** The amount of time to wait before allowing the action to be cancelled. */
export const CLUSTER_ACTION_GRACE_PERIOD = 5000;

/**
 * Uses the callback to execute an action and dispatches actions
 * to update the UI based on the result.
 *
 * Gives the user 5 seconds to cancel the action before executing it.
 */
export const executeClusterAction = createAsyncThunk(
  'clusterAction/execute',
  async (action: CallbackAction, { dispatch, rejectWithValue }) => {
    const actionKey = (new Date().getTime() + Math.random()).toString();

    /**
     * See the handler for clusterAction/cancel/ in extraReducers below.
     */
    const uniqueCancelActionType = 'clusterAction/cancel/' + actionKey;

    const controller = new AbortController();
    controllers.set(actionKey, controller);

    const {
      callback,
      startUrl,
      cancelUrl,
      successUrl,
      startMessage,
      cancelledMessage,
      errorMessage,
      errorUrl,
      successMessage,
      callbackArgs,
      cancelCallback,
      startOptions = {},
      cancelledOptions = {},
      successOptions = { variant: 'success' },
      errorOptions = { variant: 'error' },
    } = action;

    // Dispatch actions for all the states.

    function dispatchStart() {
      dispatch(
        updateClusterAction({
          id: actionKey,
          key: actionKey,
          message: startMessage,
          state: 'start',
          url: startUrl,
          buttons: [
            {
              label: i18next.t('translation|Cancel'),
              actionToDispatch: uniqueCancelActionType,
            },
          ],
          snackbarProps: startOptions,
        })
      );
    }
    function dispatchSuccess() {
      dispatch(
        updateClusterAction({
          buttons: undefined,
          dismissSnackbar: actionKey,
          id: actionKey,
          message: successMessage,
          state: 'complete',
          snackbarProps: successOptions,
          url: successUrl,
        })
      );
    }
    function dispatchCancelled() {
      dispatch(
        updateClusterAction({
          buttons: undefined,
          id: actionKey,
          message: cancelledMessage,
          state: 'complete',
          dismissSnackbar: actionKey,
          url: cancelUrl,
          snackbarProps: cancelledOptions,
          autoHideDuration: 3000,
        })
      );
    }
    function dispatchError() {
      dispatch(
        updateClusterAction({
          buttons: undefined,
          dismissSnackbar: actionKey,
          id: actionKey,
          message: errorMessage,
          state: 'error',
          snackbarProps: errorOptions,
          url: errorUrl,
        })
      );
    }
    function dispatchClose() {
      dispatch(
        updateClusterAction({
          id: actionKey,
        })
      );
    }

    async function cancellableActionLogic() {
      dispatchStart();
      try {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, CLUSTER_ACTION_GRACE_PERIOD);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject('Action cancelled');
          });
        });

        if (controller.signal.aborted) {
          return rejectWithValue('Action cancelled');
        }
        if (callbackArgs === undefined) {
          await Promise.resolve(callback());
        } else {
          await Promise.resolve(callback(...callbackArgs));
        }
        dispatchSuccess();
      } catch (err) {
        if ((err as Error).message === 'Action cancelled' || controller.signal.aborted) {
          dispatchCancelled();

          if (cancelCallback) {
            try {
              cancelCallback();
            } catch (err) {
              console.error(err);
            }
          }
        } else {
          dispatchError();
        }
      } finally {
        controllers.delete(actionKey);
        setTimeout(dispatchClose, 3000);
      }
    }

    await cancellableActionLogic();
    return actionKey;
  }
);

const clusterActionSlice = createSlice({
  name: 'clusterAction',
  initialState,
  reducers: {
    /**
     * Updates the state of the action.
     *
     * If only id is provided, the action is removed from the state.
     */
    updateClusterAction: (
      state,
      action: PayloadAction<Partial<ClusterAction> & { id: string }>
    ) => {
      const { id, ...actionOptions } = action.payload;
      if (Object.keys(actionOptions).length === 0) {
        delete state[id];
      } else {
        const { snackbarProps, ...otherActionOptions } = actionOptions;
        state[id] = { ...state[id], ...otherActionOptions, id };
        state[id].snackbarProps = snackbarProps as any; // any because snackbarProps is problematic to ts
      }
    },

    /**
     * Cancels the action with the given key.
     */
    cancelClusterAction: (state, action: PayloadAction<string>) => {
      const actionKey = action.payload;
      const controller = controllers.get(actionKey);

      if (controller) {
        controller.abort();
        controllers.delete(actionKey);
      }
      delete state[actionKey];
    },
  },

  extraReducers: builder => {
    builder.addMatcher(
      action => action.type.startsWith('clusterAction/cancel/'),
      (state, action) => {
        const actionKey = action.type.split('clusterAction/cancel/')[1];
        clusterActionSlice.caseReducers.cancelClusterAction(state, {
          type: 'clusterAction/cancelClusterAction',
          payload: actionKey,
        });
      }
    );
  },
});

export const { updateClusterAction, cancelClusterAction } = clusterActionSlice.actions;

/**
 * Executes the callback action with the given options.
 */
export function clusterAction(
  callback: CallbackAction['callback'],
  actionOptions: CallbackActionOptions = {}
) {
  return executeClusterAction({ callback, ...actionOptions });
}

export default clusterActionSlice.reducer;
