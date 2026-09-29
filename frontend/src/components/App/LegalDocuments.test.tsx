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
import { afterEach, describe, expect, it, vi } from 'vitest';
import LegalDocuments from './LegalDocuments';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() ?? key,
  }),
}));

const desktopApiBase = { platform: 'darwin' as NodeJS.Platform };

/** A promise whose completion is controlled by the test. */
interface Deferred<T> {
  /** Promise supplied to the code under test. */
  promise: Promise<T>;
  /** Resolves the promise with a value. */
  resolve: (value: T) => void;
  /** Rejects the promise with an error. */
  reject: (error: Error) => void;
}

/**
 * Creates a promise that a test can settle explicitly.
 *
 * @returns Deferred promise controls.
 */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('LegalDocuments', () => {
  afterEach(() => {
    window.desktopApi = { ...desktopApiBase };
  });

  it('renders nothing when the host does not expose legal documents', () => {
    const { container } = render(<LegalDocuments />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists manifest-declared documents and closes opened content', async () => {
    const getLegalDocument = vi.fn().mockResolvedValue({
      success: true,
      content: 'license text',
    });
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockResolvedValue([
        { id: 'license', title: 'License agreement' },
        { id: 'notices', title: 'Third-party notices' },
      ]),
      getLegalDocument,
    };

    render(<LegalDocuments />);
    fireEvent.click(await screen.findByRole('button', { name: 'License agreement' }));

    expect(await screen.findByText('license text')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'License agreement' })).toBeInTheDocument();
    expect(getLegalDocument).toHaveBeenCalledWith('license');

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => {
      expect(screen.queryByText('license text')).not.toBeInTheDocument();
    });
  });

  it.each([
    [{ success: false, error: 'Document unavailable' }, 'Document unavailable'],
    [{ success: false }, 'Unable to load legal document.'],
    [{ success: true }, ''],
  ] as const)('handles document result %#', async (result, expected) => {
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockResolvedValue([{ id: 'license', title: 'License' }]),
      getLegalDocument: vi.fn().mockResolvedValue(result),
    };

    render(<LegalDocuments />);
    fireEvent.click(await screen.findByRole('button', { name: 'License' }));

    if (result.success) {
      const dialog = await screen.findByRole('dialog', { name: 'License' });
      expect(dialog).toBeInTheDocument();
      expect(dialog.querySelector('pre')).toBeEmptyDOMElement();
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    }
  });

  it('reports rejected document requests', async () => {
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockResolvedValue([{ id: 'license', title: 'License' }]),
      getLegalDocument: vi.fn().mockRejectedValue(new Error('IPC failed')),
    };

    render(<LegalDocuments />);
    fireEvent.click(await screen.findByRole('button', { name: 'License' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load legal document.');
  });

  it('ignores an older document response that resolves last', async () => {
    const license = createDeferred<{ success: true; content: string }>();
    const notices = createDeferred<{ success: true; content: string }>();
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockResolvedValue([
        { id: 'license', title: 'License' },
        { id: 'notices', title: 'Notices' },
      ]),
      getLegalDocument: vi.fn((id: string) =>
        id === 'license' ? license.promise : notices.promise
      ),
    };

    render(<LegalDocuments />);
    fireEvent.click(await screen.findByRole('button', { name: 'License' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notices' }));
    await act(async () => notices.resolve({ success: true, content: 'notices text' }));

    expect(await screen.findByRole('dialog', { name: 'Notices' })).toHaveTextContent(
      'notices text'
    );

    await act(async () => license.resolve({ success: true, content: 'license text' }));

    expect(screen.getByRole('dialog', { name: 'Notices' })).toHaveTextContent('notices text');
    expect(screen.queryByText('license text')).not.toBeInTheDocument();
  });

  it('ignores an older document request that rejects last', async () => {
    const license = createDeferred<{ success: true; content: string }>();
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockResolvedValue([
        { id: 'license', title: 'License' },
        { id: 'notices', title: 'Notices' },
      ]),
      getLegalDocument: vi.fn((id: string) =>
        id === 'license'
          ? license.promise
          : Promise.resolve({ success: true, content: 'notices text' })
      ),
    };

    render(<LegalDocuments />);
    fireEvent.click(await screen.findByRole('button', { name: 'License' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notices' }));
    expect(await screen.findByRole('dialog', { name: 'Notices' })).toHaveTextContent(
      'notices text'
    );

    await act(async () => license.reject(new Error('stale failure')));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Notices' })).toHaveTextContent('notices text');
  });

  it('reports rejected document-list requests', async () => {
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockRejectedValue(new Error('IPC failed')),
    };

    render(<LegalDocuments />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load legal documents.');
  });

  it('ignores a document list that resolves after unmount', async () => {
    let resolveDocuments: (documents: Array<{ id: string; title: string }>) => void = () => {};
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockReturnValue(
        new Promise(resolve => {
          resolveDocuments = resolve;
        })
      ),
    };
    const { unmount } = render(<LegalDocuments />);

    unmount();
    await act(async () => {
      resolveDocuments([{ id: 'license', title: 'License' }]);
    });

    expect(screen.queryByRole('button', { name: 'License' })).not.toBeInTheDocument();
  });
});
