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

import { render } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';
import { NetworkPolicyDetails } from './Details';

const { mockTargetedPodsSection } = vi.hoisted(() => ({
  mockTargetedPodsSection: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// '../../lib/k8s' is a large barrel that re-exports every resource class; some
// component-level import of it triggers a pre-existing circular-init issue
// between deployment.ts/replicaSet.ts and KubeObject.ts (unrelated to this
// component) and crashes module loading outside of the full test run. Mock it
// with a real, equivalent labelSelectorToQuery so this file can render
// NetworkPolicyDetails without pulling in the barrel.
vi.mock('../../lib/k8s', () => ({
  labelSelectorToQuery: (selector: { matchLabels?: Record<string, string> } = {}) =>
    Object.entries(selector.matchLabels ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(','),
  matchExpressionSimplifier: () => [],
  matchLabelsSimplifier: () => [],
}));

// Same circular-init issue as above -- Details.tsx imports the NetworkPolicy
// class purely to pass it as DetailsGrid's resourceType, which our mocked
// DetailsGrid below never inspects, so a plain stub is enough.
vi.mock('../../lib/k8s/networkpolicy', () => ({ default: class NetworkPolicy {} }));

// DetailsGrid's own data fetching (resourceType.useGet) is out of scope here;
// drive its extraSections directly with a fake NetworkPolicy item, the same
// way workload/Details.test.tsx drives WorkloadDetails via extraSections.
// TargetedPodsSection is replaced with a spy so the labelSelector it actually
// receives (built from spec.podSelector) can be inspected -- an omitted or
// wrong selector, or a mishandled empty selector, would show up here.
let testItem: any;

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    const sections = typeof props.extraSections === 'function' ? props.extraSections(testItem) : [];
    return (
      <>
        {sections.map((s: any) => (
          <React.Fragment key={s.id}>{s.section}</React.Fragment>
        ))}
      </>
    );
  },
  TargetedPodsSection: (props: any) => {
    mockTargetedPodsSection(props);
    return null;
  },
  metadataStyles: {},
}));

function makeNetworkPolicy(podSelector: Record<string, any>) {
  return {
    kind: 'NetworkPolicy',
    cluster: 'test-cluster',
    metadata: { name: 'np1', namespace: 'default' },
    spec: { podSelector, ingress: [], egress: [] },
  };
}

describe('NetworkPolicyDetails targeted pods', () => {
  beforeEach(() => {
    mockTargetedPodsSection.mockReset();
  });

  it('builds a label query from a non-empty podSelector', () => {
    testItem = makeNetworkPolicy({ matchLabels: { app: 'foo' } });

    render(
      <TestContext>
        <NetworkPolicyDetails name="np1" namespace="default" />
      </TestContext>
    );

    expect(mockTargetedPodsSection).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'default', labelSelector: 'app=foo' })
    );
  });

  it('sends an unfiltered (empty) label query for an empty podSelector, so it lists all namespace pods', () => {
    testItem = makeNetworkPolicy({});

    render(
      <TestContext>
        <NetworkPolicyDetails name="np1" namespace="default" />
      </TestContext>
    );

    expect(mockTargetedPodsSection).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'default', labelSelector: '' })
    );
  });
});
