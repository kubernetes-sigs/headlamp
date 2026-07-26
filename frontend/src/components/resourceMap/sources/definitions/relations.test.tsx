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

import { renderHook } from '@testing-library/react';
import App from '../../../../App';
import ConfigMap from '../../../../lib/k8s/configMap';
import CRD from '../../../../lib/k8s/crd';
import { KubeObject, KubeObjectClass } from '../../../../lib/k8s/KubeObject';
import Pod from '../../../../lib/k8s/pod';
import Secret from '../../../../lib/k8s/secret';
import Service from '../../../../lib/k8s/service';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphNode, Relation } from '../../graph/graphModel';
import { makeKubeSourceId } from './graphDefinitionUtils';
import { matchesLabels, useGetAllRelations } from './relations';

vi.mock('../../../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../redux/filterSlice')>()),
  useNamespaces: vi.fn(),
}));

// Initialize the complete Kubernetes class registry before loading relation definitions.
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const node = (kubeObject: KubeObject): GraphNode => ({
  id: kubeObject.metadata.uid,
  kubeObject,
});

const relationFor = (relations: Relation[], from: KubeObjectClass, to?: KubeObjectClass) => {
  const fromSource = makeKubeSourceId(from);
  const toSource = to ? makeKubeSourceId(to) : undefined;
  return relations.find(
    relation => relation.fromSource === fromSource && relation.toSource === toSource
  )!;
};

const pod = (
  metadata: Record<string, any>,
  spec: Record<string, any> = {},
  cluster = 'cluster-a'
) =>
  new Pod(
    {
      metadata,
      spec: { containers: [], nodeName: '', ...spec },
      status: {},
    } as any,
    cluster
  );

const service = (
  metadata: Record<string, any>,
  selector: Record<string, string>,
  cluster = 'cluster-a'
) => new Service({ metadata, spec: { selector, ports: [] }, status: {} } as any, cluster);

describe('matchesLabels', () => {
  it('matches every requested label and rejects missing or different labels', () => {
    const item = pod({ uid: 'pod', labels: { app: 'web', tier: 'frontend' } });

    expect(matchesLabels({ app: 'web' }, item)).toBe(true);
    expect(matchesLabels({ app: 'web', tier: 'frontend' }, item)).toBe(true);
    expect(matchesLabels({ app: 'api' }, item)).toBe(false);
    expect(matchesLabels({ missing: 'value' }, item)).toBe(false);
    expect(matchesLabels({ app: 'web' }, pod({ uid: 'unlabelled' }))).toBeFalsy();
    expect(matchesLabels(undefined as any, item)).toBeFalsy();
  });
});

describe('useGetAllRelations', () => {
  beforeEach(() => {
    vi.mocked(useNamespaces).mockReturnValue(['namespace-a']);
  });

  afterEach(() => vi.restoreAllMocks());

  it('gates selector relations by cluster and namespace', () => {
    vi.spyOn(CRD, 'useList').mockReturnValue({ items: null } as ReturnType<typeof CRD.useList>);
    const { result } = renderHook(() => useGetAllRelations());
    const relation = relationFor(result.current, Service, Pod);
    const matchingService = service(
      { uid: 'service', name: 'service', namespace: 'namespace-a' },
      { app: 'web' }
    );
    const matchingPod = pod({
      uid: 'pod',
      name: 'pod',
      namespace: 'namespace-a',
      labels: { app: 'web' },
    });

    expect(relation.predicate(node(matchingService), node(matchingPod))).toBe(true);
    expect(
      relation.predicate(
        node(matchingService),
        node(pod({ ...matchingPod.metadata, namespace: 'namespace-b' }))
      )
    ).toBe(false);
    expect(
      relation.predicate(
        node(matchingService),
        node(pod({ ...matchingPod.metadata }, {}, 'cluster-b'))
      )
    ).toBe(false);
    expect(
      relation.predicate(
        node(matchingService),
        node(pod({ ...matchingPod.metadata, labels: { app: 'api' } }))
      )
    ).toBe(false);
    expect(
      relation.predicate(
        node(service({ uid: 'cluster-service', name: 'service' }, { app: 'web' })),
        node(pod({ uid: 'cluster-pod', name: 'pod', labels: { app: 'web' } }))
      )
    ).toBe(true);
  });

  it('exercises volume, environment, and projected-secret predicates', () => {
    vi.spyOn(CRD, 'useList').mockReturnValue({
      items: [],
    } as unknown as ReturnType<typeof CRD.useList>);
    const { result } = renderHook(() => useGetAllRelations());
    const configMapRelation = relationFor(result.current, Pod, ConfigMap);
    const secretRelation = relationFor(result.current, Pod, Secret);
    const configMap = new ConfigMap(
      { metadata: { uid: 'config', name: 'settings', namespace: 'namespace-a' } } as any,
      'cluster-a'
    );
    const secret = new Secret(
      { metadata: { uid: 'secret', name: 'credentials', namespace: 'namespace-a' } } as any,
      'cluster-a'
    );

    expect(
      configMapRelation.predicate(
        node(
          pod(
            { uid: 'pod-config', namespace: 'namespace-a' },
            { volumes: [{ name: 'config', configMap: { name: 'settings' } }] }
          )
        ),
        node(configMap)
      )
    ).toBe(true);
    expect(
      secretRelation.predicate(
        node(
          pod(
            { uid: 'pod-env', namespace: 'namespace-a' },
            {
              containers: [
                {
                  env: [{ valueFrom: { secretKeyRef: { name: 'credentials' } } }],
                },
              ],
            }
          )
        ),
        node(secret)
      )
    ).toBe(true);
    expect(
      secretRelation.predicate(
        node(
          pod(
            { uid: 'pod-projected', namespace: 'namespace-a' },
            {
              volumes: [
                {
                  name: 'projected',
                  projected: { sources: [{ secret: { name: 'credentials' } }] },
                },
              ],
            }
          )
        ),
        node(secret)
      )
    ).toBe(true);
    expect(
      secretRelation.predicate(
        node(pod({ uid: 'pod-empty', namespace: 'namespace-a' })),
        node(secret)
      )
    ).toBe(false);
  });

  it('matches and rejects Kubernetes owner references', () => {
    vi.spyOn(CRD, 'useList').mockReturnValue({ items: null } as ReturnType<typeof CRD.useList>);
    const { result } = renderHook(() => useGetAllRelations());
    const relation = relationFor(result.current, Pod);
    const owner = new KubeObject({ metadata: { uid: 'owner' } } as any, 'cluster-a');

    expect(
      relation.predicate(
        node(pod({ uid: 'child', ownerReferences: [{ uid: 'owner' }] })),
        node(owner)
      )
    ).toBe(true);
    expect(relation.predicate(node(pod({ uid: 'orphan' })), node(owner))).toBe(false);
  });

  it('adds reversed owner relations for discovered custom resources', () => {
    let crds: CRD[] | null = null;
    class CustomResource extends KubeObject {
      static kind = 'Widget';
      static apiName = 'widgets';
      static apiVersion = 'example.io/v1';
      static isNamespaced = true;
    }
    const customResourceDefinition = {
      makeCRClass: () => CustomResource,
    } as unknown as CRD;
    vi.spyOn(CRD, 'useList').mockImplementation(
      () => ({ items: crds } as ReturnType<typeof CRD.useList>)
    );
    const { result, rerender } = renderHook(() => useGetAllRelations());

    expect(result.current.some(relation => relation.fromSource === 'example.io/Widget')).toBe(
      false
    );

    crds = [customResourceDefinition];
    rerender();

    const relation = result.current.find(relation => relation.fromSource === 'example.io/Widget')!;
    const customResource = new CustomResource({ metadata: { uid: 'widget' } } as any, 'cluster-a');
    const child = new KubeObject(
      { metadata: { uid: 'child', ownerReferences: [{ uid: 'widget' }] } } as any,
      'cluster-a'
    );

    expect(relation.predicate(node(customResource), node(child))).toBe(true);
    expect(
      relation.predicate(
        node(customResource),
        node(new KubeObject({ metadata: { uid: 'other' } } as any, 'cluster-a'))
      )
    ).toBe(false);
  });
});
