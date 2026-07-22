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
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useAutocomplete from '@mui/material/useAutocomplete';
import { UseAutocompleteReturnValue } from '@mui/material/useAutocomplete';
import Fuse, { Expression, FuseResultMatch } from 'fuse.js';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { generatePath, useHistory, useLocation, useRouteMatch } from 'react-router';
import { FixedSizeList } from 'react-window';
import { loadClusterSettings } from '../../helpers/clusterSettings';
import { useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { KubeObject, KubeObjectClass } from '../../lib/k8s/KubeObject';
import type Namespace from '../../lib/k8s/namespace';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { getDefaultRoutes } from '../../lib/router/getDefaultRoutes';
import { getClusterPrefixedPath } from '../../lib/util';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';
import { setShortcutsDialogOpen } from '../../redux/shortcutsSlice';
import { Activity } from '../activity/Activity';
import { ADVANCED_SEARCH_QUERY_KEY } from '../advancedSearch/AdvancedSearch';
import { ThemePreview } from '../App/Settings/ThemePreview';
import { setTheme, useAppThemes } from '../App/themeSlice';
import { LightTooltip } from '../common/Tooltip';
import { KubeObjectDetails } from '../resourceMap/details/KubeNodeDetails';
import { Delayed } from './Delayed';
import { loadSearchResourceClasses } from './searchResourceClasses';
import { useLocalStorageState } from './useLocalStorageState';
import { useRecent } from './useRecent';

const LazyKubeIcon = lazy(() =>
  import('../resourceMap/kubeIcon/KubeIcon').then(it => ({ default: it.KubeIcon }))
);

const NAMESPACE_KIND = 'Namespace';
const MAX_RESOURCE_CLASS_LOAD_ATTEMPTS = 5;
const LOAD_RETRY_DELAY_MS = 3000;
const NO_SELECTED_CLUSTERS: string[] = [];

/**
 * Object representing a single search result
 */
interface SearchResult {
  id: string;
  label: string;
  icon?: JSX.Element;
  subLabel?: string;
  namespace?: string;
  kind?: string;
  k8sLabels?: string[];
  onClick: () => void;
  labelMatch?: FuseResultMatch;
  subLabelMatch?: FuseResultMatch;
  k8sLabelsMatch?: FuseResultMatch;
  namespaceMatch?: FuseResultMatch;
}

interface GlobalSearchContentProps {
  /** The maximum width of the results list. */
  maxWidth: number;
  /** The initial search query to display in the search field. */
  defaultValue: string;
  /** Callback called when the search field loses focus. */
  onBlur: () => void;
}

/**
 * The `GlobalSearchContent` component provides the search field and results list for global search.
 * Resource class modules are loaded on demand so opening search does not bundle every list model
 * in the initial chunk.
 */
export function GlobalSearchContent(props: GlobalSearchContentProps) {
  const [resourceClasses, setResourceClasses] = useState<KubeObjectClass[] | null>(null);
  const [queryDraft, setQueryDraft] = useState(props.defaultValue ?? '');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    loadSearchResourceClasses()
      .then(classes => {
        if (!cancelled) {
          setLoadFailed(false);
          setResourceClasses(classes);
        }
      })
      .catch(error => {
        if (cancelled) {
          return;
        }
        console.error('Failed to load global search resource classes', error);
        if (loadAttempt + 1 >= MAX_RESOURCE_CLASS_LOAD_ATTEMPTS) {
          setLoadFailed(true);
          return;
        }
        retryTimer = setTimeout(() => {
          setLoadAttempt(attempt => attempt + 1);
        }, LOAD_RETRY_DELAY_MS);
      });

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [loadAttempt]);

  if (!resourceClasses) {
    return (
      <GlobalSearchContentPlaceholder
        {...props}
        query={queryDraft}
        onQueryChange={setQueryDraft}
        loadFailed={loadFailed}
      />
    );
  }

  return (
    <GlobalSearchContentLoaded
      {...props}
      resourceClasses={resourceClasses}
      initialQuery={queryDraft}
    />
  );
}

interface GlobalSearchContentPlaceholderProps extends GlobalSearchContentProps {
  query: string;
  onQueryChange: (value: string) => void;
  loadFailed?: boolean;
}

/** Loading / error UI while searchable resource classes are being loaded. */
export function GlobalSearchContentPlaceholder(props: GlobalSearchContentPlaceholderProps) {
  const { onBlur, query, onQueryChange, loadFailed } = props;
  const { t } = useTranslation();

  return (
    <TextField
      fullWidth
      size="small"
      variant="outlined"
      placeholder={t('Search resources, pages, clusters by name')}
      value={query}
      onChange={event => onQueryChange(event.target.value)}
      onBlur={onBlur}
      helperText={
        loadFailed
          ? t('Unable to load search resources. Refresh the page and try again.')
          : undefined
      }
      error={loadFailed}
      InputProps={{
        autoFocus: true,
        sx: theme => ({
          background: theme.palette.background.default,
        }),
        endAdornment: loadFailed ? undefined : (
          <Delayed display="flex" mr={1}>
            <CircularProgress size="16px" />
          </Delayed>
        ),
      }}
    />
  );
}

interface GlobalSearchContentLoadedProps extends GlobalSearchContentProps {
  resourceClasses: KubeObjectClass[];
  initialQuery: string;
}

/**
 * Loads lists of Kubernetes objects for searching
 */
function useSearchResources(resourceClasses: KubeObjectClass[]) {
  const inACluster = useSelectedClusters().length > 0;
  const results = resourceClasses.map(cls =>
    cls.useList({ clusters: inACluster ? undefined : NO_SELECTED_CLUSTERS })
  );

  // Depend on fetch flags and item list identities (not `results`, which is a new
  // array every render) so the returned resources array stays referentially stable.
  const resourceDeps = results.flatMap(result => [result.isFetching, result.items]);

  return useMemo(
    () =>
      results.map((result, index) => ({
        isLoading: result.isFetching,
        items: result.items,
        kind: resourceClasses[index].kind,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resourceDeps tracks isFetching/items
    [resourceClasses, ...resourceDeps]
  );
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
        k8sLabels: item.metadata.labels
          ? Object.entries(item.metadata.labels).map(([key, value]) => key + '=' + value)
          : [],
        icon: (
          <Suspense fallback={null}>
            <LazyKubeIcon kind={item.kind} width="24px" height="24px" />
          </Suspense>
        ),
        kind: item.kind,
        namespace: item.metadata.namespace,
        subLabel: item.metadata.namespace ? `${item.kind} • ${item.metadata.namespace}` : item.kind,
        onClick: () => onClick(item),
      })) ?? []
  );
}

function GlobalSearchContentLoaded(props: GlobalSearchContentLoadedProps) {
  const { maxWidth, onBlur, resourceClasses, initialQuery } = props;
  const { t } = useTranslation();
  const history = useHistory();
  const dispatch = useDispatch();
  const [query, setQuery] = useState(initialQuery);
  const clusters = useClustersConf() ?? {};
  const selectedClusters = useSelectedClusters();
  const drawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);

  const [recent, bump] = useRecent('search-recent-items');

  // Resource search items
  const resources = useSearchResources(resourceClasses);
  const loading = resources.filter(it => it.isLoading).map(it => it.kind);
  const namespaceItems = useMemo(() => {
    const namespaceResource = resources.find(resource => resource.kind === NAMESPACE_KIND);
    return (namespaceResource?.items as Namespace[]) ?? [];
  }, [resources]);
  const namespaceOptions = useMemo(() => {
    const knownNamespaces = new Set<string>(
      [
        ...namespaceItems.map(n => n.metadata.name),
        ...selectedClusters.flatMap(c => loadClusterSettings(c)?.allowedNamespaces ?? []),
      ].filter(Boolean)
    );

    const options: SearchResult[] = [];
    const addedOptionIds = new Set<string>();

    const addOption = (namespaceValue: string) => {
      if (!namespaceValue || /\s/.test(namespaceValue)) {
        return;
      }
      const id = `set-namespace-${namespaceValue}`;
      if (addedOptionIds.has(id)) {
        return;
      }
      addedOptionIds.add(id);

      options.push({
        id,
        subLabel: t('translation|Current Namespace'),
        label: t('translation|Set namespace: {{namespace}}', { namespace: namespaceValue }),
        icon: (
          <Suspense fallback={null}>
            <LazyKubeIcon kind="Namespace" width="24px" height="24px" />
          </Suspense>
        ),
        onClick: () => {
          dispatch(setNamespaceFilter([namespaceValue]));
        },
      });
    };

    const trimmedQuery = query.trim();
    if (trimmedQuery.length > 0) {
      addOption(trimmedQuery);
    }

    Array.from(knownNamespaces)
      .sort((a, b) => a.localeCompare(b))
      .forEach(addOption);

    return options;
  }, [query, selectedClusters, namespaceItems, dispatch, t]);
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
            icon: (
              <Suspense fallback={null}>
                <LazyKubeIcon kind={item.kind} width="100%" height="100%" />
              </Suspense>
            ),
          });
        } else {
          history.push(url);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [location.pathname, history, selectedClusters]
  );

  // Themes
  const appThemes = useAppThemes();
  const themeActions = useMemo(() => {
    return appThemes.map(theme => ({
      id: 'switch-theme-' + theme.name,
      subLabel: 'Theme',
      icon: <ThemePreview theme={theme} size={32} />,
      label: theme.name,
      onClick: () => dispatch(setTheme(theme.name)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedClusters]);
  const configureShortcutsAction: SearchResult = useMemo(
    () => ({
      id: 'configure-shortcuts',
      subLabel: t('Settings'),
      icon: <Icon icon="mdi:keyboard-settings-outline" />,
      label: t('Configure Keyboard Shortcuts'),
      onClick: () => {
        dispatch(setShortcutsDialogOpen(true));
        onBlur();
      },
    }),
    [dispatch, t, onBlur]
  );

  const allOptions = useMemo(
    () =>
      [
        configureShortcutsAction,
        ...themeActions,
        ...clusterItems,
        ...routes,
        ...namespaceOptions,
        ...items,
        advancedSearchSuggestion,
      ].filter(Boolean) as SearchResult[],
    [
      configureShortcutsAction,
      themeActions,
      clusterItems,
      routes,
      namespaceOptions,
      items,
      advancedSearchSuggestion,
    ]
  );

  const fuse = useMemo(
    () =>
      new Fuse(allOptions, {
        keys: [
          'label',
          'k8sLabels',
          'namespace',
          'kind',
          // We also want to search by subLabel sometimes
          // For example 'default namespace' (there are a lot of objects with 'default' name)
          // But it shouldn't be main field so it has half the weight (1/2)
          { name: 'subLabel', weight: 0.5 },
        ],
        includeMatches: true,
        threshold: 0.3, // lower threshold to reduce false positives
      }),
    [allOptions]
  );

  const results: SearchResult[] = useMemo(() => {
    if (!query.trim()) return [];
    return (
      fuse
        .search(
          {
            // Construct logical query https://www.fusejs.io/api/query.html
            // Improves search for space separated terms
            $and: (() => {
              const terms = query.split(' ').filter(Boolean);
              return terms.map(it => ({
                $or: [
                  { label: it },
                  it.includes('=') ? { k8sLabels: it } : undefined,
                  { kind: it },
                  { subLabel: it },
                  // Only match on namespace when combined with another term
                  // (e.g. "coredns kube-system"). Bare single-term matches that
                  // only hit via subLabel or namespace are filtered out below,
                  // since subLabel embeds the namespace as display text (e.g.
                  // "Pod • kube-system") which would otherwise flood every
                  // resource in a namespace.
                  terms.length > 1 ? { namespace: it } : undefined,
                ].filter(Boolean) as Expression[],
              }));
            })(),
          },
          { limit: 100 }
        )

        // For a bare single-term query on a namespaced resource, drop
        // results that only matched via subLabel or namespace — that's
        // namespace text leaking through (e.g. "Pod • kube-system" contains
        // "kube-system"), which would otherwise flood every resource in a
        // namespace. Non-namespaced entries (Theme, Settings, Cluster, Page)
        // never hit this path, since they have no namespace field and rely
        // on subLabel as their only searchable text.
        .filter(({ item, matches }) => {
          const terms = query.split(' ').filter(Boolean);
          if (terms.length > 1) return true;
          if (!item.namespace) return true;
          return (
            matches?.some(m => m.key === 'label' || m.key === 'kind' || m.key === 'k8sLabels') ??
            false
          );
        })
        .map(
          ({ item, matches }) =>
            ({
              ...item,
              labelMatch: matches?.find(it => it.key === 'label'),
              subLabelMatch: matches?.find(it => it.key === 'subLabel'),
              k8sLabelsMatch: matches?.find(it => it.key === 'k8sLabels'),
              namespaceMatch: matches?.find(it => it.key === 'namespace'),
            } satisfies SearchResult)
        )
    );
  }, [query, fuse]);

  const recentItems = useMemo(() => {
    if (query) return [];

    return allOptions.filter(it => recent[it.id]).sort((a, b) => recent[b.id] - recent[a.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            autoFocus: true,
            endAdornment: (
              <>
                <Tooltip title={<Trans>Clear</Trans>} sx={{ opacity: query.length ? 1 : 0 }}>
                  <IconButton onClick={() => setQuery('')} aria-label={t('Clear')} size="small">
                    <Icon icon="mdi:close" />
                  </IconButton>
                </Tooltip>
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

function HighlightText({ text, match }: { text?: string; match?: FuseResultMatch }) {
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
        cursor: 'pointer',
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
      {option.k8sLabelsMatch && option.k8sLabelsMatch.value && (
        <LightTooltip title={option.k8sLabelsMatch.value}>
          <Typography
            sx={theme => ({
              color: theme.palette.text.primary,
              borderRadius: theme.shape.borderRadius + 'px',
              backgroundColor: theme.palette.background.muted,
              border: '1px solid',
              borderColor: theme.palette.divider,
              fontSize: theme.typography.pxToRem(14),
              wordBreak: 'break-word',
              paddingTop: 0.25,
              paddingBottom: 0.25,
              paddingLeft: 0.5,
              paddingRight: 0.5,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              overflowWrap: 'anywhere',
              textOverflow: 'ellipsis',
              maxWidth: '220px',
            })}
          >
            <HighlightText text={option.k8sLabelsMatch.value} match={option.k8sLabelsMatch} />
          </Typography>
        </LightTooltip>
      )}
    </Box>
  );
}
