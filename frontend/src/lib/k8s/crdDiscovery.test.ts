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

import { describe, expect, it } from 'vitest';
import type { ApiResource } from './api/v2/ApiResource';
import {
  buildSyntheticCRDsFromDiscovery,
  findSyntheticCRDFromDiscovery,
  isCustomApiResource,
  isForbiddenError,
} from './crdDiscovery';
import { validateCRDSpec } from './crdSpec';

describe('crdDiscovery', () => {
  describe('isCustomApiResource', () => {
    it('returns false for core resources with no group', () => {
      const resource: ApiResource = {
        apiVersion: 'v1',
        groupName: undefined,
        version: 'v1',
        pluralName: 'pods',
        singularName: 'pod',
        kind: 'Pod',
        isNamespaced: true,
      };
      expect(isCustomApiResource(resource)).toBe(false);
    });

    it('returns false for built-in Kubernetes groups', () => {
      const builtins = [
        'apps',
        'batch',
        'networking.k8s.io',
        'rbac.authorization.k8s.io',
        'apiextensions.k8s.io',
      ];
      for (const group of builtins) {
        const resource: ApiResource = {
          apiVersion: `${group}/v1`,
          groupName: group,
          version: 'v1',
          pluralName: 'items',
          singularName: 'item',
          kind: 'Item',
          isNamespaced: true,
        };
        expect(isCustomApiResource(resource)).toBe(false);
      }
    });

    it('returns false for subresources with slashes', () => {
      const subresource: ApiResource = {
        apiVersion: 'example.com/v1',
        groupName: 'example.com',
        version: 'v1',
        pluralName: 'widgets/status',
        singularName: '',
        kind: 'WidgetStatus',
        isNamespaced: true,
      };
      expect(isCustomApiResource(subresource)).toBe(false);
    });

    it('returns false when pluralName or kind is missing', () => {
      expect(
        isCustomApiResource({
          apiVersion: 'example.com/v1',
          groupName: 'example.com',
          version: 'v1',
          pluralName: '',
          singularName: '',
          kind: 'Widget',
          isNamespaced: true,
        })
      ).toBe(false);

      expect(
        isCustomApiResource({
          apiVersion: 'example.com/v1',
          groupName: 'example.com',
          version: 'v1',
          pluralName: 'widgets',
          singularName: '',
          kind: '',
          isNamespaced: true,
        })
      ).toBe(false);
    });

    it('returns true for custom resource groups', () => {
      const customResources: ApiResource[] = [
        {
          apiVersion: 'monitoring.coreos.com/v1',
          groupName: 'monitoring.coreos.com',
          version: 'v1',
          pluralName: 'prometheuses',
          singularName: 'prometheus',
          kind: 'Prometheus',
          isNamespaced: true,
        },
        {
          apiVersion: 'cert-manager.io/v1',
          groupName: 'cert-manager.io',
          version: 'v1',
          pluralName: 'certificates',
          singularName: 'certificate',
          kind: 'Certificate',
          isNamespaced: true,
        },
        {
          apiVersion: 'argoproj.io/v1alpha1',
          groupName: 'argoproj.io',
          version: 'v1alpha1',
          pluralName: 'applications',
          singularName: 'application',
          kind: 'Application',
          isNamespaced: true,
        },
      ];

      for (const res of customResources) {
        expect(isCustomApiResource(res)).toBe(true);
      }
    });
  });

  describe('isForbiddenError', () => {
    it('returns false for null or undefined', () => {
      expect(isForbiddenError(null)).toBe(false);
      expect(isForbiddenError(undefined)).toBe(false);
    });

    it('returns true for status 403 on ApiError or response objects', () => {
      expect(isForbiddenError({ status: 403 })).toBe(true);
      expect(isForbiddenError({ statusCode: 403 })).toBe(true);
      expect(isForbiddenError({ code: 403 })).toBe(true);
    });

    it('returns true for error messages containing forbidden or cannot list', () => {
      expect(
        isForbiddenError(
          new Error(
            'customresourcedefinitions.apiextensions.k8s.io is forbidden: User "system:serviceaccount:default:test" cannot list resource "customresourcedefinitions" in API group "apiextensions.k8s.io" at the cluster scope'
          )
        )
      ).toBe(true);

      expect(isForbiddenError('403 Forbidden')).toBe(true);
      expect(isForbiddenError('cannot list resource "customresourcedefinitions"')).toBe(true);
      expect(isForbiddenError('cannot get resource "customresourcedefinitions"')).toBe(true);
    });

    it('returns false for non-403 errors', () => {
      expect(isForbiddenError({ status: 404, message: 'Not found' })).toBe(false);
      expect(isForbiddenError({ status: 500, message: 'Internal server error' })).toBe(false);
      expect(
        isForbiddenError({ status: 500, message: 'Upstream request failed: 403 Forbidden' })
      ).toBe(false);
      expect(isForbiddenError({ statusCode: 502, message: 'forbidden' })).toBe(false);
      expect(isForbiddenError({ code: 503, message: 'cannot list resource' })).toBe(false);
      expect(isForbiddenError(new Error('Network error'))).toBe(false);
    });
  });

  describe('buildSyntheticCRDsFromDiscovery', () => {
    const sampleResources: ApiResource[] = [
      {
        apiVersion: 'v1',
        groupName: undefined,
        version: 'v1',
        pluralName: 'pods',
        singularName: 'pod',
        kind: 'Pod',
        isNamespaced: true,
      },
      {
        apiVersion: 'monitoring.coreos.com/v1',
        groupName: 'monitoring.coreos.com',
        version: 'v1',
        pluralName: 'prometheuses',
        singularName: 'prometheus',
        kind: 'Prometheus',
        isNamespaced: true,
      },
      {
        apiVersion: 'monitoring.coreos.com/v1alpha1',
        groupName: 'monitoring.coreos.com',
        version: 'v1alpha1',
        pluralName: 'prometheuses',
        singularName: 'prometheus',
        kind: 'Prometheus',
        isNamespaced: true,
      },
      {
        apiVersion: 'example.com/v1',
        groupName: 'example.com',
        version: 'v1',
        pluralName: 'clustersettings',
        singularName: 'clustersetting',
        kind: 'ClusterSetting',
        isNamespaced: false,
      },
    ];

    it('returns empty array when no custom resources exist', () => {
      const crds = buildSyntheticCRDsFromDiscovery(
        [sampleResources[0]],
        ['test-cluster'],
        data => data
      );
      expect(crds).toEqual([]);
    });

    it('groups multiple versions of a custom resource into one CRD and creates valid specs', () => {
      const crds = buildSyntheticCRDsFromDiscovery(
        sampleResources,
        ['test-cluster'],
        (data, cluster) => ({ ...data, cluster })
      );

      expect(crds).toHaveLength(2);

      const prometheusCrd = crds.find(
        c => c.metadata.name === 'prometheuses.monitoring.coreos.com'
      );
      expect(prometheusCrd).toBeDefined();
      expect(prometheusCrd?.cluster).toBe('test-cluster');
      expect(prometheusCrd?.spec.group).toBe('monitoring.coreos.com');
      expect(prometheusCrd?.spec.names.kind).toBe('Prometheus');
      expect(prometheusCrd?.spec.names.plural).toBe('prometheuses');
      expect(prometheusCrd?.spec.names.singular).toBe('prometheus');
      expect(prometheusCrd?.spec.scope).toBe('Namespaced');
      expect(prometheusCrd?.spec.versions).toHaveLength(2);
      expect(prometheusCrd?.spec.versions.map(v => v.name)).toEqual(['v1', 'v1alpha1']);
      expect(prometheusCrd?.spec.versions.map(v => v.storage)).toEqual([false, false]);

      // Spec validation passes
      const validation = validateCRDSpec(prometheusCrd?.spec);
      expect(validation.ok).toBe(true);

      const clusterSettingCrd = crds.find(c => c.metadata.name === 'clustersettings.example.com');
      expect(clusterSettingCrd).toBeDefined();
      expect(clusterSettingCrd?.spec.scope).toBe('Cluster');
    });
  });

  describe('findSyntheticCRDFromDiscovery', () => {
    const sampleResources: ApiResource[] = [
      {
        apiVersion: 'monitoring.coreos.com/v1',
        groupName: 'monitoring.coreos.com',
        version: 'v1',
        pluralName: 'prometheuses',
        singularName: 'prometheus',
        kind: 'Prometheus',
        isNamespaced: true,
      },
    ];

    it('finds by full plural.group name', () => {
      const crd = findSyntheticCRDFromDiscovery(
        sampleResources,
        'prometheuses.monitoring.coreos.com',
        'c1',
        (data, cluster) => ({ ...data, cluster })
      );
      expect(crd).not.toBeNull();
      expect(crd?.metadata.name).toBe('prometheuses.monitoring.coreos.com');
      expect(crd?.cluster).toBe('c1');
    });

    it('finds by kind case-insensitively', () => {
      const crd = findSyntheticCRDFromDiscovery(
        sampleResources,
        'prometheus',
        'c1',
        (data, cluster) => ({ ...data, cluster })
      );
      expect(crd).not.toBeNull();
      expect(crd?.metadata.name).toBe('prometheuses.monitoring.coreos.com');
    });

    it('returns null if not found', () => {
      const crd = findSyntheticCRDFromDiscovery(
        sampleResources,
        'nonexistent.example.com',
        'c1',
        data => data
      );
      expect(crd).toBeNull();
    });

    it('does not mix versions across different groups on bare kind lookup', () => {
      const multiGroupResources: ApiResource[] = [
        {
          apiVersion: 'alpha.example.com/v1',
          groupName: 'alpha.example.com',
          version: 'v1',
          pluralName: 'widgets',
          singularName: 'widget',
          kind: 'Widget',
          isNamespaced: true,
        },
        {
          apiVersion: 'beta.example.com/v2',
          groupName: 'beta.example.com',
          version: 'v2',
          pluralName: 'widgets',
          singularName: 'widget',
          kind: 'Widget',
          isNamespaced: true,
        },
      ];

      const crd = findSyntheticCRDFromDiscovery(multiGroupResources, 'Widget', 'c1', data => data);
      expect(crd).not.toBeNull();
      expect(crd?.metadata.name).toBe('widgets.alpha.example.com');
      expect(crd?.spec.versions.map(v => v.name)).toEqual(['v1']);
    });
  });
});
