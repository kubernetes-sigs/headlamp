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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { JobSuspendButton } from './JobSuspendButton';
import { resetJobSuspendState } from './jobSuspendState';
const { mockDispatch, mockClusterAction, mockAuthVisible } = vi.hoisted(() => {
  const mockDispatch = vi.fn();
  const mockClusterAction = vi.fn(
    (callback: () => Promise<unknown>, options: { cancelCallback: () => void }) => ({
      type: 'clusterAction/mock',
      callback,
      options,
    })
  );
  const mockAuthVisible = vi.fn();

  return { mockDispatch, mockClusterAction, mockAuthVisible };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

vi.mock('../../redux/clusterActionSlice', () => ({
  clusterAction: mockClusterAction,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const base = key
        .replace('translation|', '')
        .replace(/\{\{\s*newItemName\s*\}\}/g, options?.newItemName ?? '');
      return base.includes('Suspend') ? 'Suspend' : base.includes('Resume') ? 'Resume' : base;
    },
  }),
}));

vi.mock('../common/Resource/AuthVisible', () => ({
  __esModule: true,
  default: (props: { children: React.ReactNode }) => {
    mockAuthVisible(props);
    return <>{props.children}</>;
  },
}));

describe('JobSuspendButton', () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockClusterAction.mockClear();
    mockAuthVisible.mockClear();
    resetJobSuspendState();
  });

  it('scopes the RBAC check to the Job namespace', () => {
    const job: any = {
      metadata: { name: 'demo-job', namespace: 'team-a', uid: 'job-ns' },
      spec: { suspend: false },
      jsonData: { spec: { suspend: false } },
      patch: vi.fn().mockResolvedValue(undefined),
    };

    render(<JobSuspendButton item={job} />);

    expect(mockAuthVisible).toHaveBeenCalled();
    const authProps = mockAuthVisible.mock.calls[0][0];
    expect(authProps.authVerb).toBe('patch');
    expect(authProps.item).toBe(job);
    expect(authProps.namespace).toBe('team-a');
  });

  it('disables the button while a suspend/resume request is pending', async () => {
    const job: any = {
      metadata: { name: 'demo-job', uid: 'job-pending' },
      spec: { suspend: false },
      jsonData: { spec: { suspend: false } },
      patch: vi.fn().mockResolvedValue(undefined),
    };

    render(<JobSuspendButton item={job} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    });

    // While the clusterAction is in its cancellation window the control is disabled so a
    // second activation can't queue a conflicting patch.
    expect(screen.getByRole('button', { name: /Resume/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Resume/i }));
    });
    expect(mockClusterAction).toHaveBeenCalledTimes(1);
  });

  it('optimistically flips the action label before the patch resolves', async () => {
    const job: any = {
      metadata: { name: 'demo-job', uid: 'job-1' },
      spec: { suspend: false },
      jsonData: { spec: { suspend: false } },
      patch: vi.fn().mockResolvedValue(undefined),
    };

    render(<JobSuspendButton item={job} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    });

    expect(mockClusterAction).toHaveBeenCalled();
    const actionCallback = mockClusterAction.mock.calls[0][0];
    await actionCallback();

    await waitFor(() => {
      expect(job.patch).toHaveBeenCalledWith({ spec: { suspend: true } });
      expect(screen.getByRole('button', { name: /Resume/i })).toBeInTheDocument();
    });
  });

  it('rolls back the optimistic state when the patch is cancelled or fails', async () => {
    const job: any = {
      metadata: { name: 'demo-job', uid: 'job-2' },
      spec: { suspend: false },
      jsonData: { spec: { suspend: false } },
      patch: vi.fn().mockRejectedValue(new Error('boom')),
    };

    render(<JobSuspendButton item={job} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    });

    const options = mockClusterAction.mock.calls[0][1];
    await act(async () => {
      options.cancelCallback();
    });
    expect(screen.getByRole('button', { name: /Suspend/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    });

    const actionCallback = mockClusterAction.mock.calls[1][0];
    await expect(actionCallback()).rejects.toThrow('boom');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Suspend/i })).toBeInTheDocument()
    );
  });

  it('keeps the optimistic label through an unrelated status-only update while pending', async () => {
    const job: any = {
      metadata: { name: 'demo-job', uid: 'job-3', resourceVersion: '1' },
      spec: { suspend: false },
      jsonData: { spec: { suspend: false } },
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const { rerender } = render(<JobSuspendButton item={job} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    });

    expect(screen.getByRole('button', { name: /Resume/i })).toBeInTheDocument();

    // An unrelated watch update (e.g. status change) bumps resourceVersion but not spec.suspend.
    const updatedJob = {
      ...job,
      metadata: { ...job.metadata, resourceVersion: '2' },
    };
    rerender(<JobSuspendButton item={updatedJob} />);

    expect(screen.getByRole('button', { name: /Resume/i })).toBeInTheDocument();

    // Once the watched value actually catches up, the optimistic override is dropped.
    const confirmedJob = {
      ...job,
      metadata: { ...job.metadata, resourceVersion: '3' },
      spec: { suspend: true },
    };
    rerender(<JobSuspendButton item={confirmedJob} />);

    expect(screen.getByRole('button', { name: /Resume/i })).toBeInTheDocument();
  });

  it('keeps pending/optimistic state across the button unmounting and remounting (menu close/reopen)', async () => {
    const job: any = {
      metadata: { name: 'demo-job', uid: 'job-4' },
      spec: { suspend: false },
      jsonData: { spec: { suspend: false } },
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const { unmount } = render(<JobSuspendButton item={job} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Suspend/i }));
    });

    expect(screen.getByRole('button', { name: /Resume/i })).toBeInTheDocument();
    expect(mockClusterAction).toHaveBeenCalledTimes(1);

    // Simulate the row-action menu closing, which unmounts this button while the
    // clusterAction cancellation window is still open.
    unmount();

    // Reopening the menu recreates the button from the same (still unchanged) Job.
    render(<JobSuspendButton item={job} />);

    expect(screen.getByRole('button', { name: /Resume/i })).toBeInTheDocument();

    // Clicking again must not queue a second, conflicting patch while one is pending.
    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));
    expect(mockClusterAction).toHaveBeenCalledTimes(1);
  });
});
