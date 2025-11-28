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

import { isGKECluster, initiateGCPLogin } from './gke';
import { Cluster } from './cluster';

describe('GKE utilities', () => {
  describe('isGKECluster', () => {
    it('should return false for null cluster', () => {
      expect(isGKECluster(null)).toBe(false);
    });

    it('should return false for string cluster name', () => {
      expect(isGKECluster('my-cluster')).toBe(false);
    });

    it('should return false for cluster without server property', () => {
      const cluster: Cluster = {
        name: 'my-cluster',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(false);
    });

    it('should return false for cluster with empty server', () => {
      const cluster: Cluster = {
        name: 'my-cluster',
        server: '',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(false);
    });

    it('should return true for cluster with googleapis.com server', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.googleapis.com',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(true);
    });

    it('should return true for cluster with container.cloud.google.com server', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://container.cloud.google.com/v1/projects/my-project/zones/us-central1-a/clusters/my-cluster',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(true);
    });

    it('should be case insensitive', () => {
      const cluster: Cluster = {
        name: 'gke-cluster',
        server: 'https://35.123.45.67.GOOGLEAPIS.COM',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(true);
    });

    it('should return false for non-GKE cluster', () => {
      const cluster: Cluster = {
        name: 'eks-cluster',
        server: 'https://ABCD1234.gr7.us-west-2.eks.amazonaws.com',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(false);
    });

    it('should return false for on-prem cluster', () => {
      const cluster: Cluster = {
        name: 'on-prem',
        server: 'https://kubernetes.mycompany.com:6443',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(false);
    });

    it('should return false for localhost cluster', () => {
      const cluster: Cluster = {
        name: 'local',
        server: 'https://localhost:6443',
        auth_type: '',
      };
      expect(isGKECluster(cluster)).toBe(false);
    });
  });

  describe('initiateGCPLogin', () => {
    let originalLocation: Location;

    beforeEach(() => {
      // Save the original location
      originalLocation = window.location;
      // Mock window.location
      delete (window as any).location;
      window.location = { href: '' } as Location;
    });

    afterEach(() => {
      // Restore the original location
      window.location = originalLocation;
    });

    it('should redirect to GCP auth login URL', () => {
      initiateGCPLogin('my-gke-cluster');
      expect(window.location.href).toBe('/gcp-auth/login?cluster=my-gke-cluster');
    });

    it('should encode cluster name with special characters', () => {
      initiateGCPLogin('my-cluster-123_test');
      expect(window.location.href).toBe('/gcp-auth/login?cluster=my-cluster-123_test');
    });

    it('should encode cluster name with spaces', () => {
      initiateGCPLogin('my cluster');
      expect(window.location.href).toBe('/gcp-auth/login?cluster=my%20cluster');
    });

    it('should encode cluster name with special URL characters', () => {
      initiateGCPLogin('my&cluster=test');
      expect(window.location.href).toBe('/gcp-auth/login?cluster=my%26cluster%3Dtest');
    });
  });
});
