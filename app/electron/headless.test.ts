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

import { app, dialog } from 'electron';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHeadlessMode, waitForServerListening } from './headless';

const electronMocks = vi.hoisted(() => ({
  showErrorBox: vi.fn(),
  quit: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { quit: electronMocks.quit },
  dialog: { showErrorBox: electronMocks.showErrorBox },
}));

afterEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

describe('startHeadlessMode', () => {
  it('handles backend startup and port discovery rejection cleanly', async () => {
    const error = new Error(
      'Could not find an available port after 100 attempts starting from 4466'
    );
    const startServer = vi.fn().mockRejectedValue(error);
    const onSuccess = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await startHeadlessMode({ startServer, onSuccess });

    expect(startServer).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start the backend server:', error);
    expect(dialog.showErrorBox).toHaveBeenCalledWith(
      'Headlamp failed to start',
      'The backend server could not be started:\n\nCould not find an available port after 100 attempts starting from 4466'
    );
    expect(process.exitCode).toBe(1);
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('handles non-Error rejection cleanly', async () => {
    const error = 'backend spawn error';
    const startServer = vi.fn().mockRejectedValue(error);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await startHeadlessMode({ startServer });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start the backend server:', error);
    expect(dialog.showErrorBox).toHaveBeenCalledWith(
      'Headlamp failed to start',
      'The backend server could not be started:\n\nbackend spawn error'
    );
    expect(process.exitCode).toBe(1);
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('invokes onSuccess and does not show error or quit on successful startup', async () => {
    const serverProcess = { pid: 12345 };
    const startServer = vi.fn().mockResolvedValue(serverProcess);
    const onSuccess = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await startHeadlessMode({ startServer, onSuccess });

    expect(startServer).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith(serverProcess);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(dialog.showErrorBox).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('succeeds without error when onSuccess is omitted', async () => {
    const startServer = vi.fn().mockResolvedValue({ pid: 12345 });
    await startHeadlessMode({ startServer });
    expect(app.quit).not.toHaveBeenCalled();
  });
});

describe('waitForServerListening', () => {
  it('invokes onListening once when stdout emits Listen address', () => {
    vi.useFakeTimers();
    try {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      const onListening = vi.fn();

      waitForServerListening(proc, onListening, 5000);

      proc.stdout.emit('data', Buffer.from('Creating Headlamp handler\n'));
      expect(onListening).not.toHaveBeenCalled();

      proc.stdout.emit('data', Buffer.from('Listen address: 127.0.0.1:4466\n'));
      expect(onListening).toHaveBeenCalledOnce();

      // Subsequent lines or fallback timer must not fire again
      proc.stdout.emit('data', Buffer.from('Listen address: 127.0.0.1:4466\n'));
      vi.advanceTimersByTime(5000);
      expect(onListening).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not invoke onListening if process exits before listening', () => {
    vi.useFakeTimers();
    try {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      const onListening = vi.fn();

      waitForServerListening(proc, onListening, 5000);
      proc.emit('exit', 1);
      vi.advanceTimersByTime(5000);

      expect(onListening).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
