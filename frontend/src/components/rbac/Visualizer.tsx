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

import '@xyflow/react/dist/style.css';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import { Background, Controls, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ClusterRole from '../../../lib/k8s/clusterRole';
import ClusterRoleBinding from '../../../lib/k8s/clusterRoleBinding';
import Role from '../../../lib/k8s/role';
import RoleBinding from '../../../lib/k8s/roleBinding';
import ServiceAccount from '../../../lib/k8s/serviceAccount';
import { SectionBox } from '../../common/SectionBox';

export default function RBACVisualizer() {
  const { t } = useTranslation('glossary');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const { items: serviceAccounts } = ServiceAccount.useList();
  const { items: roleBindings } = RoleBinding.useList();
  const { items: clusterRoleBindings } = ClusterRoleBinding.useList();
  const { items: roles } = Role.useList();
  const { items: clusterRoles } = ClusterRole.useList();

  const [selectedSubject, setSelectedSubject] = useState<string>('');

  useEffect(() => {
    if (!selectedSubject) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newNodes: any[] = [];
    const newEdges: any[] = [];

    // 1. Add Subject Node
    const subjectId = `subject-${selectedSubject}`;
    newNodes.push({
      id: subjectId,
      position: { x: 50, y: 150 },
      data: { label: `Subject: ${selectedSubject}` },
      style: {
        background: '#e0f7fa',
        border: '1px solid #006064',
        borderRadius: '4px',
        padding: '10px',
      },
    });

    let yOffset = 50;

    // 2. Find Bindings for this Subject
    const allBindings = [...(roleBindings || []), ...(clusterRoleBindings || [])];
    const matchingBindings = allBindings.filter(b =>
      b.subjects?.some(s => `${s.kind}:${s.name}` === selectedSubject)
    );

    matchingBindings.forEach((binding, idx) => {
      const bindingId = `binding-${binding.metadata.uid}`;
      newNodes.push({
        id: bindingId,
        position: { x: 300, y: yOffset },
        data: { label: `Binding: ${binding.metadata.name}` },
        style: {
          background: '#fff3e0',
          border: '1px solid #e65100',
          borderRadius: '4px',
          padding: '10px',
        },
      });

      newEdges.push({
        id: `e-${subjectId}-${bindingId}`,
        source: subjectId,
        target: bindingId,
        animated: true,
      });

      // 3. Add Role Node
      const roleRef = binding.roleRef;
      const roleId = `role-${roleRef.name}-${idx}`; // using idx to ensure uniqueness if same role used multiple times in visualizer
      newNodes.push({
        id: roleId,
        position: { x: 550, y: yOffset },
        data: { label: `${roleRef.kind}: ${roleRef.name}` },
        style: {
          background: '#fce4ec',
          border: '1px solid #880e4f',
          borderRadius: '4px',
          padding: '10px',
        },
      });

      newEdges.push({
        id: `e-${bindingId}-${roleId}`,
        source: bindingId,
        target: roleId,
      });

      // 4. Find the actual Role to get its rules
      const allRoles = [...(roles || []), ...(clusterRoles || [])];
      const actualRole = allRoles.find(
        r => r.metadata.name === roleRef.name && r.kind === roleRef.kind
      );

      if (actualRole && actualRole.rules) {
        actualRole.rules.forEach((rule: any, ruleIdx: number) => {
          const ruleId = `rule-${roleId}-${ruleIdx}`;
          const resources = rule.resources ? rule.resources.join(', ') : '';
          const verbs = rule.verbs ? rule.verbs.join(', ') : '';

          newNodes.push({
            id: ruleId,
            position: { x: 800, y: yOffset + ruleIdx * 60 },
            data: { label: `${resources}\n[${verbs}]` },
            style: {
              background: '#f1f8e9',
              border: '1px solid #33691e',
              borderRadius: '4px',
              padding: '5px',
              fontSize: '10px',
            },
          });

          newEdges.push({
            id: `e-${roleId}-${ruleId}`,
            source: roleId,
            target: ruleId,
          });
        });

        // Adjust yOffset to accommodate multiple rules
        yOffset += Math.max(100, actualRole.rules.length * 60);
      } else {
        yOffset += 100;
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [selectedSubject, roleBindings, clusterRoleBindings, roles, clusterRoles, setNodes, setEdges]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('RBAC Visualizer')}
      </Typography>
      <SectionBox title={t('Select Subject')}>
        <Select
          value={selectedSubject}
          onChange={e => setSelectedSubject(e.target.value as string)}
          displayEmpty
          fullWidth
        >
          <MenuItem value="" disabled>
            {t('Select a ServiceAccount')}
          </MenuItem>
          {serviceAccounts?.map(sa => (
            <MenuItem key={sa.metadata.uid} value={`ServiceAccount:${sa.metadata.name}`}>
              {sa.metadata.namespace} / {sa.metadata.name}
            </MenuItem>
          ))}
        </Select>
      </SectionBox>

      <Box mt={4} height="600px" style={{ border: '1px solid #ddd' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Controls />
          <Background gap={12} size={1} />
        </ReactFlow>
      </Box>
    </Box>
  );
}
