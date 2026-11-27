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

import { Edge, MarkerType, Node } from '@xyflow/react';
import { useMemo } from 'react';
import { useCluster } from '../../lib/k8s';
import ClusterRole from '../../lib/k8s/clusterRole';
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import Role, { KubeRole } from '../../lib/k8s/role';
import RoleBinding, { KubeRoleBinding } from '../../lib/k8s/roleBinding';
import ServiceAccount from '../../lib/k8s/serviceAccount';
import {
  BindingNodeData,
  RbacSubject,
  RbacSubjectKind,
  RoleNodeData,
  RuleNodeData,
  SubjectNodeData,
} from './types';

export function normalizeRbacSubject(target: RbacSubject): RbacSubject {
  if (target.kind === 'User' && target.name.startsWith('system:serviceaccount:')) {
    const rest = target.name.slice('system:serviceaccount:'.length);
    const separatorIndex = rest.indexOf(':');
    if (separatorIndex > 0 && separatorIndex < rest.length - 1) {
      return {
        kind: 'ServiceAccount',
        namespace: rest.slice(0, separatorIndex),
        name: rest.slice(separatorIndex + 1),
      };
    }
  }
  return target;
}

export function isSubjectMatch(
  s: { kind: string; name: string; namespace?: string },
  target: RbacSubject,
  bindingNamespace?: string
): boolean {
  const normalizedTarget = normalizeRbacSubject(target);

  if (normalizedTarget.kind === 'User' && s.kind === 'Group') {
    const authenticationGroup =
      normalizedTarget.name === 'system:anonymous'
        ? 'system:unauthenticated'
        : 'system:authenticated';
    return s.name === authenticationGroup;
  }

  if (normalizedTarget.kind === 'ServiceAccount' && normalizedTarget.namespace) {
    if (s.kind === 'Group') {
      return [
        'system:authenticated',
        'system:serviceaccounts',
        `system:serviceaccounts:${normalizedTarget.namespace}`,
      ].includes(s.name);
    }
    if (s.kind === 'User') {
      return (
        s.name === `system:serviceaccount:${normalizedTarget.namespace}:${normalizedTarget.name}`
      );
    }
  }

  if (s.kind !== normalizedTarget.kind || s.name !== normalizedTarget.name) {
    return false;
  }

  if (normalizedTarget.kind === 'ServiceAccount') {
    const effectiveNamespace = s.namespace || bindingNamespace;
    if (normalizedTarget.namespace || effectiveNamespace) {
      return effectiveNamespace === normalizedTarget.namespace;
    }
  }

  return true;
}

export function buildRbacGraph(
  subject: RbacSubject | null,
  roleBindings: RoleBinding[] | null,
  clusterRoleBindings: ClusterRoleBinding[] | null,
  roles: Role[] | null,
  clusterRoles: ClusterRole[] | null,
  namespaceFilter?: string,
  cluster?: string | null
): {
  nodes: Node[];
  edges: Edge[];
  stats: { bindingsCount: number; rolesCount: number; rulesCount: number };
} {
  if (!subject) {
    return { nodes: [], edges: [], stats: { bindingsCount: 0, rolesCount: 0, rulesCount: 0 } };
  }

  // 1. Filter bindings that reference this subject
  const matchingRoleBindings = (roleBindings || []).filter(rb => {
    if (namespaceFilter && rb.metadata.namespace !== namespaceFilter) {
      return false;
    }
    return rb.subjects?.some(s => isSubjectMatch(s, subject, rb.metadata.namespace));
  });

  const matchingClusterRoleBindings = (clusterRoleBindings || []).filter(crb => {
    return crb.subjects?.some(s => isSubjectMatch(s, subject));
  });

  const allMatchingBindings: Array<{ binding: KubeRoleBinding; isCluster: boolean }> = [
    ...matchingRoleBindings.map(b => ({ binding: b.jsonData, isCluster: false })),
    ...matchingClusterRoleBindings.map(b => ({ binding: b.jsonData, isCluster: true })),
  ];

  // Map to index roles quickly
  const rolesByNsAndName = new Map<string, KubeRole>();
  (roles || []).forEach(r => {
    rolesByNsAndName.set(`${r.metadata.namespace}/${r.metadata.name}`, r.jsonData);
  });

  const clusterRolesByName = new Map<string, KubeRole>();
  (clusterRoles || []).forEach(cr => {
    clusterRolesByName.set(cr.metadata.name, cr.jsonData);
  });

  // Calculate layout tiers
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const subjectNodeId = `subject:${subject.kind}:${subject.namespace || '_'}:${subject.name}`;

  // Collect unique roles referenced
  const resolvedRolesMap = new Map<
    string,
    {
      roleKey: string;
      roleName: string;
      roleKind: string;
      namespace?: string;
      roleObj?: KubeRole;
      isClusterRole: boolean;
      bindingNodeIds: string[];
    }
  >();

  allMatchingBindings.forEach(item => {
    const b = item.binding;
    const ref = b.roleRef;
    const isClusterRole = ref.kind === 'ClusterRole';
    const roleKey = isClusterRole
      ? `clusterrole:${ref.name}`
      : `role:${b.metadata.namespace}:${ref.name}`;

    const roleObj = isClusterRole
      ? clusterRolesByName.get(ref.name)
      : rolesByNsAndName.get(`${b.metadata.namespace}/${ref.name}`);

    const bindingNodeId = `binding:${item.isCluster ? 'ClusterRoleBinding' : 'RoleBinding'}:${
      b.metadata.namespace || '_'
    }:${b.metadata.name}`;

    if (!resolvedRolesMap.has(roleKey)) {
      resolvedRolesMap.set(roleKey, {
        roleKey,
        roleName: ref.name,
        roleKind: ref.kind,
        namespace: isClusterRole ? undefined : b.metadata.namespace,
        roleObj,
        isClusterRole,
        bindingNodeIds: [bindingNodeId],
      });
    } else {
      resolvedRolesMap.get(roleKey)!.bindingNodeIds.push(bindingNodeId);
    }
  });

  // Positions and spacing
  const colX = {
    subject: 50,
    binding: 400,
    role: 750,
    rule: 1100,
  };

  const itemHeight = {
    binding: 95,
    role: 95,
    rule: 150,
  };

  const gapY = 24;

  // Lay out bindings
  let currentBindingY = 50;
  allMatchingBindings.forEach(item => {
    const b = item.binding;
    const bindingNodeId = `binding:${item.isCluster ? 'ClusterRoleBinding' : 'RoleBinding'}:${
      b.metadata.namespace || '_'
    }:${b.metadata.name}`;

    nodes.push({
      id: bindingNodeId,
      type: 'bindingNode',
      position: { x: colX.binding, y: currentBindingY },
      data: {
        binding: b,
        isClusterRoleBinding: item.isCluster,
        name: b.metadata.name,
        namespace: b.metadata.namespace,
        roleRefName: b.roleRef.name,
        roleRefKind: b.roleRef.kind,
        cluster,
      } as BindingNodeData,
    });

    edges.push({
      id: `edge-${subjectNodeId}-${bindingNodeId}`,
      source: subjectNodeId,
      target: bindingNodeId,
      type: 'smoothstep',
      animated: true,
      style: { stroke: item.isCluster ? '#9c27b0' : '#0288d1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: item.isCluster ? '#9c27b0' : '#0288d1' },
    });

    currentBindingY += itemHeight.binding + gapY;
  });

  // Lay out roles and rules
  let currentRoleY = 50;
  let currentRuleY = 50;
  let totalRulesCount = 0;

  resolvedRolesMap.forEach(rInfo => {
    const roleNodeId = `role:${rInfo.isClusterRole ? 'ClusterRole' : 'Role'}:${
      rInfo.namespace || '_'
    }:${rInfo.roleName}`;
    const hasClusterBinding = allMatchingBindings.some(
      ({ binding, isCluster }) =>
        isCluster &&
        rInfo.isClusterRole &&
        binding.roleRef.kind === 'ClusterRole' &&
        binding.roleRef.name === rInfo.roleName
    );
    const rules = (rInfo.roleObj?.rules || []).filter(
      rule => !rule.nonResourceURLs?.length || hasClusterBinding
    );
    totalRulesCount += rules.length;

    const rulesCount = rules.length;
    const rulesSpanHeight =
      rulesCount > 0 ? rulesCount * itemHeight.rule + (rulesCount - 1) * gapY : itemHeight.role;

    const roleY =
      rulesCount > 0
        ? currentRuleY + Math.max(0, (rulesSpanHeight - itemHeight.role) / 2)
        : Math.max(currentRoleY, currentRuleY);

    nodes.push({
      id: roleNodeId,
      type: 'roleNode',
      position: { x: colX.role, y: roleY },
      data: {
        role: rInfo.roleObj,
        name: rInfo.roleName,
        namespace: rInfo.namespace,
        isClusterRole: rInfo.isClusterRole,
        rulesCount: rules.length,
        cluster,
      } as RoleNodeData,
    });

    // Edges from each binding that references this role
    rInfo.bindingNodeIds.forEach(bindingId => {
      edges.push({
        id: `edge-${bindingId}-${roleNodeId}`,
        source: bindingId,
        target: roleNodeId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: rInfo.isClusterRole ? '#ed6c02' : '#2e7d32', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: rInfo.isClusterRole ? '#ed6c02' : '#2e7d32',
        },
      });
    });

    // Rules for this role
    rules.forEach((rule, idx) => {
      const ruleNodeId = `rule:${roleNodeId}:idx:${idx}`;
      nodes.push({
        id: ruleNodeId,
        type: 'ruleNode',
        position: { x: colX.rule, y: currentRuleY },
        data: {
          ruleIndex: idx,
          apiGroups: rule.apiGroups || [],
          resources: rule.resources || [],
          verbs: rule.verbs || [],
          resourceNames: rule.resourceNames,
          nonResourceURLs: rule.nonResourceURLs,
          roleName: rInfo.roleName,
        } as RuleNodeData,
      });

      edges.push({
        id: `edge-${roleNodeId}-${ruleNodeId}`,
        source: roleNodeId,
        target: ruleNodeId,
        type: 'smoothstep',
        style: { stroke: '#757575', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#757575' },
      });

      currentRuleY += itemHeight.rule + gapY;
    });

    currentRoleY = Math.max(roleY + itemHeight.role + gapY, currentRuleY);
    currentRuleY = currentRoleY;
  });

  // Calculate subject Y center
  const totalMaxY = Math.max(currentBindingY, currentRoleY, currentRuleY, 200);
  const subjectY = Math.max(50, totalMaxY / 2 - 40);

  nodes.unshift({
    id: subjectNodeId,
    type: 'subjectNode',
    position: { x: colX.subject, y: subjectY },
    data: {
      subject,
    } as SubjectNodeData,
  });

  return {
    nodes,
    edges,
    stats: {
      bindingsCount: allMatchingBindings.length,
      rolesCount: resolvedRolesMap.size,
      rulesCount: totalRulesCount,
    },
  };
}

function isListLoading(listResult: {
  items: unknown[] | null;
  isLoading?: boolean;
  clusterResults?: Record<string, { isLoading?: boolean; status?: string }>;
}): boolean {
  if (listResult.items === null || Boolean(listResult.isLoading)) {
    return true;
  }
  return Object.values(listResult.clusterResults ?? {}).some(
    res => Boolean(res?.isLoading) || res?.status === 'pending'
  );
}

export function useRbacGraphData(selectedSubject: RbacSubject | null, selectedNamespace?: string) {
  const cluster = useCluster();
  const listOptions = useMemo(() => (cluster ? { clusters: [cluster] } : undefined), [cluster]);

  const serviceAccountsResult = ServiceAccount.useList(listOptions);
  const roleBindingsResult = RoleBinding.useList(listOptions);
  const clusterRoleBindingsResult = ClusterRoleBinding.useList(listOptions);
  const rolesResult = Role.useList(listOptions);
  const clusterRolesResult = ClusterRole.useList(listOptions);

  const { items: serviceAccounts, errors: saErrors } = serviceAccountsResult;
  const { items: roleBindings, errors: rbErrors } = roleBindingsResult;
  const { items: clusterRoleBindings, errors: crbErrors } = clusterRoleBindingsResult;
  const { items: roles, errors: roleErrors } = rolesResult;
  const { items: clusterRoles, errors: crErrors } = clusterRolesResult;

  const isLoading =
    isListLoading(serviceAccountsResult) ||
    isListLoading(roleBindingsResult) ||
    isListLoading(clusterRoleBindingsResult) ||
    isListLoading(rolesResult) ||
    isListLoading(clusterRolesResult);

  const errors = useMemo(() => {
    return [
      ...(saErrors || []),
      ...(rbErrors || []),
      ...(crbErrors || []),
      ...(roleErrors || []),
      ...(crErrors || []),
    ];
  }, [saErrors, rbErrors, crbErrors, roleErrors, crErrors]);

  // Derive filter options for namespaces strictly from RoleBinding metadata namespaces
  const availableNamespaces = useMemo(() => {
    const nsSet = new Set<string>();
    (roleBindings || []).forEach(rb => {
      if (rb.metadata.namespace) {
        nsSet.add(rb.metadata.namespace);
      }
    });
    return Array.from(nsSet).sort();
  }, [roleBindings]);

  // Derive all available unique subjects
  const allSubjects = useMemo(() => {
    const subjectsMap = new Map<string, RbacSubject>();

    // 1. From ServiceAccounts
    (serviceAccounts || []).forEach(sa => {
      const key = `ServiceAccount:${sa.metadata.namespace}:${sa.metadata.name}`;
      subjectsMap.set(key, {
        kind: 'ServiceAccount',
        name: sa.metadata.name,
        namespace: sa.metadata.namespace,
      });
    });

    // 2. From RoleBindings & ClusterRoleBindings subjects
    const scanBindings = (
      bindings: Array<RoleBinding | ClusterRoleBinding> | null,
      isCluster: boolean = false
    ) => {
      (bindings || []).forEach(b => {
        (b.subjects || []).forEach(s => {
          const kind = (s.kind || 'User') as RbacSubjectKind;
          const ns =
            kind === 'ServiceAccount'
              ? s.namespace || (!isCluster ? b.metadata.namespace : undefined)
              : s.namespace;
          const key = `${kind}:${ns || ''}:${s.name}`;
          if (!subjectsMap.has(key)) {
            subjectsMap.set(key, {
              kind,
              name: s.name,
              namespace: ns,
              apiGroup: s.apiGroup,
            });
          }
        });
      });
    };

    scanBindings(roleBindings, false);
    scanBindings(clusterRoleBindings, true);

    return Array.from(subjectsMap.values()).sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind.localeCompare(b.kind);
      }
      return a.name.localeCompare(b.name);
    });
  }, [serviceAccounts, roleBindings, clusterRoleBindings]);

  // Build the graph
  const { nodes, edges, stats } = useMemo(() => {
    return buildRbacGraph(
      selectedSubject,
      roleBindings,
      clusterRoleBindings,
      roles,
      clusterRoles,
      selectedNamespace,
      cluster
    );
  }, [
    selectedSubject,
    roleBindings,
    clusterRoleBindings,
    roles,
    clusterRoles,
    selectedNamespace,
    cluster,
  ]);

  return {
    allSubjects,
    availableNamespaces,
    nodes,
    edges,
    stats,
    isLoading,
    errors,
  };
}

export default useRbacGraphData;
