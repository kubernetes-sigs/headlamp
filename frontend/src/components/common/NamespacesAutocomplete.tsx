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
import { visuallyHidden } from '@mui/utils';
import { uniq } from 'lodash';
import React, { useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import {
  getCombinedAllowedNamespaces,
  getDiscoveredNamespacesVersion,
  hasAllowedNamespacesRestriction,
  subscribeDiscoveredNamespaces,
} from '../../helpers/clusterSettings';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { AllowedNamespacesResolutionContext } from '../../lib/k8s/allowedNamespacesContext';
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

function isComposingKeyEvent(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.which === 229 || event.keyCode === 229;
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
  const [open, setOpen] = React.useState<boolean>(false);
  const instructionsId = useId();
  const maxNamespacesChars = 12;

  const onInputChange = (event: object, value: string, reason: string) => {
    // For some reason, the AutoComplete component resets the text after a short
    // delay, so we need to avoid that or the user won't be able to edit/use what they type.
    if (reason !== 'reset') {
      setNamespaceInput(value);
    }
  };

  const onChange = (
    event: React.SyntheticEvent,
    newValue: string[],
    reason?: string,
    details?: { option?: string }
  ) => {
    // Now we reset the input so it won't show next to the selected namespaces.
    setNamespaceInput('');
    if (
      event.type === 'keydown' &&
      (event as React.KeyboardEvent).key === 'Enter' &&
      (reason === 'selectOption' || reason === 'removeOption') &&
      details?.option
    ) {
      // Keyboard selection (Enter on highlighted option): select exclusively and close
      onChangeFromProps(event as React.ChangeEvent<{}>, [details.option]);
      setOpen(false);
      return;
    }
    onChangeFromProps(event as React.ChangeEvent<{}>, newValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isComposingKeyEvent(event)) {
      (event as React.KeyboardEvent & { defaultMuiPrevented?: boolean }).defaultMuiPrevented = true;
      return;
    }
    if (event.key === ' ') {
      const activeDescendant = (event.target as HTMLElement).getAttribute('aria-activedescendant');
      if (activeDescendant) {
        const activeElement = document.getElementById(activeDescendant);
        const option = activeElement?.getAttribute('data-option-name');
        if (option) {
          event.preventDefault();
          const currentNamespaces = filter.namespaces;
          const newSelection = currentNamespaces.has(option)
            ? [...currentNamespaces].filter(ns => ns !== option)
            : [...currentNamespaces, option];
          setNamespaceInput('');
          onChangeFromProps(event as React.ChangeEvent<{}>, newSelection);
        }
      }
    }
  };

  return (
    <Autocomplete
      multiple
      id="namespaces-filter"
      autoComplete
      openOnFocus
      disableCloseOnSelect
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onKeyDown={handleKeyDown}
      options={namespaceNames}
      onChange={onChange}
      onInputChange={onInputChange}
      inputValue={namespaceInput}
      // We reverse the namespaces so the last chosen appear as the first in the label. This
      // is useful since the label is ellipsized and this we get to see it change.
      value={[...filter.namespaces.values()].reverse()}
      renderOption={(props, option, { selected }) => {
        const { onClick, ...otherProps } = props;
        void onClick;
        return (
          <li
            role="option"
            aria-selected={selected}
            aria-label={option}
            aria-describedby={instructionsId}
            {...otherProps}
            key={props.key}
            data-option-name={option}
            onKeyDown={event => {
              if (isComposingKeyEvent(event)) {
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                setNamespaceInput('');
                onChangeFromProps(event as React.ChangeEvent<{}>, [option]);
                setOpen(false);
              }
            }}
            onClick={event => {
              // Click namespace name/row: replace entire selection with option alone and close dropdown
              setNamespaceInput('');
              onChangeFromProps(event as React.ChangeEvent<{}>, [option]);
              setOpen(false);
            }}
          >
            <Checkbox
              icon={<Icon icon="mdi:checkbox-blank-outline" />}
              checkedIcon={<Icon icon="mdi:check-box-outline" />}
              style={{
                color: selected ? theme.palette.primary.main : theme.palette.text.primary,
              }}
              checked={selected}
              inputProps={{
                'aria-label': t('translation|Toggle {{namespace}} in selection', {
                  namespace: option,
                }),
              }}
              title={t('translation|Toggle {{namespace}} in selection', { namespace: option })}
              onClick={event => {
                // Click checkbox: toggle namespace without changing other selections; keep dropdown open
                event.stopPropagation();
                const currentNamespaces = filter.namespaces;
                const newSelection = currentNamespaces.has(option)
                  ? [...currentNamespaces].filter(ns => ns !== option)
                  : [...currentNamespaces, option];
                setNamespaceInput('');
                onChangeFromProps(event as React.ChangeEvent<{}>, newSelection);
              }}
            />
            <Box
              component="span"
              sx={{ flexGrow: 1, cursor: 'pointer' }}
              title={t('translation|Select only {{namespace}}', { namespace: option })}
            >
              {option}
            </Box>
          </li>
        );
      }}
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
        const describedBy = open
          ? [params.inputProps['aria-describedby'], instructionsId].filter(Boolean).join(' ')
          : params.inputProps['aria-describedby'];

        return (
          <Box width="15rem">
            <TextField
              {...params}
              variant="outlined"
              size="small"
              label={t('Namespaces')}
              fullWidth
              InputLabelProps={{ shrink: true }}
              inputProps={{
                ...params.inputProps,
                ...(describedBy ? { 'aria-describedby': describedBy } : {}),
              }}
              style={{ marginTop: 0 }}
              placeholder={[...filter.namespaces.values()].length > 0 ? '' : t('Filter')}
            />
            {open && (
              <Box component="span" id={instructionsId} sx={visuallyHidden}>
                {t(
                  'translation|Press Enter to select only the highlighted namespace, or Space to toggle it in the selection.'
                )}
              </Box>
            )}
          </Box>
        );
      }}
    />
  );
}

export function NamespacesAutocomplete() {
  const history = useHistory();
  const location = useLocation();
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
    addQuery({ namespace: newValue.join(' ') }, { namespace: '' }, history, location, '');
    dispatch(setNamespaceFilter(newValue));
  };

  // A cluster without allowed namespaces still needs its namespaces listed. The allowed
  // ones of the other clusters are added, as their users may not be able to list them.
  return everyClusterLimited ? (
    <PureNamespacesAutocomplete namespaceNames={allowedNames} onChange={onChange} filter={filter} />
  ) : (
    <NamespacesFromClusterAutocomplete
      onChange={onChange}
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
