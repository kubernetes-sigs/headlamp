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

import '@xyflow/react/dist/base.css';
import { Icon } from '@iconify/react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  Background,
  BackgroundVariant,
  Controls,
  NodeTypes,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Loader from '../common/Loader';
import SectionHeader from '../common/SectionHeader';
import BindingNode from './nodes/BindingNode';
import RoleNode from './nodes/RoleNode';
import RuleNode from './nodes/RuleNode';
import SubjectNode from './nodes/SubjectNode';
import { RbacSubject } from './types';
import useRbacGraphData from './useRbacGraphData';

const nodeTypes: NodeTypes = {
  subjectNode: SubjectNode,
  bindingNode: BindingNode,
  roleNode: RoleNode,
  ruleNode: RuleNode,
};

export function RbacVisualizer() {
  const { t } = useTranslation();
  const theme = useTheme();

  const [selectedSubject, setSelectedSubject] = useState<RbacSubject | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');

  const { allSubjects, availableNamespaces, nodes, edges, stats, isLoading, errors } =
    useRbacGraphData(selectedSubject, selectedNamespace || undefined);

  const handleSelectSubject = (_event: any, value: RbacSubject | string | null) => {
    if (!value) {
      setSelectedSubject(null);
      return;
    }
    if (typeof value === 'string') {
      setSelectedSubject({
        kind: 'User',
        name: value,
      });
    } else {
      setSelectedSubject(value);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        minHeight: 600,
      }}
    >
      <SectionHeader
        title={t('RBAC Dependency Visualizer')}
        subtitle={t(
          'Trace and visualize access dependencies connecting Subjects to RoleBindings, Roles, and permitted API rules.'
        )}
      />

      {/* Control bar */}
      <Paper
        elevation={1}
        sx={{
          padding: 2,
          mb: 2,
          borderRadius: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Autocomplete
          id="rbac-subject-select"
          options={allSubjects}
          value={selectedSubject}
          onChange={handleSelectSubject}
          freeSolo
          groupBy={option => (typeof option === 'string' ? t('Custom') : t(option.kind))}
          getOptionLabel={option => {
            if (typeof option === 'string') return option;
            return option.namespace ? `${option.name} (${option.namespace})` : option.name;
          }}
          isOptionEqualToValue={(option, value) =>
            option.kind === value.kind &&
            option.name === value.name &&
            option.namespace === value.namespace
          }
          renderInput={params => (
            <TextField
              {...params}
              label={t('Select Subject (ServiceAccount, User, Group)')}
              placeholder={t('Type or select a subject...')}
              size="small"
              sx={{ minWidth: 320 }}
            />
          )}
          renderOption={(props, option) => {
            const isSa = option.kind === 'ServiceAccount';
            return (
              <li {...props} key={`${option.kind}-${option.namespace || ''}-${option.name}`}>
                <Box display="flex" alignItems="center" gap={1} width="100%">
                  <Icon
                    icon={
                      isSa
                        ? 'mdi:account-lock'
                        : option.kind === 'Group'
                        ? 'mdi:group'
                        : 'mdi:account'
                    }
                    width={18}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {option.name}
                  </Typography>
                  {option.namespace && (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      ns: {option.namespace}
                    </Typography>
                  )}
                </Box>
              </li>
            );
          }}
        />

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="rbac-namespace-filter-label">{t('Namespace Filter')}</InputLabel>
          <Select
            labelId="rbac-namespace-filter-label"
            id="rbac-namespace-filter"
            value={selectedNamespace}
            label={t('Namespace Filter')}
            onChange={e => setSelectedNamespace(e.target.value)}
          >
            <MenuItem value="">
              <em>{t('All Namespaces')}</em>
            </MenuItem>
            {availableNamespaces.map(ns => (
              <MenuItem key={ns} value={ns}>
                {ns}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedSubject && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setSelectedSubject(null);
              setSelectedNamespace('');
            }}
            startIcon={<Icon icon="mdi:close" />}
          >
            {t('Clear')}
          </Button>
        )}

        {selectedSubject && (
          <Box display="flex" alignItems="center" gap={1} ml="auto">
            <Chip
              label={t('{{count}} Bindings', {
                count: stats.bindingsCount,
                defaultValue: `${stats.bindingsCount} Bindings`,
              })}
              color="info"
              variant="outlined"
              size="small"
            />
            <Chip
              label={t('{{count}} Roles', {
                count: stats.rolesCount,
                defaultValue: `${stats.rolesCount} Roles`,
              })}
              color="warning"
              variant="outlined"
              size="small"
            />
            <Chip
              label={t('{{count}} Rules', {
                count: stats.rulesCount,
                defaultValue: `${stats.rulesCount} Rules`,
              })}
              color="success"
              variant="outlined"
              size="small"
            />
          </Box>
        )}
      </Paper>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {errors.map(err => err.message).join(' | ')}
        </Alert>
      )}

      {/* Graph or Empty State */}
      <Box
        sx={{
          flex: 1,
          width: '100%',
          borderRadius: 2,
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor:
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          position: 'relative',
        }}
      >
        {isLoading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <Loader title={t('Loading RBAC resources...')} />
          </Box>
        ) : !selectedSubject ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            height="100%"
            p={4}
            textAlign="center"
          >
            <Icon icon="mdi:magnify" width={64} height={64} color={theme.palette.text.secondary} />
            <Typography variant="h6" fontWeight={700} mt={2}>
              {t('Select a Subject to Visualize Permissions')}
            </Typography>
            <Typography variant="body2" color="text.secondary" maxWidth={500} mt={1}>
              {t(
                'Choose a ServiceAccount, User, or Group from the selector above to trace the complete path from Subject through RoleBindings to Roles and granted rules.'
              )}
            </Typography>

            {allSubjects.length > 0 && (
              <Box mt={3}>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  {t('Quick select:')}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} justifyContent="center" maxWidth={600}>
                  {allSubjects.slice(0, 5).map(s => (
                    <Chip
                      key={`${s.kind}-${s.namespace || ''}-${s.name}`}
                      label={`${s.name}${s.namespace ? ` (${s.namespace})` : ''}`}
                      icon={
                        <Icon
                          icon={s.kind === 'ServiceAccount' ? 'mdi:account-lock' : 'mdi:account'}
                        />
                      }
                      onClick={() => handleSelectSubject(null, s)}
                      clickable
                      variant="outlined"
                      size="small"
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : nodes.length <= 1 ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            height="100%"
            p={4}
            textAlign="center"
          >
            <Icon
              icon="mdi:alert-circle"
              width={48}
              height={48}
              color={theme.palette.warning.main}
            />
            <Typography variant="subtitle1" fontWeight={700} mt={1}>
              {t('No RoleBindings Found')}
            </Typography>
            <Typography variant="body2" color="text.secondary" maxWidth={450} mt={0.5}>
              {t(
                'No RoleBindings or ClusterRoleBindings were found granting permissions to {{name}}.',
                { name: selectedSubject.name }
              )}
            </Typography>
          </Box>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={2.5}
              style={{ width: '100%', height: '100%' }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1}
                color={theme.palette.mode === 'dark' ? '#333' : '#ccc'}
              />
              <Controls />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </Box>
    </Box>
  );
}

export default RbacVisualizer;
