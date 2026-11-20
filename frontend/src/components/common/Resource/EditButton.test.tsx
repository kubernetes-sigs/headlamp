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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import EditButton from './EditButton';

const { mockActivityLaunch, mockFetchLatestKubeObject, mockEnqueueSnackbar, mockEvent } =
  vi.hoisted(() => ({
    mockActivityLaunch: vi.fn(),
    mockFetchLatestKubeObject: vi.fn(),
    mockEnqueueSnackbar: vi.fn(),
    mockEvent: vi.fn(),
  }));
vi.mock('../../activity/Activity', () => ({
  Activity: { close: vi.fn(), launch: mockActivityLaunch },
}));
vi.mock('./fetchLatestKubeObject', () => ({ fetchLatestKubeObject: mockFetchLatestKubeObject }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../redux/headlampEventSlice', () => ({
  useEventCallback: () => mockEvent,
  HeadlampEventType: { EDIT_RESOURCE: 'edit' },
  EventStatus: { OPENED: 'opened' },
}));
vi.mock('./AuthVisible', () => ({
  default: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('./EditorDialog', () => ({ default: () => null }));
vi.mock('../ActionButton', () => ({
  default: ({ onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>Edit</button>
  ),
}));

const item = {
  kind: 'Secret',
  cluster: 'test-cluster',
  metadata: { name: 'example', namespace: 'default', uid: 'secret-uid' },
  jsonData: { data: {}, dataCount: 2 },
} as unknown as KubeObject;

describe('EditButton compact Secrets', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each([401, 403, 500])(
    'does not edit a partial Secret when fetching fails with %i',
    async status => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetchLatestKubeObject.mockRejectedValue({ status });
      render(<EditButton item={item} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      await waitFor(() =>
        expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'error' })
      );
      expect(mockActivityLaunch).not.toHaveBeenCalled();
      expect(mockEvent).not.toHaveBeenCalled();
    }
  );

  it('opens the full Secret after a successful refresh', async () => {
    const latest = { ...item, jsonData: { data: { token: 'YQ==' } } } as KubeObject;
    mockFetchLatestKubeObject.mockResolvedValue(latest);
    render(<EditButton item={item} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalled());
    expect(mockActivityLaunch.mock.calls[0][0].content.props.item).toBe(latest);
  });

  it('keeps the authorization fallback for an ordinary full resource', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const full = { ...item, jsonData: { data: { token: 'YQ==' } } } as KubeObject;
    mockFetchLatestKubeObject.mockRejectedValue({ status: 403 });
    render(<EditButton item={full} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(mockActivityLaunch).toHaveBeenCalled());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'warning' });
  });
});
