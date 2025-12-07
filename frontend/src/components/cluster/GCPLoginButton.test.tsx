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

import { fireEvent, render, screen } from '@testing-library/react';
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
  let isGKEClusterSpy: MockInstance;
  let initiateGCPLoginSpy: MockInstance;

  beforeEach(() => {
    // Create spies for GKE functions
    isGKEClusterSpy = vi.spyOn(gke, 'isGKECluster');
    initiateGCPLoginSpy = vi.spyOn(gke, 'initiateGCPLogin').mockImplementation(() => {});
    // Mock isGCPOAuthEnabled to prevent actual network calls
    vi.spyOn(gke, 'isGCPOAuthEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render button for GKE cluster', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      render(<GCPLoginButton cluster={cluster} />);

      const button = screen.getByText('Sign in with Google');
      expect(button).toBeDefined();
    });

    it('should not render button for non-GKE cluster', () => {
      const cluster: Cluster = {
        name: 'eks-cluster',
        server: 'https://ABCD1234.gr7.us-west-2.eks.amazonaws.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(false);

      const { container } = render(<GCPLoginButton cluster={cluster} />);

      expect(container.firstChild).toBeNull();
    });

    it('should not render button when cluster name is empty', () => {
      const cluster: Cluster = {
        name: '',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} />);

      expect(container.firstChild).toBeNull();
    });

    it('should handle string cluster name', () => {
      isGKEClusterSpy.mockReturnValue(false);

      const { container } = render(<GCPLoginButton cluster="my-cluster" />);

      expect(container.firstChild).toBeNull();
    });

    it('should render custom button text', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      render(<GCPLoginButton cluster={cluster}>Custom Login Text</GCPLoginButton>);

      const button = screen.getByText('Custom Login Text');
      expect(button).toBeDefined();
    });
  });

  describe('Button interaction', () => {
    it('should call initiateGCPLogin when clicked', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      render(<GCPLoginButton cluster={cluster} />);

      const button = screen.getByText('Sign in with Google');
      fireEvent.click(button);

      expect(initiateGCPLoginSpy).toHaveBeenCalledWith('gke-cluster');
      expect(initiateGCPLoginSpy).toHaveBeenCalledTimes(1);
    });

    it('should call initiateGCPLogin with correct cluster name for string cluster', () => {
      isGKEClusterSpy.mockReturnValue(true);

      render(<GCPLoginButton cluster="my-gke-cluster" />);

      const button = screen.getByText('Sign in with Google');
      fireEvent.click(button);

      expect(initiateGCPLoginSpy).toHaveBeenCalledWith('my-gke-cluster');
    });
  });

  describe('Button props', () => {
    it('should apply custom variant', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} variant="outlined" />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('MuiButton-outlined');
    });

    it('should apply custom color', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} color="secondary" />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('MuiButton-colorSecondary');
    });

    it('should apply custom size', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} size="small" />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('MuiButton-sizeSmall');
    });

    it('should apply fullWidth prop', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} fullWidth />);

      const button = container.querySelector('button');
      expect(button?.className).toContain('MuiButton-fullWidth');
    });

    it('should not apply fullWidth when false', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} fullWidth={false} />);

      const button = container.querySelector('button');
      expect(button?.className).not.toContain('MuiButton-fullWidth');
    });
  });

  describe('Google logo', () => {
    it('should render Google logo SVG', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };

      isGKEClusterSpy.mockReturnValue(true);

      const { container } = render(<GCPLoginButton cluster={cluster} />);

      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg?.getAttribute('width')).toBe('18');
      expect(svg?.getAttribute('height')).toBe('18');
    });
  });
});
