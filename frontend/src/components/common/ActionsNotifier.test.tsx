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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { SnackbarProvider } from 'notistack';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '../../i18n/locales/en/translation.json';
import ko from '../../i18n/locales/ko/translation.json';
import type { ClusterAction } from '../../redux/clusterActionSlice';
import { PureActionsNotifier } from './ActionsNotifier';

const i18n = createInstance();

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, ko: { translation: ko } },
    nsSeparator: '|',
  });
});

beforeEach(async () => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  await i18n.changeLanguage('en');
});

afterEach(() => vi.useRealTimers());

function renderAction(action: ClusterAction) {
  const dispatch = vi.fn();
  const view = (current: ClusterAction) => (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <SnackbarProvider>
          <PureActionsNotifier clusterActions={{ [current.id]: current }} dispatch={dispatch} />
        </SnackbarProvider>
      </MemoryRouter>
    </I18nextProvider>
  );
  const result = render(view(action));
  return { dispatch, rerenderAction: (current: ClusterAction) => result.rerender(view(current)) };
}

function pendingAction(): ClusterAction {
  return {
    id: 'delete',
    state: 'start',
    message: 'Deleting 1 item...',
    executeAt: Date.now() + 10000,
    snackbarProps: { autoHideDuration: 10000 },
    buttons: [{ label: 'Cancel', actionToDispatch: 'clusterAction/cancel/delete' }],
  };
}

it('counts down and removes the countdown when execution starts', () => {
  renderAction(pendingAction());
  expect(screen.getByRole('alert')).toHaveTextContent('Deleting 1 item... (10s)');
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('alert')).toHaveTextContent('Deleting 1 item... (9s)');
  act(() => vi.advanceTimersByTime(9000));
  expect(screen.getByText('Deleting 1 item...')).toBeVisible();
  expect(screen.queryByText(/\(\d+s\)/)).not.toBeInTheDocument();
});

it('excludes the ticking suffix from the alert description and keeps Cancel accessible', () => {
  const { dispatch } = renderAction(pendingAction());
  const alert = screen.getByRole('alert');
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  expect(alert).toHaveAccessibleDescription('Deleting 1 item...');
  expect(screen.getByText('(10s)')).toHaveAttribute('aria-hidden', 'true');
  cancel.focus();

  act(() => vi.advanceTimersByTime(3000));

  expect(screen.getByText('(7s)')).toBeVisible();
  expect(alert).toHaveAccessibleDescription('Deleting 1 item...');
  expect(cancel).toHaveFocus();
  fireEvent.click(cancel);
  expect(dispatch).toHaveBeenCalledWith({ type: 'clusterAction/cancel/delete' });
});

it('localizes the countdown for Korean', async () => {
  await i18n.changeLanguage('ko');
  renderAction(pendingAction());
  expect(screen.getByRole('alert')).toHaveTextContent('Deleting 1 item... (10\ucd08)');
});

it.each(['complete', 'error'] as const)('replaces the countdown on %s', async state => {
  const { rerenderAction } = renderAction(pendingAction());
  act(() => vi.advanceTimersByTime(10000));
  rerenderAction({ id: 'delete', state, message: 'Finished', executeAt: Date.now() + 10000 });
  act(() => vi.advanceTimersByTime(1000));
  for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  }
  expect(screen.getByText('Finished')).toBeVisible();
  expect(screen.queryByText(/Deleting|\(\d+s\)/)).not.toBeInTheDocument();
});

it('keeps Cancel working and replaces the countdown after cancellation', async () => {
  const { dispatch, rerenderAction } = renderAction(pendingAction());
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(dispatch).toHaveBeenCalledWith({ type: 'clusterAction/cancel/delete' });
  rerenderAction({ id: 'delete', state: 'complete', message: 'Cancelled' });
  act(() => vi.advanceTimersByTime(1000));
  for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
  }
  expect(screen.getByText('Cancelled')).toBeVisible();
  expect(screen.queryByText(/Deleting/)).not.toBeInTheDocument();
});

it.each([undefined, 0, -1000])(
  'does not add a countdown for a missing or elapsed deadline: %s',
  offset => {
    renderAction({
      id: 'immediate',
      state: 'start',
      message: 'Deleting 1 item...',
      executeAt: offset === undefined ? undefined : Date.now() + offset,
    });
    expect(screen.getByText('Deleting 1 item...')).toBeVisible();
    expect(screen.queryByText(/\(\d+s\)/)).not.toBeInTheDocument();
  }
);
