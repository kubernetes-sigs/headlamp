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
import App from '../../App';
import MutatingAdmissionPolicy from './mutatingAdmissionPolicy';
import MutatingAdmissionPolicyBinding from './mutatingAdmissionPolicyBinding';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('MutatingAdmissionPolicy resources', () => {
  it('uses served admissionregistration API versions from newest to oldest', () => {
    expect(MutatingAdmissionPolicy.apiVersion).toEqual([
      'admissionregistration.k8s.io/v1beta1',
      'admissionregistration.k8s.io/v1alpha1',
    ]);
    expect(MutatingAdmissionPolicyBinding.apiVersion).toEqual(MutatingAdmissionPolicy.apiVersion);
  });

  it('creates a usable base MutatingAdmissionPolicy object', () => {
    expect(MutatingAdmissionPolicy.getBaseObject()).toMatchObject({
      apiVersion: 'admissionregistration.k8s.io/v1beta1',
      kind: 'MutatingAdmissionPolicy',
      metadata: {
        name: '',
      },
      spec: {
        failurePolicy: 'Fail',
        matchConstraints: {
          resourceRules: [
            {
              apiGroups: [],
              apiVersions: [],
              operations: [],
              resources: [],
            },
          ],
        },
        mutations: [
          {
            patchType: 'ApplyConfiguration',
            applyConfiguration: {
              expression: '',
            },
          },
        ],
      },
    });
  });

  it('creates a usable base MutatingAdmissionPolicyBinding object', () => {
    expect(MutatingAdmissionPolicyBinding.getBaseObject()).toMatchObject({
      apiVersion: 'admissionregistration.k8s.io/v1beta1',
      kind: 'MutatingAdmissionPolicyBinding',
      metadata: {
        name: '',
      },
      spec: {
        policyName: '',
      },
    });
  });
});
