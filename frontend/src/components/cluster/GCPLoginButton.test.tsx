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
import { type MockInstance, vi } from 'vitest';
import { Cluster } from '../../lib/k8s/cluster';
import * as gke from '../../lib/k8s/gke';
import { GCPLoginButton } from './GCPLoginButton';

// Mock the translation hook
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'translation|Sign in with Google') {
        return 'Sign in with Google';
      }
      return key;
    },
  }),
}));

describe('GCPLoginButton', () => {
  let initiateGCPLoginSpy: MockInstance;
  let isGCPOAuthEnabledSpy: MockInstance;

  beforeEach(() => {
    // Create spies for GKE functions
    initiateGCPLoginSpy = vi.spyOn(gke, 'initiateGCPLogin').mockImplementation(() => {});
    // Mock isGCPOAuthEnabled - default to true so button renders
    isGCPOAuthEnabledSpy = vi.spyOn(gke, 'isGCPOAuthEnabled').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render button when GCP OAuth is enabled', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      render(<GCPLoginButton cluster={cluster} />);

      await waitFor(() => {
        const button = screen.getByText('Sign in with Google');
        expect(button).toBeDefined();
      });
    });

    it('should not render button when GCP OAuth is disabled', async () => {
      const cluster: Cluster = {
        name: 'eks-cluster',
        server: 'https://ABCD1234.gr7.us-west-2.eks.amazonaws.com',
        auth_type: '',
      };

      isGCPOAuthEnabledSpy.mockResolvedValue(false);

      const { container } = render(<GCPLoginButton cluster={cluster} />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should not render button when cluster name is empty', async () => {
      const cluster: Cluster = {
        name: '',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should render button for string cluster name when GCP OAuth enabled', async () => {
      render(<GCPLoginButton cluster="my-cluster" />);

      await waitFor(() => {
        const button = screen.getByText('Sign in with Google');
        expect(button).toBeDefined();
      });
    });

    it('should render custom button text', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      render(<GCPLoginButton cluster={cluster}>Custom Login Text</GCPLoginButton>);

      await waitFor(() => {
        const button = screen.getByText('Custom Login Text');
        expect(button).toBeDefined();
      });
    });
  });

  describe('Button interaction', () => {
    it('should call initiateGCPLogin when clicked', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      render(<GCPLoginButton cluster={cluster} />);

      await waitFor(() => {
        const button = screen.getByText('Sign in with Google');
        fireEvent.click(button);
      });

      expect(initiateGCPLoginSpy).toHaveBeenCalledWith('gke-cluster');
      expect(initiateGCPLoginSpy).toHaveBeenCalledTimes(1);
    });

    it('should call initiateGCPLogin with correct cluster name for string cluster', async () => {
      render(<GCPLoginButton cluster="my-gke-cluster" />);

      await waitFor(() => {
        const button = screen.getByText('Sign in with Google');
        fireEvent.click(button);
      });

      expect(initiateGCPLoginSpy).toHaveBeenCalledWith('my-gke-cluster');
    });
  });

  describe('Button props', () => {
    it('should apply custom variant', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} variant="outlined" />);

      await waitFor(() => {
        const button = container.querySelector('button');
        expect(button?.className).toContain('MuiButton-outlined');
      });
    });

    it('should apply custom color', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} color="secondary" />);

      await waitFor(() => {
        const button = container.querySelector('button');
        expect(button?.className).toContain('MuiButton-colorSecondary');
      });
    });

    it('should apply custom size', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} size="small" />);

      await waitFor(() => {
        const button = container.querySelector('button');
        expect(button?.className).toContain('MuiButton-sizeSmall');
      });
    });

    it('should apply fullWidth prop', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} fullWidth />);

      await waitFor(() => {
        const button = container.querySelector('button');
        expect(button?.className).toContain('MuiButton-fullWidth');
      });
    });

    it('should not apply fullWidth when false', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} fullWidth={false} />);

      await waitFor(() => {
        const button = container.querySelector('button');
        expect(button?.className).not.toContain('MuiButton-fullWidth');
      });
    });
  });

  describe('Google logo', () => {
    it('should render Google logo SVG', async () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      const { container } = render(<GCPLoginButton cluster={cluster} />);

      await waitFor(() => {
        const svg = container.querySelector('svg');
        expect(svg).toBeDefined();
        expect(svg?.getAttribute('width')).toBe('18');
        expect(svg?.getAttribute('height')).toBe('18');
      });
    });
  });
});
