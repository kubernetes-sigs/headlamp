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
import DownloadButton from './DownloadButton';

const { mockFetchLatestKubeObject, mockDump, mockEnqueueSnackbar } = vi.hoisted(() => ({
  mockFetchLatestKubeObject: vi.fn(),
  mockDump: vi.fn(() => 'secret-yaml'),
  mockEnqueueSnackbar: vi.fn(),
}));

vi.mock('./fetchLatestKubeObject', () => ({
  fetchLatestKubeObject: (...args: unknown[]) => mockFetchLatestKubeObject(...args),
}));
vi.mock('js-yaml', () => ({ dump: mockDump }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../ActionButton', () => ({
  default: ({ onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>Download</button>
  ),
}));

const secret = {
  kind: 'Secret',
  jsonData: { metadata: { name: 'example' }, data: {}, dataCount: 2 },
  getName: () => 'example',
} as KubeObject;

const latestSecret = {
  ...secret,
  jsonData: { metadata: { name: 'example' }, data: { token: 'YQ==' } },
} as KubeObject;

describe('DownloadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('fetches a full Secret instead of downloading a metadata-only list row', async () => {
    mockFetchLatestKubeObject.mockResolvedValue(latestSecret);
    render(<DownloadButton item={secret} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(mockDump).toHaveBeenCalledWith(latestSecret.jsonData, { lineWidth: -1 })
    );
  });

  it('does not download a metadata-only Secret when the full fetch fails', async () => {
    mockFetchLatestKubeObject.mockRejectedValue(new Error('forbidden'));
    render(<DownloadButton item={secret} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mockEnqueueSnackbar).toHaveBeenCalled());
    expect(mockDump).not.toHaveBeenCalled();
  });
});
