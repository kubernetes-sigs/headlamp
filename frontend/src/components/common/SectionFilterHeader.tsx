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

import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import { Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { validateLabelSelector } from '../../lib/labelSelectorValidation';
import { useQueryParamsState } from '../../lib/useQueryParamsState';
import { setLabelSelectorFilter, setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';
import { LabelSelectorInput } from './LabelSelectorInput';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

export interface SectionFilterHeaderProps extends SectionHeaderProps {
  /** Label keys found in resources loaded by the active list. */
  labelKeys?: string[];
  /** Hide the namespace filter. */
  noNamespaceFilter?: boolean;
  /** Hide the label filter. */
  noLabelFilter?: boolean;
  /**
   * @deprecated
   * This prop has no effect, search has moved inside the Table component.
   * To disable namespace filter use `noNamespaceFilter`
   */
  noSearch?: boolean;
  /** Actions rendered before the header actions. */
  preRenderFromFilterActions?: React.ReactNode[];
}

export default function SectionFilterHeader(props: SectionFilterHeaderProps) {
  const { t } = useTranslation(['glossary', 'translation']);
  const {
    labelKeys = [],
    noNamespaceFilter = false,
    noLabelFilter = false,
    actions: propsActions = [],
    preRenderFromFilterActions,
    ...headerProps
  } = props;
  const filter = useTypedSelector(state => state.filter);
  const dispatch = useDispatch();
  const [namespaceFromURL] = useQueryParamsState<string | undefined>('namespace', undefined);
  const [labelSelectorFromURL] = useQueryParamsState<string | undefined>(
    'labelSelector',
    undefined
  );
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const previousLabelSelectorFromURL = React.useRef(labelSelectorFromURL);
  const initializedLabelSelectorFromURL = React.useRef(false);
  const closeFilterEditor = () => setFiltersOpen(false);

  React.useEffect(
    () => {
      const namespace = namespaceFromURL?.split(' ') ?? [];
      if (namespace.length > 0) {
        const namespaceFromStore = [...filter.namespaces].sort();
        if (
          namespace
            .slice()
            .sort()
            .every((value: string, index: number) => value !== namespaceFromStore[index])
        ) {
          dispatch(setNamespaceFilter(namespace));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  React.useEffect(() => {
    const isInitialSync = !initializedLabelSelectorFromURL.current;
    const changed = previousLabelSelectorFromURL.current !== labelSelectorFromURL;
    initializedLabelSelectorFromURL.current = true;
    previousLabelSelectorFromURL.current = labelSelectorFromURL;

    if ((isInitialSync && labelSelectorFromURL === undefined) || (!isInitialSync && !changed)) {
      return;
    }

    const selector = labelSelectorFromURL ?? '';
    const validatedSelector = validateLabelSelector(selector) === null ? selector : '';
    if (validatedSelector !== filter.labelSelector) {
      dispatch(setLabelSelectorFilter(validatedSelector));
    }
  }, [dispatch, filter.labelSelector, labelSelectorFromURL]);

  let actions: React.ReactNode[] = [];
  if (preRenderFromFilterActions) {
    actions.push(...preRenderFromFilterActions);
  }

  if (!!propsActions) {
    actions = actions.concat(propsActions);
  }
  const titleSideActions = [...(headerProps.titleSideActions || [])];

  const filters: React.ReactNode[] = [];
  if (!noNamespaceFilter) {
    filters.push(<NamespacesAutocomplete key="namespace-filter" onApply={closeFilterEditor} />);
  }

  if (!noLabelFilter) {
    filters.push(
      <LabelSelectorInput key="label-filter" labelKeys={labelKeys} onApply={closeFilterEditor} />
    );
  }

  const hasNamespaceFilter = !noNamespaceFilter && filter.namespaces.size > 0;
  const hasLabelFilter = !noLabelFilter && Boolean(filter.labelSelector);
  const hasActiveFilters = hasNamespaceFilter || hasLabelFilter;

  if (filters.length > 0) {
    const filterButtonLabel = filtersOpen
      ? t('translation|Hide filters')
      : t('translation|Filter resources');
    titleSideActions.push(
      <Tooltip key="filter-toggle" title={filterButtonLabel as string}>
        <IconButton
          aria-label={filterButtonLabel as string}
          onClick={() => setFiltersOpen(open => !open)}
        >
          {filtersOpen ? <FilterAltOffOutlinedIcon /> : <FilterAltOutlinedIcon />}
        </IconButton>
      </Tooltip>
    );
  }

  const openFilterEditor = () => setFiltersOpen(true);

  const summarySx = (theme: Theme) => ({
    alignItems: 'center',
    background: 'none',
    border: 0,
    borderRadius: theme.shape.borderRadius,
    color: theme.palette.text.secondary,
    cursor: 'pointer',
    display: 'flex',
    font: 'inherit',
    gap: 1,
    maxWidth: '100%',
    minHeight: theme.spacing(4),
    padding: 0,
    textAlign: 'left' as const,
    textDecoration: 'none',
    textUnderlineOffset: '0.2em',
    width: { xs: '100%', sm: '48rem' },
    '&:hover, &:focus-visible': {
      color: theme.palette.primary.main,
      textDecoration: 'underline',
    },
  });

  const summaryTooltipSlotProps = {
    tooltip: {
      sx: (theme: Theme) => ({
        backgroundColor: theme.palette.background.paper,
        border: '1px solid',
        borderColor: theme.palette.divider,
        boxShadow: theme.shadows[4],
        color: theme.palette.text.primary,
        opacity: 1,
      }),
    },
    arrow: {
      sx: (theme: Theme) => ({
        color: theme.palette.background.paper,
      }),
    },
  };

  return (
    <React.Fragment>
      <SectionHeader
        {...headerProps}
        titleSideActions={titleSideActions}
        actions={
          actions.length <= 1
            ? actions
            : [
                <Box>
                  <Grid container spacing={1} alignItems="center">
                    {actions.map((action, i) => (
                      <Grid item key={i}>
                        {action}
                      </Grid>
                    ))}
                  </Grid>
                </Box>,
              ]
        }
      />
      {hasActiveFilters && !filtersOpen && (
        <Box
          aria-label="Resource filter summary"
          sx={theme => ({
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            marginTop: theme.spacing(headerProps.noPadding ? 0 : -1),
            paddingBottom: theme.spacing(headerProps.noPadding ? 0 : 2),
            paddingLeft: { xs: 0, sm: theme.spacing(headerProps.noPadding ? 0 : 2) },
            paddingRight: { xs: 0, sm: theme.spacing(headerProps.noPadding ? 0 : 2) },
          })}
        >
          {hasNamespaceFilter && (
            <Tooltip
              arrow
              slotProps={summaryTooltipSlotProps}
              title={`${t('Namespaces')}: ${[...filter.namespaces].join(', ')}`}
              TransitionProps={{ timeout: 0 }}
            >
              <Link
                aria-label={t('translation|Edit Namespaces') as string}
                component="button"
                onClick={openFilterEditor}
                sx={summarySx}
                type="button"
                underline="none"
              >
                <Typography
                  color="inherit"
                  component="span"
                  sx={theme => ({
                    fontSize: theme.typography.pxToRem(20),
                    overflowWrap: 'anywhere',
                  })}
                  variant="h2"
                >
                  {[...filter.namespaces].join(', ')}
                </Typography>
              </Link>
            </Tooltip>
          )}
          {hasLabelFilter && (
            <Tooltip
              arrow
              slotProps={summaryTooltipSlotProps}
              title={`${t('translation|Label Selector')}: ${filter.labelSelector}`}
              TransitionProps={{ timeout: 0 }}
            >
              <Link
                aria-label={t('translation|Edit Label Selector') as string}
                component="button"
                onClick={openFilterEditor}
                sx={summarySx}
                type="button"
                underline="none"
              >
                <Typography
                  color="inherit"
                  component="span"
                  sx={theme => ({
                    fontSize: theme.typography.pxToRem(20),
                    overflowWrap: 'anywhere',
                  })}
                  variant="h2"
                >
                  {filter.labelSelector}
                </Typography>
              </Link>
            </Tooltip>
          )}
        </Box>
      )}
      {filters.length > 0 && filtersOpen && (
        <Box
          aria-label="Resource filters"
          sx={theme => ({
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            marginTop: theme.spacing(headerProps.noPadding ? 0 : -1),
            paddingBottom: theme.spacing(headerProps.noPadding ? 0 : 2),
            paddingLeft: { xs: 0, sm: theme.spacing(headerProps.noPadding ? 0 : 2) },
            paddingRight: { xs: 0, sm: theme.spacing(headerProps.noPadding ? 0 : 2) },
            '& > *': {
              maxWidth: '100%',
              width: { xs: '100%', sm: 'auto' },
            },
          })}
        >
          {filters}
        </Box>
      )}
    </React.Fragment>
  );
}
