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
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import { loadClusterSettings } from '../../helpers/clusterSettings';
import { useCluster, useClustersConf } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';

/**
 * addQuery will add a query parameter to the URL using history API.
 *
 * It will also remove the parameter if the value is the same as the default value.
 * If the tableName is provided, it will be added to the query string.
 * @param queryObj The query object to add to the URL.
 * @param queryParamDefaultObj The default query object to compare with.
 * @param history The history object from react-router.
 * @param location The location object from react-router.
 * @param tableName The table name to add to the query string.
 * @returns void
 */
function addQuery(
  queryObj: { [key: string]: string },
  queryParamDefaultObj: { [key: string]: string } = {},
  history: any,
  location: any,
  tableName = ''
) {
  const pathname = location.pathname;
  const searchParams = new URLSearchParams(location.search);

  if (!!tableName) {
    searchParams.set('tableName', tableName);
  }
  // Ensure that default values will not show up in the URL
  for (const key in queryObj) {
    const value = queryObj[key];
    if (value !== queryParamDefaultObj[key]) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }

  history.push({
    pathname: pathname,
    search: searchParams.toString(),
  });
}

export interface PureNamespacesAutocompleteProps {
  namespaceNames: string[];
  onChange: (event: React.ChangeEvent<{}>, newValue: string[]) => void;
  filter: { namespaces: Set<string> };
}

export function PureNamespacesAutocomplete({
  namespaceNames,
  onChange: onChangeFromProps,
  filter,
}: PureNamespacesAutocompleteProps) {
  const theme = useTheme();
  const { t } = useTranslation(['glossary', 'translation']);
  const [namespaceInput, setNamespaceInput] = React.useState<string>('');
  const maxNamespacesChars = 12;

  const onInputChange = (event: object, value: string, reason: string) => {
    // For some reason, the AutoComplete component resets the text after a short
    // delay, so we need to avoid that or the user won't be able to edit/use what they type.
    if (reason !== 'reset') {
      setNamespaceInput(value);
    }
  };

  const onChange = (event: React.ChangeEvent<{}>, newValue: string[]) => {
    // Now we reset the input so it won't show next to the selected namespaces.
    setNamespaceInput('');
    onChangeFromProps(event, newValue);
  };

  return (
    <Autocomplete
      multiple
      id="namespaces-filter"
      autoComplete
      openOnFocus
      options={namespaceNames}
      onChange={onChange}
      onInputChange={onInputChange}
      inputValue={namespaceInput}
      // We reverse the namespaces so the last chosen appear as the first in the label. This
      // is useful since the label is ellipsized and this we get to see it change.
      value={[...filter.namespaces.values()].reverse()}
      renderOption={(props, option, { selected }) => (
        <li {...props} key={props.key}>
          <Checkbox
            icon={<Icon icon="mdi:checkbox-blank-outline" />}
            checkedIcon={<Icon icon="mdi:check-box-outline" />}
            style={{
              color: selected ? theme.palette.primary.main : theme.palette.text.primary,
            }}
            checked={selected}
          />
          {option}
        </li>
      )}
      renderTags={(tags: string[]) => {
        if (tags.length === 0) {
          return <Typography variant="body2">{t('translation|All namespaces')}</Typography>;
        }

        let namespacesToShow = tags[0];
        const joiner = ', ';
        const joinerLength = joiner.length;
        let joinnedNamespaces = 1;
        const remainingTags = tags.slice(1);

        tags.slice(1).forEach(tag => {
          if (namespacesToShow.length + tag.length + joinerLength <= maxNamespacesChars) {
            namespacesToShow += joiner + tag;
            joinnedNamespaces++;
          }
        });

        return (
          <Typography style={{ overflowWrap: 'anywhere' }} ml={1}>
            {namespacesToShow.length > maxNamespacesChars
              ? namespacesToShow.slice(0, maxNamespacesChars) + '…'
              : namespacesToShow}
            {tags.length > joinnedNamespaces && (
              <>
                <span>,&nbsp;</span>
                <Tooltip
                  title={
                    <ul style={{ margin: 0, padding: 10, listStyle: 'none' }}>
                      {remainingTags.map((tag, key) => (
                        <li key={key}>{tag}</li>
                      ))}
                    </ul>
                  }
                  arrow
                  placement="top"
                >
                  <b style={{ cursor: 'pointer' }}>{`+${tags.length - joinnedNamespaces}`}</b>
                </Tooltip>
              </>
            )}
          </Typography>
        );
      }}
      renderInput={params => (
        <Box width="15rem">
          <TextField
            {...params}
            variant="outlined"
            size="small"
            label={t('Namespaces')}
            fullWidth
            InputLabelProps={{ shrink: true }}
            style={{ marginTop: 0 }}
            placeholder={[...filter.namespaces.values()].length > 0 ? '' : t('Filter')}
          />
        </Box>
      )}
    />
  );
}

export function NamespacesAutocomplete() {
  const history = useHistory();
  const location = useLocation();
  const dispatch = useDispatch();
  const filter = useTypedSelector(state => state.filter);
  const cluster = useCluster();
  const [namespaceNames, setNamespaceNames] = React.useState<string[]>([]);

  React.useEffect(() => {
    const settings = loadClusterSettings(cluster || '');
    const allowedNamespaces = settings?.allowedNamespaces || [];
    if (allowedNamespaces.length > 0) {
      setNamespaceNames(allowedNamespaces);
    }
  }, [cluster]);

  const onChange = (event: React.ChangeEvent<{}>, newValue: string[]) => {
    addQuery({ namespace: newValue.join(' ') }, { namespace: '' }, history, location, '');
    dispatch(setNamespaceFilter(newValue));
  };

  return namespaceNames.length > 0 ? (
    <PureNamespacesAutocomplete
      namespaceNames={namespaceNames}
      onChange={onChange}
      filter={filter}
    />
  ) : (
    <NamespacesFromClusterAutocomplete onChange={onChange} filter={filter} />
  );
}

/**
 * This hook will try to select a namespace in a specific case
 *
 * If we failed to load namespaces it might be because the user
 * doesn't have access to list all the namespaces but still has
 * access to a specific namespace
 *
 * Sometimes in the kubeconfig there will be a default namespace set
 * which we can try to use as a fallback
 */
const useDefaultNamespaceFallback = (
  namespacesList: Namespace[] | null,
  isNamespaceError: boolean
) => {
  const selectedNamespaces = useTypedSelector(state => state.filter.namespaces);
  const allClustersConfigs = useClustersConf();
  const currentCluster = useCluster();
  const dispatch = useDispatch();

  useEffect(() => {
    if (
      currentCluster &&
      allClustersConfigs &&
      isNamespaceError &&
      (!namespacesList || namespacesList?.length === 0) &&
      selectedNamespaces.size === 0
    ) {
      const defaultNamespaceFromKubeconfig =
        allClustersConfigs[currentCluster]?.meta_data.namespace;

      if (defaultNamespaceFromKubeconfig) {
        dispatch(setNamespaceFilter([defaultNamespaceFromKubeconfig]));
      }
    }
  }, [namespacesList, isNamespaceError, currentCluster]);
};

function NamespacesFromClusterAutocomplete(
  props: Omit<PureNamespacesAutocompleteProps, 'namespaceNames'>
) {
  const [namespacesList, error] = Namespace.useList();
  const namespaceNames = useMemo(
    () =>
      namespacesList
        ?.map(namespace => namespace.metadata.name)
        .slice()
        .sort((a, b) => a.localeCompare(b)) ?? [],
    [namespacesList]
  );

  useDefaultNamespaceFallback(namespacesList, Boolean(error));

  return <PureNamespacesAutocomplete namespaceNames={namespaceNames} {...props} />;
}
