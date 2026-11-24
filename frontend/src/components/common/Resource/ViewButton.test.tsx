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
import { KubeObject } from '../../../lib/k8s/cluster';
import ViewButton from './ViewButton';

const { mockActivityClose, mockActivityLaunch, mockFetchLatestKubeObject } = vi.hoisted(() => ({
  mockActivityClose: vi.fn(),
  mockActivityLaunch: vi.fn(),
  mockFetchLatestKubeObject: vi.fn(),
}));

vi.mock('../../activity/Activity', () => ({
  Activity: {
    close: (...args: unknown[]) => mockActivityClose(...args),
    launch: (...args: unknown[]) => mockActivityLaunch(...args),
  },
}));

vi.mock('./fetchLatestKubeObject', () => ({
  fetchLatestKubeObject: (...args: unknown[]) => mockFetchLatestKubeObject(...args),
}));

vi.mock('../ActionButton', () => ({
  default: ({ onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>View</button>
  ),
}));

vi.mock('./EditorDialog', () => ({
  default: () => null,
}));

vi.mock('@iconify/react', () => ({
  Icon: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const item = {
  cluster: 'test-cluster',
  jsonData: { metadata: { resourceVersion: '1' } },
  kind: 'Pod',
  metadata: {
    name: 'test-pod',
    namespace: 'default',
    uid: 'test-uid',
  },
} as KubeObject;

const latestItem = {
  ...item,
  jsonData: { metadata: { resourceVersion: '2' } },
} as KubeObject;

describe('ViewButton', () => {
  beforeEach(() => {
    mockActivityClose.mockReset();
    mockActivityLaunch.mockReset();
    mockFetchLatestKubeObject.mockReset();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  });

  it('opens the latest resource beside the current content when clicked', async () => {
    mockFetchLatestKubeObject.mockResolvedValue(latestItem);

    render(<ViewButton item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(mockActivityClose).toHaveBeenCalledWith('yaml-test-uid');
      expect(mockActivityLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          cluster: 'test-cluster',
          id: 'yaml-test-uid',
          location: 'split-right-wide',
          title: 'test-pod',
        })
      );
    });
  });

  it('opens the resource in a centered window on medium screens', async () => {
    mockFetchLatestKubeObject.mockResolvedValue(latestItem);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });

    render(<ViewButton item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() =>
      expect(mockActivityLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ location: 'window-medium' })
      )
    );
  });

  it('opens the resource fullscreen on phones', async () => {
    mockFetchLatestKubeObject.mockResolvedValue(latestItem);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    render(<ViewButton item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() =>
      expect(mockActivityLaunch).toHaveBeenCalledWith(expect.objectContaining({ location: 'full' }))
    );
  });

  it('opens automatically when initially toggled', async () => {
    mockFetchLatestKubeObject.mockResolvedValue(latestItem);

    render(<ViewButton item={item} initialToggle />);

    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));
  });

  it('falls back to the supplied resource when fetching fails', async () => {
    const error = new Error('request failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchLatestKubeObject.mockRejectedValue(error);

    render(<ViewButton item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Error while fetching latest resource for YAML view:',
        {
          cluster: 'test-cluster',
          kind: 'Pod',
          name: 'test-pod',
          namespace: 'default',
        },
        error
      );
      expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
    });
    consoleError.mockRestore();
  });

  it('ignores a stale successful request', async () => {
    let resolveFirstRequest!: (value: KubeObject) => void;
    const firstRequest = new Promise<KubeObject>(resolve => {
      resolveFirstRequest = resolve;
    });
    mockFetchLatestKubeObject.mockReturnValueOnce(firstRequest).mockResolvedValueOnce(latestItem);

    render(<ViewButton item={item} />);
    const button = screen.getByRole('button', { name: 'View' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));
    await act(async () => resolveFirstRequest(item));
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
  });

  it('ignores an error from a stale request', async () => {
    let rejectFirstRequest!: (reason: Error) => void;
    const firstRequest = new Promise<KubeObject>((_resolve, reject) => {
      rejectFirstRequest = reject;
    });
    mockFetchLatestKubeObject.mockReturnValueOnce(firstRequest).mockResolvedValueOnce(latestItem);

    render(<ViewButton item={item} />);
    const button = screen.getByRole('button', { name: 'View' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalledTimes(1));
    await act(async () => rejectFirstRequest(new Error('stale request failed')));
    expect(mockActivityLaunch).toHaveBeenCalledTimes(1);
  });
});
