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

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import React from 'react';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

/**
 * Get the filter value by name from the URL
 *
 * @param key - the name of the filter
 * @param location - the location object from react-router
 * @returns the filter value as an array of strings
 */
function getFilterValueByNameFromURL(key: string, location: any): string[] {
  const searchParams = new URLSearchParams(location.search);

  const filterValue = searchParams.get(key);
  if (!filterValue) {
    return [];
  }
  return filterValue.split(' ');
}

export interface SectionFilterHeaderProps extends SectionHeaderProps {
  noNamespaceFilter?: boolean;
  /**
   * @deprecated
   * This prop has no effect, search has moved inside the Table component.
   * To disable namespace filter use `noNamespaceFilter`
   */
  noSearch?: boolean;
  preRenderFromFilterActions?: React.ReactNode[];
}

export default function SectionFilterHeader(props: SectionFilterHeaderProps) {
  const {
    noNamespaceFilter = false,
    actions: propsActions = [],
    preRenderFromFilterActions,
    ...headerProps
  } = props;
  const filter = useTypedSelector(state => state.filter);
  const dispatch = useDispatch();
  const location = useLocation();

  React.useEffect(
    () => {
      const namespace = getFilterValueByNameFromURL('namespace', location);
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

  let actions: React.ReactNode[] = [];
  if (preRenderFromFilterActions) {
    actions.push(...preRenderFromFilterActions);
  }

  if (!!propsActions) {
    actions = actions.concat(propsActions);
  }

  if (!noNamespaceFilter) {
    actions.push(<NamespacesAutocomplete />);
  }

  return (
    <React.Fragment>
      <SectionHeader
        {...headerProps}
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
    </React.Fragment>
  );
}
