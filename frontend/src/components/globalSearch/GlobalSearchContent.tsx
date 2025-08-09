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
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useAutocomplete from '@mui/material/useAutocomplete';
import { UseAutocompleteReturnValue } from '@mui/material/useAutocomplete';
import Fuse from 'fuse.js';
import { capitalize } from 'lodash';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { generatePath, useHistory, useLocation, useRouteMatch } from 'react-router';
import { FixedSizeList } from 'react-window';
import { useClustersConf, useSelectedClusters } from '../../lib/k8s';
import ConfigMap from '../../lib/k8s/configMap';
import CronJob from '../../lib/k8s/cronJob';
import Deployment from '../../lib/k8s/deployment';
import Endpoints from '../../lib/k8s/endpoints';
import Ingress from '../../lib/k8s/ingress';
import Job from '../../lib/k8s/job';
import { KubeObject, KubeObjectClass } from '../../lib/k8s/KubeObject';
import Namespace from '../../lib/k8s/namespace';
import Node from '../../lib/k8s/node';
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import Pod from '../../lib/k8s/pod';
import ReplicaSet from '../../lib/k8s/replicaSet';
import Service from '../../lib/k8s/service';
import ServiceAccount from '../../lib/k8s/serviceAccount';
import StatefulSet from '../../lib/k8s/statefulSet';
import { createRouteURL, getDefaultRoutes } from '../../lib/router';
import { getClusterPrefixedPath } from '../../lib/util';
import { useTypedSelector } from '../../redux/hooks';
import { Activity } from '../activity/Activity';
import { ADVANCED_SEARCH_QUERY_KEY } from '../advancedSearch/AdvancedSearch';
import { ThemePreview } from '../App/Settings/ThemePreview';
import { setTheme, useAppThemes } from '../App/themeSlice';
import { KubeObjectDetails } from '../resourceMap/details/KubeNodeDetails';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { Delayed } from './Delayed';
import { useLocalStorageState } from './useLocalStorageState';
import { useRecent } from './useRecent';

const LazyKubeIcon = lazy(() =>
  import('../resourceMap/kubeIcon/KubeIcon').then(it => ({ default: it.KubeIcon }))
);

/**
 * Object representing a single search result
 */
interface SearchResult {
  id: string;
  label: string;
  icon?: JSX.Element;
  subLabel?: string;
  onClick: () => void;
  labelMatch?: { indices: number[][] };
  subLabelMatch?: { indices: number[][] };
}

/**
 * An array of Kubernetes object classes to search through
 */
const classes: KubeObjectClass[] = [
  Pod,
  Deployment,
  Service,
  Job,
  CronJob,
  ConfigMap,
  Namespace,
  StatefulSet,
  ReplicaSet,
  PersistentVolumeClaim,
  Endpoints,
  Ingress,
  ServiceAccount,
  Node,
];

/**
 * Loads lists of Kubernetes objects for searching
 */
function useSearchResources() {
  const inACluster = useSelectedClusters().length > 0;
  const results = classes.map(cls => cls.useList({ clusters: inACluster ? undefined : [] }));

  return useMemo(() => {
    return results.map((result, index) => {
      return {
        isLoading: result.isFetching,
        items: result.items,
        kind: classes[index].kind,
      };
    });
  }, [results.map(it => it.data)]);
}

function makeKubeObjectResults(
  queries: {
    isLoading: boolean;
    items: KubeObject<any>[] | null;
    kind: string;
  }[],
  onClick: (item: KubeObject) => void
) {
  return queries.flatMap(
    ({ items }) =>
      items?.map(item => ({
        id: item.metadata.uid,
        label: item.metadata.name,
        icon: (
          <Suspense fallback={null}>
            <LazyKubeIcon kind={item.kind} width="24px" height="24px" />
          </Suspense>
        ),
        subLabel: item.kind,
        onClick: () => onClick(item),
      })) ?? []
  );
}

/**
 * Global search component
 *
 * Can search:
 *  - Kubernetes objects
 *  - Clusters
 *  - App Pages
 *  - Custom Actions
 */
export function GlobalSearchContent({
  maxWidth,
  defaultValue,
  onBlur,
}: {
  maxWidth: number;
  defaultValue: string;
  onBlur: () => void;
}) {
  const { t } = useTranslation();
  const history = useHistory();
  const [query, setQuery] = useState(defaultValue ?? '');
  const clusters = useClustersConf() ?? {};
  const selectedClusters = useSelectedClusters();
  const drawerEnabled = useTypedSelector(state => state.drawerMode.isDetailDrawerEnabled);

  const [recent, bump] = useRecent('search-recent-items');

  // Resource search items
  const resources = useSearchResources();
  const loading = resources.filter(it => it.isLoading).map(it => it.kind);
  const isMap = useRouteMatch(getClusterPrefixedPath(getDefaultRoutes().map?.path));
  const location = useLocation();
  const items = useMemo(
    () =>
      makeKubeObjectResults(resources, item => {
        const search = new URLSearchParams(location.search);
        search.set('node', item.metadata.uid);
        const url = isMap
          ? createRouteURL('map') + `?` + search
          : createRouteURL(item.kind, {
              name: item.metadata.name,
              namespace: item.metadata.namespace,
            });

        if (drawerEnabled) {
          Activity.launch({
            id: item.metadata.uid,
            content: <KubeObjectDetails resource={item} />,
            hideTitleInHeader: true,
            cluster: item.cluster,
            location: 'split-right',
            title: item.kind + ': ' + item.metadata.name,
            icon: <KubeIcon kind={item.kind} width="100%" height="100%" />,
          });
        } else {
          history.push(url);
        }
      }),
    [resources, isMap, location.search]
  );

  // Cluster items
  const clusterItems: SearchResult[] = useMemo(
    () =>
      Object.keys(clusters).map(cluster => ({
        id: cluster,
        label: cluster,
        subLabel: 'Cluster',
        icon: <Icon icon="mdi:hexagon-multiple-outline" />,
        onClick: () =>
          history.push({
            pathname: generatePath(getClusterPrefixedPath(), {
              cluster: cluster,
            }),
          }),
      })),
    []
  );

  // Routes items
  const storeRoutes = useTypedSelector(state => state.routes.routes);
  const routeFilters = useTypedSelector(state => state.routes.routeFilters);
  const defaultRoutes = Object.entries(getDefaultRoutes());
  const filteredRoutes = Object.entries(storeRoutes)
    .concat(defaultRoutes)
    .filter(
      ([, route]) =>
        !(
          routeFilters.length > 0 &&
          routeFilters.filter(f => f(route)).length !== routeFilters.length
        ) && !route.disabled
    );
  const routes: SearchResult[] = useMemo(
    () =>
      filteredRoutes
        .filter(([, route]) => route.name && !route.path.includes(':'))
        .filter(([key, route]) => {
          const clusterRoute = route.useClusterURL ?? true;
          // settingsCluster is an old route that is just a redirect and shouldn't be included in the search results
          if (key === 'settingsCluster') {
            return false;
          }
          return clusterRoute ? selectedClusters.length > 0 : true;
        })
        .map(([name, route]) => ({
          id: route.path,
          label: route.name!,
          subLabel: t('Page'),
          onClick: () => {
            history.push(createRouteURL(name));
          },
        })),
    [location.pathname, history, selectedClusters]
  );

  // Themes
  const dispatch = useDispatch();
  const appThemes = useAppThemes();
  const themeActions = useMemo(() => {
    return appThemes.map(theme => ({
      id: 'switch-theme-' + theme.name,
      subLabel: 'Theme',
      icon: <ThemePreview theme={theme} size={32} />,
      label: capitalize(theme.name),
      onClick: () => dispatch(setTheme(theme.name)),
    }));
  }, [appThemes]);

  // Advanced Search
  const advancedSearchSuggestion = useMemo(() => {
    if (!query.trim() || selectedClusters.length === 0) return;
    return {
      id: 'advanced-search-suggestion',
      subLabel: t('Advanced Search (Beta)'),
      icon: <Icon icon="mdi:search" />,
      label: `Search "${query}" with Advanced Search`,
      onClick: () => {
        // Set the search query in localStorage for the Advanced Search
        useLocalStorageState.update(ADVANCED_SEARCH_QUERY_KEY, `metadata.name === "${query}"`);

        const params = new URLSearchParams(history.location.search);
        history.push(createRouteURL('advancedSearch') + '?' + params.toString());
      },
    };
  }, [query, selectedClusters]);

  const allOptions = useMemo(
    () =>
      [...themeActions, ...clusterItems, ...routes, ...items, advancedSearchSuggestion].filter(
        Boolean
      ) as SearchResult[],
    [themeActions, clusterItems, routes, items, advancedSearchSuggestion]
  );

  const fuse = useMemo(
    () =>
      new Fuse(allOptions, {
        keys: [
          'label',
          // We also want to search by subLabel sometimes
          // For example 'default namespace' (there are a lot of objects with 'default' name)
          // But it shouldn't be main field so it has half the weight (1/2)
          { name: 'subLabel', weight: 0.5 },
        ],
        includeMatches: true,
      }),
    [allOptions]
  );

  const results: SearchResult[] = useMemo(() => {
    if (!query) return [];
    return fuse.search(query, { limit: 100 }).map(
      ({ item, matches }) =>
        ({
          ...item,
          labelMatch: matches?.find(it => it.key === 'label'),
          subLabelMatch: matches?.find(it => it.key === 'subLabel'),
        } as any)
    );
  }, [query, fuse]);

  const recentItems = useMemo(() => {
    if (query) return [];

    return allOptions.filter(it => recent[it.id]).sort((a, b) => recent[b.id] - recent[a.id]);
  }, [recent, results, query]);

  const autocomplete = useAutocomplete<SearchResult, false, false, true>({
    options: !query ? recentItems : results,
    freeSolo: true, // free user input, not just autocomplete options
    autoHighlight: true, // highlight first option on open
    openOnFocus: true,
    disableListWrap: true, // wrapping doesn't work with virtualized list
    filterOptions: options => options, // we handle filtering ourself
    onHighlightChange(_, option, reason) {
      if (reason === 'keyboard' && option) {
        const index = results.indexOf(option);
        const list = listRef.current;
        list?.scrollToItem(index);
      }
    },
    inputValue: query,
    onInputChange: (_, value) => {
      setQuery(value);
    },
    onChange: (_, value) => {
      if (value && typeof value !== 'string') {
        bump(value.id);
        value.onClick();
      }
    },
    onClose: onBlur,
  });

  const listRef = useRef<FixedSizeList>(null);

  return (
    <Box {...autocomplete.getRootProps()}>
      <TextField
        fullWidth
        size="small"
        variant="outlined"
        placeholder={t('Search resources, pages, clusters by name')}
        InputProps={
          {
            ...autocomplete.getInputProps(),
            ref: (el: HTMLDivElement) => {
              const ac = autocomplete as any; // some types are wrong
              ac.setAnchorEl(el);
            },
            inputRef: (el: HTMLInputElement) => {
              const ac = autocomplete as any; // some types are wrong
              ac.getInputProps().ref.current = el;
            },
            // autocomplete by default closes when clicking on input
            // https://github.com/mui/material-ui/blob/master/packages/mui-base/src/useAutocomplete/useAutocomplete.js#L1004
            // this is suboptimal and doesn't fit for the search UX
            // so we're overriding onMouseDown for our own that doesn't do anything
            onMouseDown: () => {},
            defaultValue,
            autoFocus: true,
            endAdornment: (
              <>
                {loading.length > 0 && (
                  <Delayed display="flex" mr={1}>
                    <CircularProgress size="16px" />
                  </Delayed>
                )}
              </>
            ),
            sx: (theme: any) => ({
              background: theme.palette.background.default,
            }),
          } as any
        }
      />
      <Popper
        anchorEl={autocomplete.anchorEl}
        open={autocomplete.popupOpen}
        sx={theme => ({ zIndex: theme.zIndex.modal, width: '100%', maxWidth: maxWidth + 'px' })}
      >
        <Paper
          component="ul"
          variant="outlined"
          sx={{ position: 'relative', padding: 0, margin: 0 }}
          {...autocomplete.getListboxProps()}
        >
          {autocomplete.groupedOptions.length > 0 && (
            <FixedSizeList
              ref={listRef}
              height={Math.min(10, autocomplete.groupedOptions.length) * 50}
              itemCount={autocomplete.groupedOptions.length}
              itemData={autocomplete}
              itemSize={50}
              width={'100%'}
            >
              {SearchRow}
            </FixedSizeList>
          )}
        </Paper>
      </Popper>
    </Box>
  );
}

function HighlightText({ text, match }: { text?: string; match?: { indices: number[][] } }) {
  if (!text) return null;
  if (!match) return <>{text}</>;

  const parts = [];

  let lastIndex = 0;

  match.indices.forEach(([start, end]) => {
    parts.push(text.substring(lastIndex, start));
    parts.push(<span style={{ fontWeight: 'bold' }}>{text.substring(start, end + 1)}</span>);
    lastIndex = end + 1;
  });

  parts.push(text.substring(lastIndex, text.length));

  return <>{parts}</>;
}

/**
 * Renders a single search result row
 */
function SearchRow({
  data,
  style,
  index,
}: {
  data: UseAutocompleteReturnValue<SearchResult, false, false, true>;
  style: any;
  index: number;
}) {
  const autocomplete = data;
  const option = autocomplete.groupedOptions[index] as SearchResult;

  return (
    <Box
      {...autocomplete.getOptionProps({ option, index })}
      key={option.id}
      sx={theme => ({
        display: 'flex',
        padding: '8px !important',
        alignItems: 'center',
        lineHeight: 1,
        overflow: 'hidden',
        '&.Mui-focused': {
          backgroundColor:
            theme.palette.mode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
        },
      })}
      style={style}
      component="li"
    >
      <Box width="32px" display="flex" alignItems="center" justifyContent="center">
        {option?.icon ?? null}
      </Box>
      <Box
        display="flex"
        justifyContent="center"
        flexDirection="column"
        ml={1}
        mr="auto"
        overflow="hidden"
      >
        <Typography variant="caption" sx={{ opacity: 0.8 }}>
          <HighlightText text={option.subLabel} match={option.subLabelMatch} />
        </Typography>
        <Box sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
          <HighlightText text={option.label} match={option.labelMatch} />
        </Box>
      </Box>
    </Box>
  );
}
