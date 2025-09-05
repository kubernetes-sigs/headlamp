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

import { createRouteURL } from '../router/createRouteURL';
import { labelSelectorToQuery, ResourceClasses } from '.';
import { LabelSelector } from './cluster';
import { KubeObjectClass } from './KubeObject';
import Namespace from './namespace';

// Remove NetworkPolicy since we don't use it.
const k8sClassesToTest = Object.values(ResourceClasses).filter(
  cls => cls.className !== 'NetworkPolicy'
);

const mockK8sObject = (className: string) => ({
  apiVersion: 'v1',
  kind: className,
  metadata: {
    name: 'phony',
    namespace: 'macaroni',
    creationTimestamp: '2020-01-01T00:00:00Z',
    uid: 'phony-01-02-03',
    resourceVersion: '01',
    selfLink: 'http://localhost/api/v1/phony/01',
  },
});

describe('Class tests', () => {
  Object.values(ResourceClasses).forEach((cls: KubeObjectClass) => {
    test(`Check plurals for ${cls.className}`, () => {
      expect(cls.pluralName).toBe(cls.pluralName.toLowerCase());
      // Check naive plural for classes ending in 's'. E.g. Check plural for myClass != myClasss
      if (cls.className.endsWith('s')) {
        expect(cls.pluralName.toLowerCase()).not.toBe(cls.className.toLowerCase() + 's');
      }
      if (cls.className.endsWith('s')) {
        expect(cls.listRoute.toLowerCase()).not.toBe(cls.className.toLowerCase() + 's');
      }
    });
  });

  k8sClassesToTest.forEach((cls: KubeObjectClass) => {
    const instance = new cls(mockK8sObject(cls.className));

    test(`List routes for "${cls.className}"`, () => {
      const route = createRouteURL(instance.listRoute, { cluster: 'MyCluster' });
      expect(route).not.toBe('');
      expect(route).not.toBe('/');
    });
  });

  k8sClassesToTest.forEach((cls: KubeObjectClass) => {
    const instance = new cls(mockK8sObject(cls.className));

    test(`Details routes for "${cls.className}"`, () => {
      const route = createRouteURL(instance.detailsRoute, {
        cluster: 'MyCluster',
        name: instance.metadata.name,
        namespace: instance.metadata.namespace,
      });
      expect(route).not.toBe('');
      expect(route).not.toBe('/');
    });
  });
});

const labelSelector: LabelSelector = {
  matchLabels: {
    app: 'test',
    label1: 'value1',
  },
};

describe('Label selector', () => {
  test('Match labels alone', () => {
    const query = labelSelectorToQuery(labelSelector);
    expect(query).toBe('app=test,label1=value1');
  });

  test('Match labels and match expressions', () => {
    const query = labelSelectorToQuery({
      ...labelSelector,
      matchExpressions: [
        {
          key: 'label2',
          operator: 'In',
          values: ['value2', 'value3'],
        },
      ],
    });
    expect(query).toBe('app=test,label1=value1,label2 in (value2,value3)');
  });

  test('Match expression In', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'In',
          values: ['value2', 'value3'],
        },
      ],
    });
    expect(query).toBe('label2 in (value2,value3)');
  });

  test('Match expression NotIn', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'NotIn',
          values: ['value2', 'value3'],
        },
      ],
    });
    expect(query).toBe('label2 notin (value2,value3)');
  });

  test('Match expression Equals', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'Equals',
          values: ['value2'],
        },
      ],
    });
    expect(query).toBe('label2=value2');
  });

  test('Match expression DoubleEquals', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'DoubleEquals',
          values: ['value2'],
        },
      ],
    });
    expect(query).toBe('label2==value2');
  });

  test('Match expression NotEquals', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'NotEquals',
          values: ['value2'],
        },
      ],
    });
    expect(query).toBe('label2!=value2');
  });

  test('Match expression GreaterThan', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'GreaterThan',
          values: ['value2'],
        },
      ],
    });
    expect(query).toBe('label2>value2');
  });

  test('Match expression LessThan', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'LessThan',
          values: ['value2'],
        },
      ],
    });
    expect(query).toBe('label2<value2');
  });

  test('Match expression Exists', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'Exists',
          values: [],
        },
      ],
    });
    expect(query).toBe('label2');
  });

  test('Match expression DoesNotExist', () => {
    const query = labelSelectorToQuery({
      matchExpressions: [
        {
          key: 'label2',
          operator: 'DoesNotExist',
          values: [],
        },
      ],
    });
    expect(query).toBe('!label2');
  });
});

const notNamespacedClasses = [
  'ClusterRole',
  'ClusterRoleBinding',
  'CustomResourceDefinition',
  'GatewayClass',
  'IngressClass',
  'Namespace',
  'Node',
  'PersistentVolume',
  'PriorityClass',
  'RuntimeClass',
  'StorageClass',
];

const namespacedClasses = [
  'ConfigMap',
  'CronJob',
  'DaemonSet',
  'Deployment',
  'Endpoint',
  'Endpoints',
  'EndpointSlice',
  'GRPCRoute',
  'Gateway',
  'HorizontalPodAutoscaler',
  'HTTPRoute',
  'Ingress',
  'Job',
  'Lease',
  'LimitRange',
  'NetworkPolicy',
  'Pod',
  'ReplicaSet',
  'ResourceQuota',
  'Role',
  'RoleBinding',
  'Secret',
  'Service',
  'ServiceAccount',
  'StatefulSet',
  'PodDisruptionBudget',
  'PersistentVolumeClaim',
];

describe('Test class namespaces', () => {
  const classCopy: Record<string, KubeObjectClass> = { ...ResourceClasses };
  namespacedClasses.forEach(cls => {
    test(`Check namespaced ${cls}`, () => {
      expect(classCopy[cls]).toBeDefined();
      expect(classCopy[cls].isNamespaced).toBe(true);
      delete classCopy[cls];
    });
  });

  notNamespacedClasses.forEach(cls => {
    test(`Check not namespaced ${cls}`, () => {
      expect(classCopy[cls]).toBeDefined();
      expect(classCopy[cls].isNamespaced).toBe(false);
      delete classCopy[cls];
    });
  });

  test('Check all classes', () => {
    expect(classCopy).toEqual({});
  });
});

/**
 * This is a function test for the Namespace class.
 * note: this test will not work correctly if used in its own environment (i.e. namespace.test.ts)
 */
describe('Namespace testing', () => {
  describe('test working isValidNamespaceFormat', () => {
    it('should return true for valid namespace', () => {
      expect(Namespace.isValidNamespaceFormat('valid-namespace')).toBe(true);
    });

    it('should return false for namespace longer than 63 characters', () => {
      const longNamespace = 'a'.repeat(64);
      expect(Namespace.isValidNamespaceFormat(longNamespace)).toBe(false);
    });

    it('should return false for namespace with invalid characters', () => {
      expect(Namespace.isValidNamespaceFormat('invalid_namespace')).toBe(false);
    });

    it('should return false for namespace with capital letters', () => {
      expect(Namespace.isValidNamespaceFormat('InvalidNamespace')).toBe(false);
    });

    it('should return false for empty namespace', () => {
      expect(Namespace.isValidNamespaceFormat('')).toBe(false);
    });
  });
});
