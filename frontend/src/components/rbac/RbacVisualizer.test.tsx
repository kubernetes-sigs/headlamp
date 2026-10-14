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

import '../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ClusterRole from '../../lib/k8s/clusterRole';
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import Role from '../../lib/k8s/role';
import RoleBinding from '../../lib/k8s/roleBinding';
import ServiceAccount from '../../lib/k8s/serviceAccount';
import { createMuiTheme } from '../../lib/themes';
import BindingNode from './nodes/BindingNode';
import RoleNode from './nodes/RoleNode';
import RuleNode from './nodes/RuleNode';
import RbacVisualizer from './RbacVisualizer';
import { buildRbacGraph, isSubjectMatch } from './useRbacGraphData';

// Mock ReactFlow since it requires DOM measurement
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ nodes, edges }: any) => (
      <div data-testid="mock-react-flow">
        <div data-testid="nodes-count">{nodes.length}</div>
        <div data-testid="edges-count">{edges.length}</div>
        {nodes.map((n: any) => (
          <div key={n.id} data-testid={`node-${n.id}`}>
            {n.data?.name || n.data?.subject?.name || n.id}
          </div>
        ))}
      </div>
    ),
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    Handle: () => <div data-testid="mock-handle" />,
    Controls: () => <div data-testid="mock-controls" />,
    Background: () => <div data-testid="mock-background" />,
  };
});

const theme = createMuiTheme({ name: 'light', base: 'light' });

function renderComponent() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <RbacVisualizer />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('RbacVisualizer logic', () => {
  it('correctly matches subjects with isSubjectMatch', () => {
    expect(
      isSubjectMatch(
        { kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' },
        { kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }
      )
    ).toBe(true);

    expect(
      isSubjectMatch(
        { kind: 'ServiceAccount', name: 'my-sa', namespace: 'kube-system' },
        { kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }
      )
    ).toBe(false);

    expect(isSubjectMatch({ kind: 'User', name: 'alice' }, { kind: 'User', name: 'alice' })).toBe(
      true
    );

    expect(isSubjectMatch({ kind: 'User', name: 'bob' }, { kind: 'User', name: 'alice' })).toBe(
      false
    );
  });

  it('matches ServiceAccount through canonical User and Group identities', () => {
    const targetSA = { kind: 'ServiceAccount' as const, name: 'deployer', namespace: 'production' };

    // Built-in groups
    expect(isSubjectMatch({ kind: 'Group', name: 'system:authenticated' }, targetSA)).toBe(true);
    expect(isSubjectMatch({ kind: 'Group', name: 'system:serviceaccounts' }, targetSA)).toBe(true);
    expect(
      isSubjectMatch({ kind: 'Group', name: 'system:serviceaccounts:production' }, targetSA)
    ).toBe(true);
    expect(
      isSubjectMatch({ kind: 'Group', name: 'system:serviceaccounts:staging' }, targetSA)
    ).toBe(false);

    // Canonical User format
    expect(
      isSubjectMatch({ kind: 'User', name: 'system:serviceaccount:production:deployer' }, targetSA)
    ).toBe(true);
    expect(
      isSubjectMatch({ kind: 'User', name: 'system:serviceaccount:staging:deployer' }, targetSA)
    ).toBe(false);
  });

  it('matches User through built-in authentication groups', () => {
    const user = { kind: 'User' as const, name: 'alice' };
    expect(isSubjectMatch({ kind: 'Group', name: 'system:authenticated' }, user)).toBe(true);
    expect(isSubjectMatch({ kind: 'Group', name: 'system:unauthenticated' }, user)).toBe(false);
    expect(isSubjectMatch({ kind: 'Group', name: 'some-custom-group' }, user)).toBe(false);

    const anon = { kind: 'User' as const, name: 'system:anonymous' };
    expect(isSubjectMatch({ kind: 'Group', name: 'system:unauthenticated' }, anon)).toBe(true);
    expect(isSubjectMatch({ kind: 'Group', name: 'system:authenticated' }, anon)).toBe(false);
  });

  it('correctly handles omitted namespace in RoleBinding subject falling back to binding namespace', () => {
    const targetSA = { kind: 'ServiceAccount' as const, name: 'deployer', namespace: 'production' };

    // Omitted subject namespace in RoleBinding matches when binding is in production
    expect(
      isSubjectMatch({ kind: 'ServiceAccount', name: 'deployer' }, targetSA, 'production')
    ).toBe(true);

    // Omitted subject namespace in RoleBinding does NOT match when binding is in staging
    expect(isSubjectMatch({ kind: 'ServiceAccount', name: 'deployer' }, targetSA, 'staging')).toBe(
      false
    );
  });

  it('prevents node ID collisions for distinct resources', () => {
    // Collision case 1: ClusterRoleBinding reader vs RoleBinding cluster/reader
    const crbReader: any = {
      metadata: { name: 'reader' },
      jsonData: {
        metadata: { name: 'reader' },
        roleRef: { kind: 'ClusterRole', name: 'view', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    const rbClusterReader: any = {
      metadata: { name: 'reader', namespace: 'cluster' },
      jsonData: {
        metadata: { name: 'reader', namespace: 'cluster' },
        roleRef: { kind: 'Role', name: 'view', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    // Collision case 2: RoleBinding team-a/reader vs RoleBinding team/a-reader
    const rbTeamAReader: any = {
      metadata: { name: 'reader', namespace: 'team-a' },
      jsonData: {
        metadata: { name: 'reader', namespace: 'team-a' },
        roleRef: { kind: 'Role', name: 'view', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    const rbTeamAReader2: any = {
      metadata: { name: 'a-reader', namespace: 'team' },
      jsonData: {
        metadata: { name: 'a-reader', namespace: 'team' },
        roleRef: { kind: 'Role', name: 'view', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    const mockRoleView: any = {
      metadata: { name: 'view', namespace: 'cluster' },
      jsonData: { metadata: { name: 'view', namespace: 'cluster' }, rules: [] },
    };

    const result = buildRbacGraph(
      { kind: 'User', name: 'alice' },
      [rbClusterReader, rbTeamAReader, rbTeamAReader2],
      [crbReader],
      [mockRoleView],
      []
    );

    const nodeIds = result.nodes.map(n => n.id);
    const uniqueIds = new Set(nodeIds);
    expect(uniqueIds.size).toBe(nodeIds.length);

    // Verify distinct IDs
    expect(nodeIds).toContain('binding:ClusterRoleBinding:_:reader');
    expect(nodeIds).toContain('binding:RoleBinding:cluster:reader');
    expect(nodeIds).toContain('binding:RoleBinding:team-a:reader');
    expect(nodeIds).toContain('binding:RoleBinding:team:a-reader');
  });

  it('buildRbacGraph generates DAG tiers for matching bindings and roles', () => {
    const mockRoleBinding: any = {
      metadata: { name: 'app-reader-binding', namespace: 'production' },
      jsonData: {
        metadata: { name: 'app-reader-binding', namespace: 'production' },
        roleRef: { kind: 'Role', name: 'app-reader', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'ServiceAccount', name: 'deployer', namespace: 'production' }],
      },
      subjects: [{ kind: 'ServiceAccount', name: 'deployer', namespace: 'production' }],
    };

    const mockRole: any = {
      metadata: { name: 'app-reader', namespace: 'production' },
      jsonData: {
        metadata: { name: 'app-reader', namespace: 'production' },
        rules: [
          {
            apiGroups: ['apps'],
            resources: ['deployments'],
            verbs: ['get', 'list'],
          },
        ],
      },
    };

    const { nodes, edges, stats } = buildRbacGraph(
      { kind: 'ServiceAccount', name: 'deployer', namespace: 'production' },
      [mockRoleBinding],
      [],
      [mockRole],
      []
    );

    expect(stats.bindingsCount).toBe(1);
    expect(stats.rolesCount).toBe(1);
    expect(stats.rulesCount).toBe(1);

    // Subject + Binding + Role + Rule = 4 nodes
    expect(nodes.length).toBe(4);
    // Subject->Binding, Binding->Role, Role->Rule = 3 edges
    expect(edges.length).toBe(3);

    expect(nodes.find(n => n.type === 'subjectNode')).toBeDefined();
    expect(nodes.find(n => n.type === 'bindingNode')).toBeDefined();
    expect(nodes.find(n => n.type === 'roleNode')).toBeDefined();
    expect(nodes.find(n => n.type === 'ruleNode')).toBeDefined();
  });

  it('resolves ServiceAccount grants through group-only bindings in buildRbacGraph', () => {
    const mockCRB: any = {
      metadata: { name: 'all-production-sa-binding' },
      jsonData: {
        metadata: { name: 'all-production-sa-binding' },
        roleRef: { kind: 'ClusterRole', name: 'viewer', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'Group', name: 'system:serviceaccounts:production' }],
      },
      subjects: [{ kind: 'Group', name: 'system:serviceaccounts:production' }],
    };

    const mockCR: any = {
      metadata: { name: 'viewer' },
      jsonData: {
        metadata: { name: 'viewer' },
        rules: [{ apiGroups: [''], resources: ['services'], verbs: ['get', 'list'] }],
      },
    };

    const { nodes, stats } = buildRbacGraph(
      { kind: 'ServiceAccount', name: 'worker', namespace: 'production' },
      [],
      [mockCRB],
      [],
      [mockCR]
    );

    expect(stats.bindingsCount).toBe(1);
    expect(stats.rolesCount).toBe(1);
    expect(stats.rulesCount).toBe(1);
    expect(nodes.some(n => n.id.includes('all-production-sa-binding'))).toBe(true);
  });

  it('filters RoleBindings by selected namespace while preserving matching cluster bindings', () => {
    const rbProd: any = {
      metadata: { name: 'rb-prod', namespace: 'production' },
      jsonData: {
        metadata: { name: 'rb-prod', namespace: 'production' },
        roleRef: { kind: 'Role', name: 'role-prod', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    const rbStaging: any = {
      metadata: { name: 'rb-staging', namespace: 'staging' },
      jsonData: {
        metadata: { name: 'rb-staging', namespace: 'staging' },
        roleRef: { kind: 'Role', name: 'role-staging', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    const crbGlobal: any = {
      metadata: { name: 'crb-global' },
      jsonData: {
        metadata: { name: 'crb-global' },
        roleRef: { kind: 'ClusterRole', name: 'cr-global', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'alice' }],
      },
      subjects: [{ kind: 'User', name: 'alice' }],
    };

    const { nodes } = buildRbacGraph(
      { kind: 'User', name: 'alice' },
      [rbProd, rbStaging],
      [crbGlobal],
      [],
      [],
      'production'
    );

    const bindingNodeIds = nodes.filter(n => n.type === 'bindingNode').map(n => n.id);
    expect(bindingNodeIds).toContain('binding:RoleBinding:production:rb-prod');
    expect(bindingNodeIds).toContain('binding:ClusterRoleBinding:_:crb-global');
    expect(bindingNodeIds).not.toContain('binding:RoleBinding:staging:rb-staging');
  });

  it('attaches cluster identity to node data when cluster is specified', () => {
    const rb: any = {
      metadata: { name: 'rb-test', namespace: 'default' },
      jsonData: {
        metadata: { name: 'rb-test', namespace: 'default' },
        roleRef: { kind: 'Role', name: 'role-test', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'bob' }],
      },
      subjects: [{ kind: 'User', name: 'bob' }],
    };

    const role: any = {
      metadata: { name: 'role-test', namespace: 'default' },
      jsonData: {
        metadata: { name: 'role-test', namespace: 'default' },
        rules: [],
      },
    };

    const { nodes } = buildRbacGraph(
      { kind: 'User', name: 'bob' },
      [rb],
      [],
      [role],
      [],
      undefined,
      'my-cluster'
    );

    const bindingNode = nodes.find(n => n.type === 'bindingNode');
    const roleNode = nodes.find(n => n.type === 'roleNode');

    expect(bindingNode?.data?.cluster).toBe('my-cluster');
    expect(roleNode?.data?.cluster).toBe('my-cluster');
  });

  it('vertically centers role node with its rules and guarantees non-overlapping rule spacing', () => {
    const rb: any = {
      metadata: { name: 'rb-multi', namespace: 'default' },
      jsonData: {
        metadata: { name: 'rb-multi', namespace: 'default' },
        roleRef: { kind: 'Role', name: 'role-multi', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'charlie' }],
      },
      subjects: [{ kind: 'User', name: 'charlie' }],
    };

    const role: any = {
      metadata: { name: 'role-multi', namespace: 'default' },
      jsonData: {
        metadata: { name: 'role-multi', namespace: 'default' },
        rules: [
          { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
          { apiGroups: ['apps'], resources: ['deployments'], verbs: ['get'] },
          { apiGroups: ['batch'], resources: ['jobs'], verbs: ['get'] },
        ],
      },
    };

    const { nodes } = buildRbacGraph({ kind: 'User', name: 'charlie' }, [rb], [], [role], []);

    const ruleNodes = nodes.filter(n => n.type === 'ruleNode');
    const roleNode = nodes.find(n => n.type === 'roleNode');

    expect(ruleNodes.length).toBe(3);
    // Spacing between rules must be >= 174 (150 card height + 24 gap)
    expect(ruleNodes[1].position.y - ruleNodes[0].position.y).toBeGreaterThanOrEqual(174);
    expect(ruleNodes[2].position.y - ruleNodes[1].position.y).toBeGreaterThanOrEqual(174);

    // Role node must be vertically centered relative to the rules span
    const rulesStartY = ruleNodes[0].position.y;
    const rulesEndY = ruleNodes[2].position.y + 150;
    const rulesCenterY = (rulesStartY + rulesEndY) / 2;
    const roleCenterY = roleNode!.position.y + 95 / 2;
    expect(Math.abs(roleCenterY - rulesCenterY)).toBeLessThanOrEqual(5);
  });

  it('advances rule layout cursor after empty roles and avoids overlapping with subsequent roles', () => {
    const rb1: any = {
      metadata: { name: 'rb-empty', namespace: 'default' },
      jsonData: {
        metadata: { name: 'rb-empty', namespace: 'default' },
        roleRef: { kind: 'Role', name: 'role-empty', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'dave' }],
      },
      subjects: [{ kind: 'User', name: 'dave' }],
    };

    const rb2: any = {
      metadata: { name: 'rb-populated', namespace: 'default' },
      jsonData: {
        metadata: { name: 'rb-populated', namespace: 'default' },
        roleRef: { kind: 'Role', name: 'role-populated', apiGroup: 'rbac.authorization.k8s.io' },
        subjects: [{ kind: 'User', name: 'dave' }],
      },
      subjects: [{ kind: 'User', name: 'dave' }],
    };

    const roleEmpty: any = {
      metadata: { name: 'role-empty', namespace: 'default' },
      jsonData: {
        metadata: { name: 'role-empty', namespace: 'default' },
        rules: [],
      },
    };

    const rolePopulated: any = {
      metadata: { name: 'role-populated', namespace: 'default' },
      jsonData: {
        metadata: { name: 'role-populated', namespace: 'default' },
        rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get'] }],
      },
    };

    const { nodes } = buildRbacGraph(
      { kind: 'User', name: 'dave' },
      [rb1, rb2],
      [],
      [roleEmpty, rolePopulated],
      []
    );

    const roleNodes = nodes.filter(n => n.type === 'roleNode');
    const ruleNodes = nodes.filter(n => n.type === 'ruleNode');

    expect(roleNodes.length).toBe(2);
    expect(ruleNodes.length).toBe(1);

    const emptyRoleNode = roleNodes.find(n => n.data.name === 'role-empty');
    const populatedRoleNode = roleNodes.find(n => n.data.name === 'role-populated');
    const ruleNode = ruleNodes[0];

    // Populated role node and its rule must start below the empty role node
    const emptyRoleBottom = emptyRoleNode!.position.y + 95;
    expect(populatedRoleNode!.position.y).toBeGreaterThanOrEqual(emptyRoleBottom);
    expect(ruleNode.position.y).toBeGreaterThanOrEqual(emptyRoleBottom);
  });
});

describe('Custom Node Components', () => {
  it('renders RuleNode with nowheel class on scrollable container', () => {
    const { container } = render(
      <RuleNode
        data={{
          ruleIndex: 0,
          apiGroups: ['apps'],
          resources: ['deployments'],
          verbs: ['get', 'list'],
          roleName: 'app-reader',
        }}
      />
    );
    expect(container.querySelector('.nowheel')).toBeTruthy();
  });
  it('BindingNode and RoleNode render safely with colons in name without throwing', () => {
    const { container: bindingContainer } = render(
      <MemoryRouter>
        <BindingNode
          data={{
            binding: {} as any,
            isClusterRoleBinding: true,
            name: 'system:discovery',
            roleRefName: 'system:discovery',
            roleRefKind: 'ClusterRole',
            cluster: 'test-cluster',
          }}
        />
      </MemoryRouter>
    );
    expect(bindingContainer.textContent).toContain('system:discovery');

    const { container: roleContainer } = render(
      <MemoryRouter>
        <RoleNode
          data={{
            isClusterRole: true,
            name: 'system:discovery',
            rulesCount: 3,
            cluster: 'test-cluster',
          }}
        />
      </MemoryRouter>
    );
    expect(roleContainer.textContent).toContain('system:discovery');
  });
});

describe('RbacVisualizer component', () => {
  it('renders initial empty state prompts when no subject is selected', () => {
    vi.spyOn(ServiceAccount, 'useList').mockReturnValue({
      items: [
        {
          metadata: { name: 'default', namespace: 'default' },
        } as any,
      ],
      errors: null,
    } as any);
    vi.spyOn(RoleBinding, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(ClusterRoleBinding, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(Role, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(ClusterRole, 'useList').mockReturnValue({ items: [], errors: null } as any);

    renderComponent();

    expect(screen.getByText('RBAC Dependency Visualizer')).toBeInTheDocument();
    expect(screen.getByText('Select a Subject to Visualize Permissions')).toBeInTheDocument();
    expect(screen.getByText('default (default)')).toBeInTheDocument();
  });

  it('displays empty state message when a selected subject has no bindings', () => {
    vi.spyOn(ServiceAccount, 'useList').mockReturnValue({
      items: [
        {
          metadata: { name: 'isolated-sa', namespace: 'test-ns' },
        } as any,
      ],
      errors: null,
    } as any);
    vi.spyOn(RoleBinding, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(ClusterRoleBinding, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(Role, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(ClusterRole, 'useList').mockReturnValue({ items: [], errors: null } as any);

    renderComponent();

    // Click quick-select chip
    fireEvent.click(screen.getByText('isolated-sa (test-ns)'));

    expect(screen.getByText('No RoleBindings Found')).toBeInTheDocument();
  });

  it('renders graph with nodes when matching role bindings exist', () => {
    const mockSA = {
      metadata: { name: 'admin-sa', namespace: 'kube-system' },
    } as any;

    const mockCRB = {
      metadata: { name: 'cluster-admin-binding' },
      jsonData: {
        metadata: { name: 'cluster-admin-binding' },
        roleRef: {
          kind: 'ClusterRole',
          name: 'cluster-admin',
          apiGroup: 'rbac.authorization.k8s.io',
        },
        subjects: [{ kind: 'ServiceAccount', name: 'admin-sa', namespace: 'kube-system' }],
      },
      subjects: [{ kind: 'ServiceAccount', name: 'admin-sa', namespace: 'kube-system' }],
    } as any;

    const mockCR = {
      metadata: { name: 'cluster-admin' },
      jsonData: {
        metadata: { name: 'cluster-admin' },
        rules: [
          {
            apiGroups: ['*'],
            resources: ['*'],
            verbs: ['*'],
          },
        ],
      },
    } as any;

    vi.spyOn(ServiceAccount, 'useList').mockReturnValue({ items: [mockSA], errors: null } as any);
    vi.spyOn(RoleBinding, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(ClusterRoleBinding, 'useList').mockReturnValue({
      items: [mockCRB],
      errors: null,
    } as any);
    vi.spyOn(Role, 'useList').mockReturnValue({ items: [], errors: null } as any);
    vi.spyOn(ClusterRole, 'useList').mockReturnValue({ items: [mockCR], errors: null } as any);

    renderComponent();

    fireEvent.click(screen.getByText('admin-sa (kube-system)'));

    expect(screen.getByTestId('mock-react-flow')).toBeInTheDocument();
    expect(screen.getByText('1 Bindings')).toBeInTheDocument();
    expect(screen.getByText('1 Roles')).toBeInTheDocument();
    expect(screen.getByText('1 Rules')).toBeInTheDocument();
  });
});
