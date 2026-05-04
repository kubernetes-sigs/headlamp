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
import { Tooltip } from '@mui/material';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/system/colorManipulator';
import { memo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { GraphSource } from '../graph/graphModel';
import { getFlatSources, SourceData } from './GraphSources';
import { GraphSourcesConfig } from './GraphSourcesConfig';

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
  paddingTop: theme.spacing(0.5),
  paddingBottom: theme.spacing(0.5),

  ':hover': {
    background: theme.palette.action.hover,
  },
  ':active': {
    background: alpha(theme.palette.action.active, theme.palette.action.activatedOpacity),
  },
}));

/**
 * Component that displays a Source and allows to check or uncheck it
 * and its' descendants
 *
 * @returns
 */
function GraphSourceView({
  source,
  sourceData,
  selection,
  hiddenSources,
  toggleSelection,
}: {
  /** Source definition */
  source: GraphSource;
  /** Loaded data for the sources */
  sourceData: SourceData;
  /** Set of selected source ids */
  selection: Set<string>;
  toggleSelection: (source: GraphSource) => void;
  hiddenSources: Set<string>;
}) {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const hasChildren = 'sources' in source;
  const isSelected = (source: GraphSource): boolean =>
    'sources' in source ? source.sources.every(s => isSelected(s)) : selection.has(source.id);
  const isChecked = isSelected(source);
  const intermediate =
    'sources' in source && getFlatSources(source.sources).some(s => isSelected(s)) && !isChecked;

  const data = sourceData.get(source.id);
  const isDisabled = hiddenSources.has(source.id);
  const hasDisabled =
    'sources' in source ? source.sources.some(s => hiddenSources.has(s.id)) : false;

  const check = (
    <>
      <Box mr={1} display="flex">
        <Badge
          badgeContent={
            hasDisabled || isDisabled ? (
              <Box sx={{ color: 'warning.main' }}>
                <Icon icon="mdi:warning" />
              </Box>
            ) : isChecked ? (
              data?.nodes?.length
            ) : undefined
          }
          overlap="circular"
        >
          <Box width={hasChildren ? '24px' : '24px'} height={hasChildren ? '24px' : '24px'}>
            {source.icon}
          </Box>
        </Badge>
      </Box>
      <Typography variant="subtitle2" sx={{ marginRight: 'auto' }}>
        {source.label}
      </Typography>
      {!('sources' in source) && isChecked && !data && <CircularProgress />}
      {isDisabled && (
        <Tooltip
          title={t(
            'These items are hidden for performance reasons. The amount exceeded the limit of {{limit}}.',
            { limit: GraphSourcesConfig.nodeLimitPerSource }
          )}
        >
          <Chip
            color="warning"
            size="small"
            label={
              <Box sx={{ display: 'flex', gap: 0.5, lineHeight: 1 }}>
                <Icon icon="mdi:warning" />
                <Trans>Hidden</Trans>
              </Box>
            }
          />
        </Tooltip>
      )}
      <Checkbox
        checked={isChecked}
        indeterminate={intermediate}
        onClick={e => {
          e.stopPropagation();
          toggleSelection(source);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            toggleSelection(source);
          }
        }}
      />
    </>
  );

  if (!('sources' in source)) {
    return (
      <Node
        tabIndex={0}
        role="button"
        aria-disabled={isDisabled}
        onClick={() => {
          toggleSelection(source);
        }}
      >
        <NodeHeader>{check}</NodeHeader>
      </Node>
    );
  }

  return (
    <Node>
      <NodeHeader
        role="button"
        tabIndex={0}
        onClick={() => setIsActive(!isActive)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsActive(!isActive);
          }
        }}
      >
        <Icon
          icon={isActive ? 'mdi:chevron-down' : 'mdi:chevron-right'}
          width={18}
          height={18}
          style={{ flexShrink: 0 }}
        />

        {check}
      </NodeHeader>

      <Stack ml={3}>
        {isActive &&
          source.sources?.map(source => (
            <GraphSourceView
              source={source}
              selection={selection}
              hiddenSources={hiddenSources}
              toggleSelection={toggleSelection}
              key={source.id}
              sourceData={sourceData}
            />
          ))}
      </Stack>
    </Node>
  );
}

export interface GraphSourcesViewProps {
  /** List of sources to render */
  sources: GraphSource[];
  /** Data for each source */
  sourceData: SourceData;
  /** Selected sources */
  selectedSources: Set<string>;
  /** Callback when a source is toggled */
  toggleSource: (source: GraphSource) => void;
  /** Disabled sources due to exceeding the limit */
  hiddenSources: Set<string>;
}

export const GraphSourcesView = memo(
  ({
    sources,
    sourceData,
    selectedSources,
    hiddenSources,
    toggleSource,
  }: GraphSourcesViewProps) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const selected = sources.filter(source => {
      const isSelected = selectedSources.has(source.id);
      return 'sources' in source
        ? getFlatSources(source.sources).some(it => selectedSources.has(it.id))
        : isSelected;
    });
    const selectedText =
      selected.length > 2
        ? `${selected[0].label}, ${selected[1].label}, +${selected.length - 2}`
        : selected.map(it => it.label).join(', ');

    return (
      <>
        <Badge
          badgeContent={
            hiddenSources.size > 0 && (
              <Chip color="warning" size="small" label={<Icon icon="mdi:warning" />}></Chip>
            )
          }
        >
          <Chip
            label={
              <Stack direction="row" gap={1} alignItems="center">
                <Icon icon="mdi:filter" /> {selectedText}{' '}
              </Stack>
            }
            color="primary"
            variant={'filled'}
            onClick={e => setAnchorEl(e.currentTarget)}
            sx={{
              lineHeight: '1',
            }}
          />
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
              minWidth: '350px',
              padding: 1.5,
            }}
          >
            {sources.map((source, index) => (
              <GraphSourceView
                source={source}
                selection={selectedSources}
                toggleSelection={toggleSource}
                key={index}
                sourceData={sourceData}
                hiddenSources={hiddenSources}
              />
            ))}
          </Box>
        </Popover>
      </>
    );
  }
);
