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
import { uniq } from 'lodash';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
  getCombinedAllowedNamespaces,
  getDiscoveredNamespacesVersion,
  hasAllowedNamespacesRestriction,
  subscribeDiscoveredNamespaces,
} from '../../helpers/clusterSettings';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { AllowedNamespacesResolutionContext } from '../../lib/k8s/allowedNamespacesContext';
import Namespace from '../../lib/k8s/namespace';
import { useQueryParamsState } from '../../lib/useQueryParamsState';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';

export interface PureNamespacesAutocompleteProps {
  namespaceNames: string[];
  onChange: (event: React.ChangeEvent<{}>, newValue: string[]) => void;
  onApply?: () => void;
  filter: { namespaces: Set<string> };
}

export interface NamespacesAutocompleteProps {
  /** Called after a namespace selection is applied. */
  onApply?: () => void;
}

export function PureNamespacesAutocomplete({
  namespaceNames,
  onChange: onChangeFromProps,
  onApply,
  filter,
}: PureNamespacesAutocompleteProps) {
  const theme = useTheme();
  const { t } = useTranslation(['glossary', 'translation']);
  const [namespaceInput, setNamespaceInput] = React.useState<string>('');
  const [inputFocused, setInputFocused] = React.useState(false);
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
      sx={{
        '& .MuiAutocomplete-inputRoot': {
          flexWrap: 'nowrap',
          minHeight: '40px',
        },
      }}
      autoComplete
      openOnFocus
      disableCloseOnSelect
      options={namespaceNames}
      onBlur={() => setInputFocused(false)}
      onChange={onChange}
      onFocus={() => setInputFocused(true)}
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
        const hiddenTags: string[] = [];

        tags.slice(1).forEach(tag => {
          if (namespacesToShow.length + tag.length + joinerLength <= maxNamespacesChars) {
            namespacesToShow += joiner + tag;
            joinnedNamespaces++;
          } else {
            hiddenTags.push(tag);
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
                      {hiddenTags.map(tag => (
                        <li key={tag}>{tag}</li>
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
      renderInput={params => {
        const collapseInput = filter.namespaces.size > 0 && !inputFocused;
        return (
          <Box sx={{ maxWidth: '100%', width: { xs: '100%', sm: '48rem' } }}>
            <TextField
              {...params}
              variant="outlined"
              size="small"
              label={t('Namespaces')}
              fullWidth
              inputProps={{
                ...params.inputProps,
                style: collapseInput
                  ? { ...params.inputProps.style, minWidth: 0, padding: 0, width: 0 }
                  : params.inputProps.style,
              }}
              InputLabelProps={{ shrink: true }}
              style={{ marginTop: 0 }}
              placeholder={[...filter.namespaces.values()].length > 0 ? '' : t('Filter')}
              onKeyDown={event => event.key === 'Enter' && onApply?.()}
            />
          </Box>
        );
      }}
    />
  );
}

export function NamespacesAutocomplete({ onApply }: NamespacesAutocompleteProps = {}) {
  const [, setNamespaceInURL] = useQueryParamsState<string | undefined>('namespace', undefined);
  const dispatch = useDispatch();
  const filter = useTypedSelector(state => state.filter);
  const clusters = useSelectedClusters();
  // The allowed namespaces of every selected cluster, so none of them is left out when
  // more than one cluster is selected.
  // Discovered namespaces change in the background (refreshes, identity resets), so
  // follow the discovery store too. Selector resolution is tracked separately.
  const discoveryVersion = React.useSyncExternalStore(
    subscribeDiscoveredNamespaces,
    getDiscoveredNamespacesVersion
  );
  const resolutionKey = React.useContext(AllowedNamespacesResolutionContext);
  const allowedPerCluster = useMemo(
    () => clusters.map(cluster => getCombinedAllowedNamespaces(cluster)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusters, discoveryVersion, resolutionKey]
  );
  // A selector that resolves to no namespaces is still a restriction.
  const unrestrictedClusters = useMemo(
    () => clusters.filter(c => !hasAllowedNamespacesRestriction(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusters, discoveryVersion, resolutionKey]
  );
  const allowedNames = useMemo(
    () => uniq(allowedPerCluster.flat()).sort((a, b) => a.localeCompare(b)),
    [allowedPerCluster]
  );
  const [everyClusterLimited, setEveryClusterLimited] = React.useState(false);

  // Switch to only the allowed namespaces in an effect, as before, so the first render still
  // lists the namespaces from the API.
  React.useEffect(() => {
    setEveryClusterLimited(
      allowedPerCluster.length > 0 && allowedPerCluster.every(names => names.length > 0)
    );
  }, [allowedPerCluster]);

  const onChange = (event: React.ChangeEvent<{}>, newValue: string[]) => {
    setNamespaceInURL(newValue.length > 0 ? newValue.join(' ') : undefined);
    dispatch(setNamespaceFilter(newValue));
  };

  // A cluster without allowed namespaces still needs its namespaces listed. The allowed
  // ones of the other clusters are added, as their users may not be able to list them.
  return everyClusterLimited ? (
    <PureNamespacesAutocomplete
      namespaceNames={allowedNames}
      onChange={onChange}
      onApply={onApply}
      filter={filter}
    />
  ) : (
    <NamespacesFromClusterAutocomplete
      onChange={onChange}
      onApply={onApply}
      filter={filter}
      extraNamespaceNames={allowedNames}
      unrestrictedClusters={unrestrictedClusters}
      hasRestrictedCluster={unrestrictedClusters.length < clusters.length}
    />
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
        allClustersConfigs[currentCluster]?.meta_data?.namespace;

      if (defaultNamespaceFromKubeconfig) {
        dispatch(setNamespaceFilter([defaultNamespaceFromKubeconfig]));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespacesList, isNamespaceError, currentCluster]);
};

function NamespacesFromClusterAutocomplete(
  props: Omit<PureNamespacesAutocompleteProps, 'namespaceNames'> & {
    /** Namespaces to offer even if the list doesn't have them. */
    extraNamespaceNames?: string[];
    /** Selected clusters without any allowed namespaces. */
    unrestrictedClusters?: string[];
    /** Whether some selected cluster has an allowed-namespaces restriction. */
    hasRestrictedCluster?: boolean;
  }
) {
  const {
    extraNamespaceNames = [],
    unrestrictedClusters = [],
    hasRestrictedCluster = false,
    ...autocompleteProps
  } = props;
  const listResult = Namespace.useList();
  const [namespacesList, error] = listResult;
  const allClustersConfigs = useClustersConf();
  const listFailed = Boolean(error) && !namespacesList?.length;
  // Clusters whose request failed, even when other clusters returned namespaces.
  const failedClusters = useMemo(
    () => new Set((listResult.errors ?? []).map(e => e.cluster).filter(Boolean)),
    [listResult.errors]
  );
  const offeredNames = useMemo(
    () =>
      uniq([
        ...(namespacesList?.map(namespace => namespace.metadata.name) ?? []),
        ...extraNamespaceNames,
      ]),
    [namespacesList, extraNamespaceNames]
  );
  const namespaceNames = useMemo(() => {
    // When the namespace list of an unrestricted cluster is forbidden, that cluster would
    // otherwise offer nothing, so keep its kubeconfig namespace selectable.
    const kubeconfigNamespaces = unrestrictedClusters
      .filter(c => listFailed || failedClusters.has(c))
      .map(c => allClustersConfigs?.[c]?.meta_data?.namespace ?? '')
      .filter(Boolean);
    return uniq([...offeredNames, ...kubeconfigNamespaces])
      .slice()
      .sort((a, b) => a.localeCompare(b));
  }, [offeredNames, unrestrictedClusters, listFailed, failedClusters, allClustersConfigs]);

  // Only guess the kubeconfig namespace when there is nothing to offer: it may not be one of
  // the allowed namespaces, and picking it would hide the resources of those.
  // Nor when a selected cluster is restricted, even if its selector resolved to nothing.
  useDefaultNamespaceFallback(
    namespacesList,
    Boolean(error) && offeredNames.length === 0 && !hasRestrictedCluster
  );

  return <PureNamespacesAutocomplete namespaceNames={namespaceNames} {...autocompleteProps} />;
}
