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

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, History } from 'history';
import React from 'react';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLUSTER_ACTION_GRACE_PERIOD,
  ClusterAction,
  updateClusterAction,
} from '../../redux/clusterActionSlice';
import defaultStore from '../../redux/stores/store';
import ActionsNotifier, { PureActionsNotifier } from './ActionsNotifier';

const mockEnqueueSnackbar = vi.fn();
const mockCloseSnackbar = vi.fn();

vi.mock('notistack', async importOriginal => {
  const actual = await importOriginal<typeof import('notistack')>();
  return {
    ...actual,
    useSnackbar: () => ({
      enqueueSnackbar: mockEnqueueSnackbar,
      closeSnackbar: mockCloseSnackbar,
    }),
  };
});

describe('ActionsNotifier', () => {
  let history: History;

  beforeEach(() => {
    vi.clearAllMocks();
    history = createMemoryHistory({ initialEntries: ['/current-path'] });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderPure(
    clusterActions: { [id: string]: ClusterAction },
    dispatch = vi.fn(),
    customHistory = history
  ) {
    return render(
      <Router history={customHistory}>
        <PureActionsNotifier clusterActions={clusterActions} dispatch={dispatch} />
      </Router>
    );
  }

  describe('PureActionsNotifier', () => {
    it('does not enqueue a snackbar when clusterActions is empty', () => {
      renderPure({});
      expect(mockEnqueueSnackbar).not.toHaveBeenCalled();
      expect(mockCloseSnackbar).not.toHaveBeenCalled();
    });

    it('ignores empty clusterAction objects', () => {
      renderPure({ '1': {} as ClusterAction });
      expect(mockEnqueueSnackbar).not.toHaveBeenCalled();
    });

    it('ignores actions without a message', () => {
      renderPure({
        '1': {
          id: '1',
          url: '/other-path',
        },
      });
      expect(mockEnqueueSnackbar).not.toHaveBeenCalled();
      expect(history.location.pathname).toBe('/other-path');
    });

    it('enqueues a snackbar with default duration and message styling', () => {
      const action: ClusterAction = {
        id: 'action-1',
        message: 'Restarting deployment...',
      };

      renderPure({ 'action-1': action });

      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);
      const [message, options] = mockEnqueueSnackbar.mock.calls[0];
      expect(message).toBe('Restarting deployment...');
      expect(options.autoHideDuration).toBe(CLUSTER_ACTION_GRACE_PERIOD);
      expect(options.style).toEqual({ whiteSpace: 'pre-line' });
      expect(options.key).toMatch(/^action-1-\d+$/);
    });

    it('uses custom autoHideDuration and merges custom snackbarProps', () => {
      const action: ClusterAction = {
        id: 'action-custom',
        key: 'custom-key',
        message: 'Pod failed to delete',
        autoHideDuration: 10000,
        snackbarProps: {
          variant: 'error',
          preventDuplicate: true,
        },
      };

      renderPure({ 'action-custom': action });

      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);
      const [message, options] = mockEnqueueSnackbar.mock.calls[0];
      expect(message).toBe('Pod failed to delete');
      expect(options.autoHideDuration).toBe(10000);
      expect(options.variant).toBe('error');
      expect(options.preventDuplicate).toBe(true);
      expect(options.key).toMatch(/^custom-key-\d+$/);
    });

    it('navigates to action url when it differs from the current path', () => {
      expect(history.location.pathname).toBe('/current-path');

      renderPure({
        'nav-1': {
          id: 'nav-1',
          url: '/workloads/pods',
          message: 'Redirecting to Pods',
        },
      });

      expect(history.location.pathname).toBe('/workloads/pods');
    });

    it('does not push to history if already on the action url', () => {
      const pushSpy = vi.spyOn(history, 'push');

      renderPure({
        'nav-same': {
          id: 'nav-same',
          url: '/current-path',
          message: 'Already on path',
        },
      });

      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('calls closeSnackbar when dismissSnackbar is specified', () => {
      renderPure({
        'dismiss-action': {
          id: 'dismiss-action',
          dismissSnackbar: 'old-snackbar-key-42',
        },
      });

      expect(mockCloseSnackbar).toHaveBeenCalledWith('old-snackbar-key-42');
    });

    it('renders action buttons and dispatches actions on click', () => {
      const dispatchMock = vi.fn();
      const action: ClusterAction = {
        id: 'btn-action',
        message: 'Deployment scaled down',
        buttons: [
          { label: 'Undo', actionToDispatch: 'UNDO_SCALE' },
          { label: 'View Logs', actionToDispatch: 'VIEW_LOGS' },
        ],
      };

      renderPure({ 'btn-action': action }, dispatchMock);

      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);
      const options = mockEnqueueSnackbar.mock.calls[0][1];
      expect(typeof options.action).toBe('function');

      // Render the returned action element
      const ActionComponent = options.action;
      render(<ActionComponent />);

      const undoButton = screen.getByRole('button', { name: 'Undo' });
      const logsButton = screen.getByRole('button', { name: 'View Logs' });

      expect(undoButton).toBeInTheDocument();
      expect(logsButton).toBeInTheDocument();

      fireEvent.click(undoButton);
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'UNDO_SCALE' });

      fireEvent.click(logsButton);
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'VIEW_LOGS' });
    });

    it('handles empty or undefined buttons gracefully', () => {
      renderPure({
        'no-btn': {
          id: 'no-btn',
          message: 'No buttons',
        },
      });

      const options = mockEnqueueSnackbar.mock.calls[0][1];
      const ActionComponent = options.action;
      const { container } = render(<ActionComponent />);
      expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('differentiates complete and error states into separate refKeys', () => {
      const { rerender } = renderPure({
        drain: {
          id: 'drain',
          message: 'Draining node...',
        },
      });
      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);

      // Transition to complete state
      rerender(
        <Router history={history}>
          <PureActionsNotifier
            clusterActions={{
              drain: {
                id: 'drain',
                state: 'complete',
                message: 'Node drain complete',
              },
            }}
            dispatch={vi.fn()}
          />
        </Router>
      );
      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(2);
      expect(mockEnqueueSnackbar.mock.calls[1][0]).toBe('Node drain complete');

      // Transition to error state
      rerender(
        <Router history={history}>
          <PureActionsNotifier
            clusterActions={{
              drain: {
                id: 'drain',
                state: 'error',
                message: 'Node drain failed',
              },
            }}
            dispatch={vi.fn()}
          />
        </Router>
      );
      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(3);
      expect(mockEnqueueSnackbar.mock.calls[2][0]).toBe('Node drain failed');
    });

    it('does not re-enqueue when refKey is already active', () => {
      const action: ClusterAction = {
        id: 'stable-action',
        message: 'Static message',
      };

      const { rerender } = renderPure({ 'stable-action': action });
      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);

      // Re-render with identical action and state
      rerender(
        <Router history={history}>
          <PureActionsNotifier
            clusterActions={{ 'stable-action': { ...action } }}
            dispatch={vi.fn()}
          />
        </Router>
      );

      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);
    });

    it('closes previous snackbar key when a new unique key is generated', () => {
      let now = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      const { rerender } = renderPure({
        'multi-step': {
          id: 'multi-step',
          message: 'Step 1',
        },
      });

      const firstKey = mockEnqueueSnackbar.mock.calls[0][1].key;
      expect(firstKey).toBe('multi-step-1000');

      // Advance time and change action key so uniqueKey differs
      now = 2000;
      rerender(
        <Router history={history}>
          <PureActionsNotifier
            clusterActions={{
              'multi-step': {
                id: 'multi-step',
                key: 'multi-step-step2',
                message: 'Step 2',
              },
            }}
            dispatch={vi.fn()}
          />
        </Router>
      );

      expect(mockCloseSnackbar).toHaveBeenCalledWith(firstKey);
    });

    it('dismisses all open snackbars upon unmount', () => {
      const { unmount } = renderPure({
        actionA: {
          id: 'actionA',
          message: 'Action A active',
        },
        actionB: {
          id: 'actionB',
          message: 'Action B active',
        },
      });

      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(2);
      const keyA = mockEnqueueSnackbar.mock.calls[0][1].key;
      const keyB = mockEnqueueSnackbar.mock.calls[1][1].key;

      unmount();

      expect(mockCloseSnackbar).toHaveBeenCalledWith(keyA);
      expect(mockCloseSnackbar).toHaveBeenCalledWith(keyB);
    });
  });

  describe('ActionsNotifier connected component', () => {
    it('subscribes to redux store and triggers snackbar when clusterAction is updated', () => {
      render(
        <Provider store={defaultStore}>
          <Router history={history}>
            <ActionsNotifier />
          </Router>
        </Provider>
      );

      expect(mockEnqueueSnackbar).not.toHaveBeenCalled();

      act(() => {
        defaultStore.dispatch(
          updateClusterAction({
            id: 'redux-action',
            message: 'Cluster connected successfully',
            snackbarProps: { variant: 'success' },
          })
        );
      });

      expect(mockEnqueueSnackbar).toHaveBeenCalledTimes(1);
      const [message, options] = mockEnqueueSnackbar.mock.calls[0];
      expect(message).toBe('Cluster connected successfully');
      expect(options.variant).toBe('success');
    });
  });
});
