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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../../test';
import EditMetadataMultipleButton, { isPatchableResource } from './EditMetadataMultipleButton';

// Mocking react-i18next
vi.mock('react-i18next', () => {
  const interpolate = (template: string, options?: Record<string, any>) => {
    if (!options) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) => {
      const value = options[placeholder];
      return value === undefined || value === null ? `{{${placeholder}}}` : String(value);
    });
  };

  const getKeyParts = (key: string) => {
    const separatorIndex = key.indexOf('|');
    if (separatorIndex === -1) return { translationKey: key, fallback: key };
    return {
      translationKey: key.slice(0, separatorIndex),
      fallback: key.slice(separatorIndex + 1),
    };
  };

  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, any>) => {
        const { translationKey, fallback } = getKeyParts(key);
        let translation = fallback;

        if (options?.count !== undefined) {
          const count = Number(options.count);
          if (
            (translationKey.endsWith('_one') && count !== 1) ||
            (translationKey.endsWith('_other') && count === 1)
          ) {
            translation = key;
          }
        }

        return interpolate(translation, options);
      },
    }),
  };
});

const { MockKubeObject, mockClusterAction, mockPatch } = vi.hoisted(() => {
  class MockKubeObject {
    jsonData: any;
    constructor(data: any) {
      this.jsonData = data;
    }
    get kind() {
      return this.jsonData?.kind;
    }
    get metadata() {
      return this.jsonData?.metadata;
    }
    patch(data: any) {
      return mockPatch(data);
    }
    getAuthorization() {
      return Promise.resolve({ status: { allowed: true } });
    }
    getListLink() {
      return '/';
    }
    cluster = 'test-cluster';
  }
  return {
    MockKubeObject,
    mockClusterAction: vi.fn(),
    mockPatch: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('../../../redux/clusterActionSlice', () => ({
  clusterAction: (cb: any, options: any) => {
    mockClusterAction(cb, options);
    return { type: 'CLUSTER_ACTION', cb, options };
  },
  updateClusterAction: vi.fn(),
  cancelClusterAction: vi.fn(),
  initialState: {},
  default: vi.fn(() => ({})),
}));

vi.mock('@iconify/react', () => ({
  Icon: () => <span data-testid="icon" />,
}));

describe('EditMetadataMultipleButton', () => {
  const items = [
    new MockKubeObject({
      kind: 'Deployment',
      metadata: {
        name: 'deploy-1',
        namespace: 'default',
        labels: { app: 'app-1', env: 'prod' },
        annotations: { 'anno-1': 'val-1' },
      },
    }),
    new MockKubeObject({
      kind: 'Deployment',
      metadata: {
        name: 'deploy-2',
        namespace: 'default',
        labels: { app: 'app-2', env: 'prod' },
        annotations: { 'anno-1': 'val-1', 'anno-2': 'val-2' },
      },
    }),
  ] as any;

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockReset();
    mockPatch.mockResolvedValue({});
    queryClient.clear();
  });

  function renderWithProviders(ui: React.ReactElement) {
    return render(
      <QueryClientProvider client={queryClient}>
        <TestContext>{ui}</TestContext>
      </QueryClientProvider>
    );
  }

  describe('isPatchableResource', () => {
    class PrototypePatchableKubeObject {
      kind: string;
      metadata?: Record<string, any>;
      constructor(data: { kind: string; metadata?: Record<string, any> }) {
        this.kind = data.kind;
        this.metadata = data.metadata;
      }
      patch() {
        return Promise.resolve({});
      }
    }
    class PrototypeUnpatchableKubeObject {
      kind: string;
      metadata?: Record<string, any>;
      constructor(data: { kind: string; metadata?: Record<string, any> }) {
        this.kind = data.kind;
        this.metadata = data.metadata;
      }
    }

    it('returns true when metadata is present and patch method exists', async () => {
      const item = new PrototypePatchableKubeObject({ kind: 'Deployment', metadata: {} });
      expect(isPatchableResource(item as any)).toBe(true);
    });

    it('returns false when patch method is absent', async () => {
      const item = new PrototypeUnpatchableKubeObject({ kind: 'Deployment', metadata: {} });
      expect(isPatchableResource(item as any)).toBe(false);
    });

    it('returns false when metadata is absent', async () => {
      const item = new PrototypePatchableKubeObject({ kind: 'Deployment' });
      expect(isPatchableResource(item as any)).toBe(false);
    });

    it('returns false when supportsMetadataPatch is explicitly set to false', async () => {
      const item = Object.assign(
        new PrototypePatchableKubeObject({ kind: 'Deployment', metadata: {} }),
        { supportsMetadataPatch: false }
      );
      expect(isPatchableResource(item as any)).toBe(false);
    });
  });

  describe('Batch Metadata Edit Flow', () => {
    it('opens the dialog and shows correct item count', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      const button = await screen.findByLabelText('Edit metadata');
      fireEvent.click(button);

      expect(await screen.findByText('Edit metadata', { selector: 'h2' })).toBeInTheDocument();
      expect(await screen.findByText(/Changes will be applied to 2 item/)).toBeInTheDocument();
    });

    it('builds correct patch for label additions and removals', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      const openButton = await screen.findByLabelText('Edit metadata');
      fireEvent.click(openButton);

      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'team' } });
      fireEvent.change(screen.getByLabelText('label-value-0'), { target: { value: 'dev' } });

      // Chips only show the key and count: "key (count/total)"
      const envChip = screen.getByText(/env \(2\/2\)/).closest('.MuiChip-root');
      fireEvent.click(envChip!);

      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));

      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            labels: {
              env: null,
              team: 'dev',
            },
          },
        })
      );
    });

    it('ensures "add" wins over "remove" for the same key', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.click(screen.getByText(/env \(2\/2\)/).closest('.MuiChip-root')!);

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'env' } });
      fireEvent.change(screen.getByLabelText('label-value-0'), { target: { value: 'staging' } });

      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));

      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { labels: { env: 'staging' } },
        })
      );
    });

    it('correctly switches to annotations and applies changes', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('Annotations'));
      await waitFor(() =>
        expect(screen.queryByText(/Add \/ update annotations/)).toBeInTheDocument()
      );

      fireEvent.change(screen.getByLabelText('annotation-key-0'), { target: { value: 'author' } });
      fireEvent.change(screen.getByLabelText('annotation-value-0'), { target: { value: 'bot' } });

      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));

      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { annotations: { author: 'bot' } },
        })
      );
    });

    it('collects existing keys and shows their prevalence', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      expect(screen.getByText(/env \(2\/2\)/)).toBeInTheDocument();
      expect(screen.getByText(/app \(2\/2\)/)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Annotations'));
      await waitFor(() =>
        expect(screen.queryByText(/Add \/ update annotations/)).toBeInTheDocument()
      );

      expect(screen.getByText(/anno-1 \(2\/2\)/)).toBeInTheDocument();
      expect(screen.getByText(/anno-2 \(1\/2\)/)).toBeInTheDocument();
    });

    it('handles multiple additions and removals at once', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'k1' } });
      fireEvent.change(screen.getByLabelText('label-value-0'), { target: { value: 'v1' } });

      fireEvent.click(screen.getByText('Add label'));
      fireEvent.change(screen.getByLabelText('label-key-1'), { target: { value: 'k2' } });
      fireEvent.change(screen.getByLabelText('label-value-1'), { target: { value: 'v2' } });

      fireEvent.click(screen.getByText(/env \(2\/2\)/).closest('.MuiChip-root')!);

      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));
      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { labels: { k1: 'v1', k2: 'v2', env: null } },
        })
      );
    });

    it('clears state when cancelled and re-opened', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'temporary' } });
      fireEvent.click(screen.getByRole('button', { name: 'cancel-button' }));

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      expect(screen.getByLabelText('label-key-0')).toHaveValue('');
    });

    it('trims whitespace from keys and submits valid values as-is', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), {
        target: { value: '  spaced-key  ' },
      });
      fireEvent.change(screen.getByLabelText('label-value-0'), {
        target: { value: 'spaced-value' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));
      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { labels: { 'spaced-key': 'spaced-value' } },
        })
      );
    });

    it('handles items with NO labels or annotations', async () => {
      const bareItem = new MockKubeObject({ kind: 'Deployment', metadata: { name: 'bare' } });
      renderWithProviders(<EditMetadataMultipleButton items={[bareItem] as any} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      expect(screen.queryByText('Remove labels')).not.toBeInTheDocument();

      // Kubernetes label values may be empty strings (spec-compliant); submitting a
      // key with no value is intentional and should patch with value "".
      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'new' } });
      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));
      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { labels: { new: '' } },
        })
      );
    });

    it('reports aggregated error details when multiple items fail', async () => {
      mockPatch.mockRejectedValue(new Error('K8s error'));

      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'fail' } });
      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));

      const applyFunc = mockClusterAction.mock.calls[0][0];
      await expect(applyFunc()).rejects.toThrow(/Failed to update metadata for 2 of 2 item/);
    });

    it('filters out items for which the user lacks patch permission', async () => {
      const unauthorizedItem = new MockKubeObject({
        kind: 'Deployment',
        metadata: { name: 'locked' },
      }) as any;
      vi.spyOn(unauthorizedItem, 'getAuthorization').mockResolvedValue({
        status: { allowed: false },
      });

      renderWithProviders(<EditMetadataMultipleButton items={[...items, unauthorizedItem]} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      expect(await screen.findByText(/Changes will be applied to 2 item/)).toBeInTheDocument();
    });

    it('shows a disabled button with tooltip if NO items are patchable by the user', async () => {
      const unauthorizedItem = new MockKubeObject({
        kind: 'Deployment',
        metadata: { name: 'locked' },
      }) as any;
      vi.spyOn(unauthorizedItem, 'getAuthorization').mockResolvedValue({
        status: { allowed: false },
      });

      renderWithProviders(<EditMetadataMultipleButton items={[unauthorizedItem]} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Edit metadata')).toBeDisabled();
      });
    });

    it('shows a disabled menu item if NO items are patchable and buttonStyle is menu', async () => {
      const unauthorizedItem = new MockKubeObject({
        kind: 'Deployment',
        metadata: { name: 'locked' },
      }) as any;
      vi.spyOn(unauthorizedItem, 'getAuthorization').mockResolvedValue({
        status: { allowed: false },
      });

      renderWithProviders(
        <EditMetadataMultipleButton items={[unauthorizedItem]} buttonStyle="menu" />
      );

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Edit metadata/ })).toHaveAttribute(
          'aria-disabled',
          'true'
        );
      });
    });

    it('shows a spinner and hides the confirm button while authorization checks are pending', async () => {
      let resolveAuthorization:
        | ((value: { status: { allowed: boolean; reason: string } }) => void)
        | undefined;
      const pendingItem = new MockKubeObject({
        kind: 'Deployment',
        metadata: { name: 'pending' },
      }) as any;
      vi.spyOn(pendingItem, 'getAuthorization').mockImplementation(
        () =>
          new Promise(resolve => {
            resolveAuthorization = resolve;
          })
      );

      renderWithProviders(<EditMetadataMultipleButton items={[...items, pendingItem]} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));

      expect(await screen.findByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'confirm-button' })).not.toBeInTheDocument();

      resolveAuthorization?.({ status: { allowed: true, reason: '' } });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'confirm-button' })).toBeInTheDocument();
      });
    });

    it('disables Apply and shows a validation error for an invalid label key', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: '.bad-key' } });

      await waitFor(() => {
        expect(screen.getByText(/Key name must start\/end with alphanumeric/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'confirm-button' })).toBeDisabled();
      });
    });

    it('disables Apply and shows an error for duplicate label keys', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'team' } });
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.change(screen.getByLabelText('label-key-1'), { target: { value: 'team' } });

      await waitFor(() => {
        expect(screen.getAllByText(/Duplicate key/).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'confirm-button' })).toBeDisabled();
      });
    });

    it('handles removal of rows via delete button and builds correct patch', async () => {
      renderWithProviders(<EditMetadataMultipleButton items={items} />);

      fireEvent.click(await screen.findByLabelText('Edit metadata'));
      await waitFor(() => expect(screen.queryByText(/Add \/ update labels/)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('label-key-0'), { target: { value: 'keep' } });
      fireEvent.click(screen.getByText('Add label'));
      fireEvent.change(screen.getByLabelText('label-key-1'), { target: { value: 'drop' } });

      fireEvent.click(screen.getAllByLabelText('Remove row')[1]);

      fireEvent.click(screen.getByRole('button', { name: 'confirm-button' }));
      const applyFunc = mockClusterAction.mock.calls[0][0];
      await applyFunc();

      expect(mockPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { labels: { keep: '' } },
        })
      );
    });
  });
});
