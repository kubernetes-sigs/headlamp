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

import { expect, it, vi } from 'vitest';
import { createBeforeQuitHandler } from './quitCleanup';

it('prevents quit until cleanup settles, then resumes once', async () => {
  let finishCleanup!: () => void;
  const cleanup = vi.fn(() => new Promise<void>(resolve => (finishCleanup = resolve)));
  const quit = vi.fn();
  const handler = createBeforeQuitHandler(cleanup, quit);
  const firstEvent = { preventDefault: vi.fn() };
  const repeatedEvent = { preventDefault: vi.fn() };

  handler(firstEvent);
  handler(repeatedEvent);

  expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
  expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(quit).not.toHaveBeenCalled();

  finishCleanup();
  await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

  const resumedEvent = { preventDefault: vi.fn() };
  handler(resumedEvent);
  expect(resumedEvent.preventDefault).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledOnce();
});

it('resumes quit after reporting a cleanup failure', async () => {
  const error = new Error('cleanup failed');
  const reportError = vi.fn();
  const quit = vi.fn();
  const handler = createBeforeQuitHandler(() => Promise.reject(error), quit, reportError);

  handler({ preventDefault: vi.fn() });

  await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
  expect(reportError).toHaveBeenCalledWith(error);
});

it('resumes quit after the cleanup deadline', async () => {
  vi.useFakeTimers();
  try {
    const cleanup = vi.fn(() => new Promise<void>(() => {}));
    const reportError = vi.fn();
    const quit = vi.fn();
    const handler = createBeforeQuitHandler(cleanup, quit, reportError, 10_000);

    handler({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(quit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(reportError).toHaveBeenCalledWith(
      new Error('Quit cleanup did not settle within 10000ms.')
    );
    expect(quit).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
