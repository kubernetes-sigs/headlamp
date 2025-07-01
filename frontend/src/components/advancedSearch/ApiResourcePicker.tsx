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

import { Icon } from '@iconify/react';
import {
  alpha,
  Badge,
  Box,
  Button,
  Checkbox,
  Popover,
  Stack,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import Fuse, { IFuseOptions } from 'fuse.js';
import { t } from 'i18next';
import { groupBy, xor } from 'lodash';
import { memo, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';
import { ApiResource, apiResourceId } from '../../lib/k8s/api/v2/ApiResource';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';

const Node = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
}));

const NodeHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: theme.spacing(1),
  paddingLeft: theme.spacing(0.5),
  paddingRight: theme.spacing(0.5),
  userSelect: 'none',

  ':hover': {
    background: theme.palette.action.hover,
  },
  ':active': {
    background: alpha(theme.palette.action.active, theme.palette.action.activatedOpacity),
  },
}));

interface ApiResourceGroup {
  /** Name of the resource group */
  name: string;
  /** List of resources in this group */
  resources: ApiResource[];
}

const LabelAndCheckbox = ({
  label,
  checked,
  indeterminate,
  showIcon,
  onClick,
}: {
  label: string;
  checked?: boolean;
  indeterminate?: boolean;
  showIcon?: boolean;
  onClick: () => void;
}) => (
  <>
    <Box mr={1} display="flex">
      {showIcon && (
        <Badge badgeContent={0} overlap="circular">
          <KubeIcon kind={label as any} width="20px" height="20px" />
        </Badge>
      )}
    </Box>
    <Typography variant="subtitle2">{label}</Typography>
    <Checkbox
      sx={() => ({ marginLeft: 'auto', padding: 0.75 })}
      checked={checked}
      indeterminate={indeterminate}
      size="small"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          onClick();
        }
      }}
    />
  </>
);

function ApiResourceGroup({
  name,
  resources,
  selection,
  activeItemId,
  setActiveItemId,
  setSelectedResources,
}: {
  name: string;
  resources: ApiResource[];
  /** Set of selected source ids */
  selection?: Set<string>;
  /** Active (expanded) source */
  activeItemId: string | undefined;
  setActiveItemId: (id: string | undefined) => void;
  /** Callback when a source is toggled */
  setSelectedResources: (source: Set<string>) => void;
}) {
  const resourcesInThisGroup = resources.filter(it =>
    name === 'core' ? it.groupName === undefined : it.groupName === name
  );
  const isActive = name === activeItemId;

  const checked = resourcesInThisGroup.every(resource => selection?.has(apiResourceId(resource)));
  const indeterminate =
    !checked && resourcesInThisGroup.some(resource => selection?.has(apiResourceId(resource)));

  return (
    <Node>
      <NodeHeader
        role="button"
        tabIndex={0}
        onClick={() => setActiveItemId(isActive ? undefined : name)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActiveItemId(isActive ? undefined : name);
          }
        }}
      >
        <Icon
          icon={isActive ? 'mdi:chevron-down' : 'mdi:chevron-right'}
          width={18}
          height={18}
          style={{ flexShrink: 0 }}
        />

        <LabelAndCheckbox
          showIcon={false}
          label={name}
          checked={checked}
          indeterminate={indeterminate}
          onClick={() => {
            const newSet = new Set(selection);
            if (checked) {
              resourcesInThisGroup.forEach(resource => {
                newSet.delete(apiResourceId(resource));
              });
            } else {
              resourcesInThisGroup.forEach(resource => {
                newSet.add(apiResourceId(resource));
              });
            }
            setSelectedResources(newSet);
          }}
        />
      </NodeHeader>

      <Stack ml={3}>
        {isActive &&
          resources.map(resource => {
            const id = apiResourceId(resource);
            const toggle = () => {
              setSelectedResources(new Set(xor([...(selection ?? [])], [id])));
            };
            return (
              <Node key={resource.pluralName} onClick={toggle}>
                <NodeHeader>
                  <LabelAndCheckbox
                    showIcon
                    label={resource.kind}
                    checked={selection?.has(id)}
                    indeterminate={false}
                    onClick={toggle}
                  />
                </NodeHeader>
              </Node>
            );
          })}
      </Stack>
    </Node>
  );
}

/**
 * A custom hook that provides fuzzy search functionality using Fuse.js.
 */
function useFuseSearch<T>(items: T[], options: IFuseOptions<T>, query: string) {
  const fuse = useMemo(() => new Fuse(items, options), [items, options]);

  return useMemo(
    () => (query.trim() === '' ? items : fuse.search(query).map(it => it.item)),
    [fuse, query]
  );
}

export interface ApiResourcesViewProps {
  /** List of resources to render */
  resources: ApiResource[];
  /** Selected resources */
  selectedResources?: Set<string>;
  /** Callback when a source is toggled */
  setSelectedResources: (source: Set<string>) => void;
}

/**
 * A component that renders a dropdown button which opens a popover with searchable resource selection UI.
 */
export const ApiResourcesView = memo(
  ({
    resources,
    selectedResources: selectedSources,
    setSelectedResources,
  }: ApiResourcesViewProps) => {
    const [query, setQuery] = useState('');
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [activeItemId, setActiveItemId] = useState<string | undefined>(undefined);

    const matchingResources = useFuseSearch(
      resources,
      useMemo(() => ({ keys: ['kind', 'groupName'], threshold: 0.3 }), []),
      query
    );

    const groups = useMemo(
      () => groupBy(matchingResources, it => it.groupName),
      [matchingResources, query]
    );

    const size = selectedSources?.size ?? 0;

    return (
      <>
        <Badge
          badgeContent={size}
          color="primary"
          anchorOrigin={{
            horizontal: 'right',
            vertical: 'top',
          }}
          slotProps={{
            badge: {
              style: {
                top: '4px',
                right: '4px',
              },
            },
          }}
        >
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Icon icon="mdi:filter" />}
            onClick={e => setAnchorEl(e.currentTarget)}
          >
            <Trans>Select Resources</Trans>
          </Button>
        </Badge>

        <Popover
          elevation={4}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          onClose={() => setAnchorEl(null)}
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: 'fit-content',
              minWidth: '320px',
              padding: 1.5,
              gap: 1,
            }}
          >
            <TextField
              placeholder={t('Search')}
              label={t('Search Resources')}
              variant="outlined"
              size="small"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <Box sx={{ display: 'flex', width: '100%', gap: 1 }}>
              <Button
                startIcon={<Icon icon="mdi:playlist-check" />}
                size="small"
                variant="contained"
                color="secondary"
                sx={{ flex: '1 1 0' }}
                onClick={() =>
                  setSelectedResources(
                    new Set(matchingResources.map(resource => apiResourceId(resource)))
                  )
                }
              >
                <Trans>Select All</Trans>
              </Button>
              <Button
                startIcon={<Icon icon="mdi:playlist-remove" />}
                size="small"
                variant="contained"
                color="secondary"
                sx={{ flex: '1 1 0' }}
                onClick={() => setSelectedResources(new Set())}
              >
                <Trans>Clear Selection</Trans>
              </Button>
            </Box>
            <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <GroupList
                groups={groups}
                selectedSources={selectedSources}
                setSelectedResources={setSelectedResources}
                activeItemId={activeItemId}
                setActiveItemId={setActiveItemId}
              />
            </Box>
          </Box>
        </Popover>
      </>
    );
  }
);

const GroupList = memo(function ({
  groups,
  selectedSources,
  setSelectedResources,
  activeItemId,
  setActiveItemId,
}: {
  groups: Record<string, ApiResource[]>;
  selectedSources?: Set<string>;
  setSelectedResources: (r: Set<string>) => void;
  activeItemId?: string;
  setActiveItemId: (id?: string) => void;
}) {
  return Object.entries(groups).map(([groupName, resources]) => (
    <ApiResourceGroup
      key={groupName}
      name={groupName === 'undefined' ? 'core' : groupName}
      resources={resources}
      selection={selectedSources}
      setSelectedResources={setSelectedResources}
      activeItemId={activeItemId}
      setActiveItemId={id => setActiveItemId(id)}
    />
  ));
});
