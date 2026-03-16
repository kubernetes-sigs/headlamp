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
import Editor from '@monaco-editor/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid, { GridProps } from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Input, { InputProps } from '@mui/material/Input';
import InputLabel from '@mui/material/InputLabel';
import Paper from '@mui/material/Paper';
import { BaseTextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/system';
import { Location } from 'history';
import { Base64 } from 'js-base64';
import { JSONPath } from 'jsonpath-plus';
import _, { ceil, has } from 'lodash';
import { useSnackbar } from 'notistack';
import React, { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, NavLinkProps, useLocation } from 'react-router-dom';
import YAML from 'yaml';
import { labelSelectorToQuery, ResourceClasses, useCluster } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { KubeCondition, KubeContainer, KubeContainerStatus } from '../../../lib/k8s/cluster';
import ConfigMap from '../../../lib/k8s/configMap';
import { KubeEvent } from '../../../lib/k8s/event';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { KubeObjectClass } from '../../../lib/k8s/KubeObject';
import Pod, { KubePod, KubeVolume } from '../../../lib/k8s/pod';
import { METRIC_REFETCH_INTERVAL_MS, PodMetrics } from '../../../lib/k8s/PodMetrics';
import Secret from '../../../lib/k8s/secret';
import { RouteURLProps } from '../../../lib/router';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { getThemeName } from '../../../lib/themes';
import { divideK8sResources } from '../../../lib/units';
import { localeDate, useId } from '../../../lib/util';
import { HeadlampEventType, useEventCallback } from '../../../redux/headlampEventSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { useHasPreviousRoute } from '../../App/RouteSwitcher';
import { SectionBox } from '../../common/SectionBox';
import SimpleTable, { NameValueTable } from '../../common/SimpleTable';
import {
  DefaultDetailsViewSection,
  DetailsViewSection,
} from '../../DetailsViewSection/detailsViewSectionSlice';
import { PodListProps, PodListRenderer } from '../../pod/List';
import { LightTooltip, Loader, ObjectEventList } from '..';
import BackLink from '../BackLink';
import Empty from '../EmptyContent';
import ErrorBoundary from '../ErrorBoundary';
import InnerTable from '../InnerTable';
import { DateLabel, HoverInfoLabel, StatusLabel, StatusLabelProps, ValueLabel } from '../Label';
import Link, { LinkProps } from '../Link';
import { metadataStyles } from '.';
import { MainInfoSection, MainInfoSectionProps } from './MainInfoSection/MainInfoSection';
import { MainInfoHeader } from './MainInfoSection/MainInfoSectionHeader';
import { MetadataDictGrid, MetadataDisplay } from './MetadataDisplay';
import PortForward from './PortForward';

export { MainInfoSection };
export type { MainInfoSectionProps };

export interface ResourceLinkProps extends Omit<LinkProps, 'routeName' | 'params'> {
  name?: string;
  routeName?: string;
  routeParams?: RouteURLProps;
  resource: KubeObject<any>;
}

export function ResourceLink(props: ResourceLinkProps) {
  const {
    resource,
    routeName = props.resource.kind,
    routeParams = { ...props.resource.metadata } as RouteURLProps,
    name = props.resource.metadata.name,
    state,
  } = props;

  if (!!resource.cluster) {
    routeParams.cluster = resource.cluster;
  }

  return (
    <Link routeName={routeName} params={routeParams} state={state}>
      {name}
    </Link>
  );
}

export interface DetailsGridProps<T extends KubeObjectClass>
  extends PropsWithChildren<Omit<MainInfoSectionProps<InstanceType<T>>, 'resource'>> {
  /** Resource type to fetch (from the ResourceClasses). */
  resourceType: T;
  /** Name of the resource. */
  name: string;
  /** Namespace of the resource. If not provided, it's assumed the resource is not namespaced. */
  namespace?: string;
  /** Name of the cluster of the resource */
  cluster?: string;
  /** Sections to show in the details grid (besides the default ones). */
  extraSections?:
    | ((item: InstanceType<T>) => boolean | DetailsViewSection[] | ReactNode[])
    | boolean
    | DetailsViewSection[];
  /** @deprecated Use extraSections instead. */
  sectionsFunc?: (item: InstanceType<T>) => React.ReactNode | DetailsViewSection[];
  /** If true, will show the events section. */
  withEvents?: boolean;
  /** Called when the resource instance is created/updated, or there is an error. */
  onResourceUpdate?: (resource: InstanceType<T>, error: ApiError) => void;
}

/** Renders the different parts that constibute an actual resource's details view.
 * Those are: the back link, the header, the main info section, the extra sections, and the events section.
 */
export function DetailsGrid<T extends KubeObjectClass>(props: DetailsGridProps<T>) {
  const {
    sectionsFunc,
    resourceType,
    name,
    namespace,
    cluster,
    children,
    withEvents,
    extraSections,
    onResourceUpdate,
    ...otherMainInfoSectionProps
  } = props;
  const selectedCluster = useCluster();
  const { t } = useTranslation();
  const location = useLocation<{ backLink: NavLinkProps['location'] }>();
  const hasPreviousRoute = useHasPreviousRoute();
  const detailViews = useTypedSelector(state => state.detailsViewSection.detailsViewSections);
  const detailViewsProcessors = useTypedSelector(
    state => state.detailsViewSection.detailsViewSectionsProcessors
  );
  const dispatchHeadlampEvent = useEventCallback();

  // This component used to have a MainInfoSection with all these props passed to it, so we're
  // using them to accomplish the same behavior.
  const { extraInfo, actions, noDefaultActions, headerStyle, backLink, title, headerSection } =
    otherMainInfoSectionProps;

  const [item, error] = resourceType.useGet(name, namespace, {
    cluster: cluster ?? selectedCluster ?? undefined,
  }) as [InstanceType<T> | null, ApiError | null];
  const prevItemRef = React.useRef<{ uid?: string; version?: string; error?: ApiError | null }>({});

  React.useEffect(() => {
    if (item) {
      dispatchHeadlampEvent({
        type: HeadlampEventType.DETAILS_VIEW,
        data: {
          title: item?.jsonData.kind,
          resource: item,
          error: error || undefined,
        },
      });
    }
  }, [item]);

  React.useEffect(() => {
    // We cannot call this callback more than once on each version of the item, in order to avoid
    // infinite loops.
    const prevItem = prevItemRef.current;
    if (
      prevItem?.uid === item?.metadata?.uid &&
      prevItem?.version === item?.metadata?.resourceVersion &&
      error === prevItem.error
    ) {
      return;
    }

    prevItemRef.current = {
      uid: item?.metadata?.uid,
      version: item?.metadata?.resourceVersion,
      error,
    };
    onResourceUpdate?.(item as InstanceType<T>, error!);
  }, [item, error]);

  const actualBackLink: string | Location | undefined = React.useMemo(() => {
    if (!!backLink || backLink === '') {
      return backLink;
    }

    const stateLink = location.state?.backLink || null;
    if (!!stateLink) {
      return generatePath(stateLink.pathname);
    }

    if (!!hasPreviousRoute) {
      // Will make it go back to the previous route
      return '';
    }

    let route;

    if (!!item) {
      route = item.listRoute;
    } else {
      try {
        route = new resourceType({} as any).listRoute;
      } catch (err) {
        console.error(
          `Error creating route for details grid (resource type=${resourceType}): ${err}`
        );

        // Let the MainInfoSection handle it.
        return undefined;
      }
    }

    return createRouteURL(route);
  }, [item]);

  const sections: (DetailsViewSection | ReactNode)[] = [];

  // Back link
  if (!!actualBackLink || actualBackLink === '') {
    sections.push({
      id: DefaultDetailsViewSection.BACK_LINK,
      section: <BackLink to={actualBackLink} />,
    });
  }

  // Title / Header
  sections.push({
    id: DefaultDetailsViewSection.MAIN_HEADER,
    section: (
      <MainInfoHeader
        title={title}
        resource={item}
        actions={actions}
        noDefaultActions={noDefaultActions}
        headerStyle={headerStyle}
      />
    ),
  });

  // Error / Loading or Metadata
  if (item === null) {
    sections.push(
      !!error
        ? {
            id: DefaultDetailsViewSection.ERROR,
            section: (
              <Paper variant="outlined">
                <Empty color="error">{error.toString()}</Empty>
              </Paper>
            ),
          }
        : {
            id: DefaultDetailsViewSection.LOADING,
            section: <Loader title={t('translation|Loading resource data')} />,
          }
    );
  } else {
    const mainInfoHeader =
      typeof headerSection === 'function' ? headerSection(item) : headerSection;
    sections.push({
      id: DefaultDetailsViewSection.METADATA,
      section: (
        <SectionBox aria-busy={item === null} aria-live="polite">
          {mainInfoHeader}
          <MetadataDisplay resource={item} extraRows={extraInfo} />
        </SectionBox>
      ),
    });
  }

  // Other sections
  if (!!sectionsFunc) {
    console.info(
      `Using legacy sectionsFunc in DetailsGrid for ${
        title || resourceType + '/' + namespace + '/' + name
      }. Please use the children, or set up a details view processor.`
    );
    sections.push({
      id: 'LEGACY_SECTIONS_FUNC',
      section: sectionsFunc(item!) as any,
    });
  }

  if (!!extraSections) {
    let actualExtraSections: (DetailsViewSection | ReactNode)[] = [];
    if (Array.isArray(extraSections)) {
      actualExtraSections = extraSections;
    } else if (typeof extraSections === 'function') {
      const extraSectionsResult = extraSections(item!) || [];
      if (Array.isArray(extraSectionsResult)) {
        actualExtraSections = extraSectionsResult;
      }
    }

    sections.push(...actualExtraSections);
  }

  // Children
  if (!!children) {
    sections.push({
      id: DefaultDetailsViewSection.CHILDREN,
      section: children,
    });
  }

  // Plugin appended details views
  if (!!detailViews) {
    sections.push(...detailViews);
  }

  // Events
  if (withEvents && item) {
    sections.push({
      id: DefaultDetailsViewSection.EVENTS,
      section: <ObjectEventList object={item} />,
    });
  }

  let sectionsProcessed = [...sections];
  for (const detailViewsProcessor of detailViewsProcessors) {
    let processorsSections = sectionsProcessed;
    try {
      processorsSections = detailViewsProcessor.processor(item, sectionsProcessed);
      if (!Array.isArray(processorsSections)) {
        throw new Error(`Invalid return value: ${processorsSections}`);
      }
    } catch (err) {
      console.error(
        `Error processing details view sections for ${resourceType}/${namespace}/${name}: ${err}`
      );

      continue;
    }

    sectionsProcessed = processorsSections;
  }

  return (
    <PageGrid
      sx={theme => ({
        marginBottom: theme.spacing(2),
      })}
    >
      {React.Children.toArray(
        sectionsProcessed.map(section => {
          const Section = has(section, 'section')
            ? (section as DetailsViewSection).section
            : section;
          if (React.isValidElement(Section)) {
            return <ErrorBoundary>{Section}</ErrorBoundary>;
          } else if (Section === null) {
            return null;
          } else if (typeof Section === 'function') {
            return (
              <ErrorBoundary>
                <Section resource={item} />
              </ErrorBoundary>
            );
          }
        })
      )}
    </PageGrid>
  );
}

export interface PageGridProps extends GridProps {
  sections?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageGrid(props: PageGridProps) {
  const { sections = [], children = [], ...other } = props;
  const childrenArray = React.Children.toArray(children).concat(React.Children.toArray(sections));
  return (
    <Grid container spacing={1} justifyContent="flex-start" alignItems="stretch" {...other}>
      {childrenArray.map((section, i) => (
        <Grid item key={i} xs={12}>
          <Box mt={[4, 0, 0]}>{section}</Box>
        </Grid>
      ))}
    </Grid>
  );
}

export interface SectionGridProps {
  items: React.ReactNode[];
  useDivider?: boolean;
}

export function SectionGrid(props: SectionGridProps) {
  const { items } = props;
  return (
    <Grid container justifyContent="space-between">
      {items.map((item, i) => {
        return (
          <Grid item md={12} xs={12} key={i}>
            {item}
          </Grid>
        );
      })}
    </Grid>
  );
}

export interface DataFieldProps extends BaseTextFieldProps {
  disableLabel?: boolean;
  onSave?: (newValue: string) => void;
  onChange?: (newValue: string) => void;
}

export function DataField(props: DataFieldProps) {
  const { disableLabel, label, value, onSave, onChange } = props;
  // Make sure we reload after a theme change
  useTheme();
  const themeName = getThemeName();

  const [data, setData] = React.useState(value as string);

  const handleChange = (newValue: string | undefined) => {
    if (newValue !== undefined) {
      setData(newValue);
      onChange?.(newValue);
    }
  };

  function handleEditorDidMount(editor: any) {
    const editorElement: HTMLElement | null = editor.getDomNode();
    if (!editorElement) {
      return;
    }

    const lineCount = editor.getModel()?.getLineCount() || 1;
    if (lineCount < 2) {
      editorElement.style.height = '3vh';
    } else if (lineCount <= 10) {
      editorElement.style.height = '10vh';
    } else {
      editorElement.style.height = '40vh';
    }
    editor.layout();
  }
  let language = (label as string).split('.').pop() as string;
  if (language !== 'json') {
    language = 'yaml';
  }

  const editorComponent = (
    <Editor
      value={data}
      language={language}
      onChange={handleChange}
      onMount={handleEditorDidMount}
      options={{ lineNumbers: 'off', automaticLayout: true }}
      theme={themeName === 'dark' ? 'vs-dark' : 'light'}
    />
  );

  const content = (
    <Box borderTop={0} border={1}>
      {!disableLabel && (
        <Box display="flex">
          <Box width="10%" borderTop={1} height={'1px'}></Box>
          <Box pb={1} mt={-1} px={0.5}>
            <InputLabel>{label}</InputLabel>
          </Box>
          <Box width="100%" borderTop={1} height={'1px'}></Box>
        </Box>
      )}
      <Box mt={1} px={1} pb={1}>
        {editorComponent}
      </Box>
    </Box>
  );

  return (
    <Box>
      {content}
      {onSave && (
        <Box mt={1} display="flex" justifyContent="flex-end">
          <Button variant="contained" color="primary" onClick={() => onSave && onSave(data)}>
            Save
          </Button>
        </Box>
      )}
    </Box>
  );
}

export interface SecretFieldProps extends InputProps {
  nameID?: string;
}

export function SecretField(props: SecretFieldProps) {
  const { value, nameID, ...other } = props;
  const [showPassword, setShowPassword] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const { t } = useTranslation();

  const secret = String(value ?? '');

  function handleClickShowPassword() {
    setShowPassword(!showPassword);
  }

  async function onCopy() {
    if (!secret) {
      return;
    }

    try {
      // Copy the decoded value
      await navigator.clipboard.writeText(Base64.decode(secret));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error(`Error copying secret to clipboard: ${err}`);
    }
  }

  const tooltipTitle = copied ? t('translation|Copied') : t('translation|Copy to clipboard');
  const copyButton: JSX.Element = (
    <IconButton
      edge="start"
      aria-label={t('translation|Copy to clipboard')}
      onClick={onCopy}
      onMouseDown={e => e.preventDefault()}
      size="medium"
      disabled={!secret}
    >
      <Icon icon={'mdi:content-copy'} />
    </IconButton>
  );

  return (
    <Grid container alignItems={!!other?.disableUnderline ? 'center' : 'stretch'} spacing={2}>
      <Grid item>
        {!!secret ? <LightTooltip title={tooltipTitle}>{copyButton}</LightTooltip> : copyButton}
        <IconButton
          edge="end"
          aria-label={t('glossary|toggle field visibility')}
          onClick={handleClickShowPassword}
          onMouseDown={event => event.preventDefault()}
          size="medium"
        >
          <Icon icon={showPassword ? 'mdi:eye-off' : 'mdi:eye'} />
        </IconButton>
      </Grid>
      <Grid item xs>
        <Input
          aria-labelledby={nameID}
          readOnly={!showPassword}
          type="password"
          fullWidth
          multiline={showPassword}
          maxRows="20"
          value={showPassword ? Base64.decode(value as string) : '••••••••'}
          {...other}
        />
      </Grid>
    </Grid>
  );
}

export interface ConditionsTableProps {
  resource: KubeObjectInterface | KubeEvent | null;
  showLastUpdate?: boolean;
}

export function ConditionsTable(props: ConditionsTableProps) {
  const { resource, showLastUpdate = true } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  function makeStatusLabel(condition: KubeCondition) {
    let status: StatusLabelProps['status'] = '';
    if (condition.type === 'Available') {
      status = condition.status === 'True' ? 'success' : 'error';
    }

    return <StatusLabel status={status}>{condition.type}</StatusLabel>;
  }

  function getColumns() {
    const cols: {
      label: string;
      getter: (arg: KubeCondition) => void;
      hide?: boolean;
    }[] = [
      {
        label: t('Condition'),
        getter: makeStatusLabel,
      },
      {
        label: t('translation|Status'),
        getter: condition => condition.status,
      },
      {
        label: t('Last Transition'),
        getter: condition => <DateLabel date={condition.lastTransitionTime as string} />,
      },
      {
        label: t('Last Update'),
        getter: condition =>
          condition.lastUpdateTime ? <DateLabel date={condition.lastUpdateTime as string} /> : '-',
        hide: !showLastUpdate,
      },
      {
        label: t('translation|Reason'),
        getter: condition =>
          condition.reason ? (
            <HoverInfoLabel label={condition.reason} hoverInfo={condition.message} />
          ) : (
            '-'
          ),
      },
    ];

    // Allow to filter the columns by using a hide field
    return cols.filter(col => !col.hide);
  }

  return (
    <SimpleTable
      data={(resource && resource.status && resource.status.conditions) || []}
      columns={getColumns()}
    />
  );
}

// Types for environment variables feature
export interface EnvironmentVariablesProps {
  pod?: KubePod;
  container?: KubeContainer;
}

interface EnvVarReference {
  name: string;
  type: 'secret' | 'configMap' | 'secretRef' | 'configMapRef' | 'field' | 'resourceField' | 'value';
  resourceName?: string;
  key?: string;
  optional?: boolean;
  prefix?: string;
  fieldPath?: string;
  resource?: string;
  containerName?: string;
  divisor?: string;
  value?: string;
}

interface EnvironmentVariable {
  key: string;
  from?: KubeObject | string | null;
  value: string;
  isError: boolean;
  isSecret: boolean;
  isOutOfSync: boolean;
}

interface FetchedResource {
  resource: KubeObject | null;
  error: ApiError | null;
}

/**
 * Extracts all environment variable references from a container spec.
 * This is a pure function with no hooks.
 */
function extractEnvVarReferences(container: KubeContainer): EnvVarReference[] {
  const refs: EnvVarReference[] = [];

  // Process env variables
  container?.env?.forEach(item => {
    if (item.value) {
      refs.push({ name: item.name, type: 'value', value: item.value });
    } else if (item.valueFrom) {
      const vf = item.valueFrom;
      if (vf.secretKeyRef) {
        refs.push({
          name: item.name,
          type: 'secret',
          resourceName: vf.secretKeyRef.name,
          key: vf.secretKeyRef.key,
          optional: vf.secretKeyRef.optional,
        });
      } else if (vf.configMapKeyRef) {
        refs.push({
          name: item.name,
          type: 'configMap',
          resourceName: vf.configMapKeyRef.name,
          key: vf.configMapKeyRef.key,
          optional: vf.configMapKeyRef.optional,
        });
      } else if (vf.fieldRef) {
        refs.push({
          name: item.name,
          type: 'field',
          fieldPath: vf.fieldRef.fieldPath,
        });
      } else if (vf.resourceFieldRef) {
        refs.push({
          name: item.name,
          type: 'resourceField',
          resource: vf.resourceFieldRef.resource,
          containerName: vf.resourceFieldRef.containerName,
          divisor: vf.resourceFieldRef.divisor,
        });
      }
    }
  });

  // Process envFrom
  container?.envFrom?.forEach(item => {
    if (item.secretRef) {
      refs.push({
        name: item.secretRef.name,
        type: 'secretRef',
        resourceName: item.secretRef.name,
        optional: item.secretRef.optional,
        prefix: item.prefix,
      });
    } else if (item.configMapRef) {
      refs.push({
        name: item.configMapRef.name,
        type: 'configMapRef',
        resourceName: item.configMapRef.name,
        optional: item.configMapRef.optional,
        prefix: item.prefix,
      });
    }
  });

  return refs;
}

/**
 * Component that fetches a Secret and reports the result.
 * This properly calls hooks at the top level.
 */
function SecretFetcher(props: {
  name: string;
  namespace: string;
  onResult: (name: string, resource: KubeObject | null, error: ApiError | null) => void;
}) {
  const { name, namespace, onResult } = props;
  const [secret, error] = Secret.useGet(name, namespace);

  React.useEffect(() => {
    // Only call onResult when we have a definitive result (either data or error)
    if (secret || error) {
      onResult(name, secret, error);
    }
  }, [secret, error, name, onResult]);

  return null;
}

/**
 * Component that fetches a ConfigMap and reports the result.
 * This properly calls hooks at the top level.
 */
function ConfigMapFetcher(props: {
  name: string;
  namespace: string;
  onResult: (name: string, resource: KubeObject | null, error: ApiError | null) => void;
}) {
  const { name, namespace, onResult } = props;
  const [configMap, error] = ConfigMap.useGet(name, namespace);

  React.useEffect(() => {
    if (configMap || error) {
      onResult(name, configMap, error);
    }
  }, [configMap, error, name, onResult]);

  return null;
}

/**
 * Builds environment variables from references and fetched resources.
 * This is a pure function with no hooks.
 */
function buildEnvironmentVariables(
  references: EnvVarReference[],
  fetchedSecrets: Map<string, FetchedResource>,
  fetchedConfigMaps: Map<string, FetchedResource>,
  pod: KubePod,
  container: KubeContainer,
  containerStartTimestamp: string | undefined
): EnvironmentVariable[] {
  const variables = new Map<string, Omit<EnvironmentVariable, 'key'>>();

  // Helper to compare timestamps
  const isOutOfSync = (resourceTimestamp: string | undefined): boolean => {
    if (!resourceTimestamp || !containerStartTimestamp) return false;
    return new Date(resourceTimestamp).getTime() > new Date(containerStartTimestamp).getTime();
  };

  references.forEach(ref => {
    switch (ref.type) {
      case 'value':
        variables.set(ref.name, {
          value: ref.value!,
          from: 'manifest',
          isSecret: false,
          isError: false,
          isOutOfSync: false,
        });
        break;

      case 'secret': {
        const fetched = fetchedSecrets.get(ref.resourceName!);
        if (!fetched) break; // Still loading

        const { resource: secret, error } = fetched;
        if (error) {
          if (error.status === 404 && ref.optional) break;
          variables.set(ref.name, {
            value: error.message,
            from: secret,
            isError: true,
            isSecret: false,
            isOutOfSync: false,
          });
        } else if (secret) {
          const secretData = (secret as any).data || {};
          const value = secretData[ref.key!] ? atob(secretData[ref.key!]) : '';
          variables.set(ref.name, {
            value,
            from: secret,
            isError: false,
            isSecret: true,
            isOutOfSync: isOutOfSync(secret.metadata?.creationTimestamp),
          });
        }
        break;
      }

      case 'configMap': {
        const fetched = fetchedConfigMaps.get(ref.resourceName!);
        if (!fetched) break;

        const { resource: configMap, error } = fetched;
        if (error) {
          if (error.status === 404 && ref.optional) break;
          variables.set(ref.name, {
            value: error.message,
            from: configMap,
            isError: true,
            isSecret: false,
            isOutOfSync: false,
          });
        } else if (configMap) {
          const configMapData = (configMap as any).data || {};
          variables.set(ref.name, {
            value: configMapData[ref.key!] || '',
            from: configMap,
            isError: false,
            isSecret: false,
            isOutOfSync: isOutOfSync(configMap.metadata?.creationTimestamp),
          });
        }
        break;
      }

      case 'secretRef': {
        const fetched = fetchedSecrets.get(ref.resourceName!);
        if (!fetched) break;

        const { resource: secret, error } = fetched;
        const prefix = ref.prefix || '';
        if (error) {
          if (error.status === 404 && ref.optional) break;
          variables.set(`${prefix}${ref.resourceName}`, {
            value: error.message,
            from: secret,
            isError: true,
            isSecret: false,
            isOutOfSync: false,
          });
        } else if (secret) {
          const secretData = (secret as any).data || {};
          const outOfSync = isOutOfSync(secret.metadata?.creationTimestamp);
          Object.entries(secretData).forEach(([key, value]) => {
            variables.set(`${prefix}${key}`, {
              value: atob(value as string),
              from: secret,
              isError: false,
              isSecret: true,
              isOutOfSync: outOfSync,
            });
          });
        }
        break;
      }

      case 'configMapRef': {
        const fetched = fetchedConfigMaps.get(ref.resourceName!);
        if (!fetched) break;

        const { resource: configMap, error } = fetched;
        const prefix = ref.prefix || '';
        if (error) {
          if (error.status === 404 && ref.optional) break;
          variables.set(`${prefix}${ref.resourceName}`, {
            value: error.message,
            from: configMap,
            isError: true,
            isSecret: false,
            isOutOfSync: false,
          });
        } else if (configMap) {
          const configMapData = (configMap as any).data || {};
          const outOfSync = isOutOfSync(configMap.metadata?.creationTimestamp);
          Object.entries(configMapData).forEach(([key, value]) => {
            variables.set(`${prefix}${key}`, {
              value: value as string,
              from: configMap,
              isError: false,
              isSecret: false,
              isOutOfSync: outOfSync,
            });
          });
        }
        break;
      }

      case 'field': {
        let value: string;
        let isError = false;
        try {
          const result = JSONPath({ path: '$.' + ref.fieldPath, json: pod });
          value = Array.isArray(result) ? result[0] : result;
          if (value === undefined) {
            value = '';
          } else if (typeof value !== 'string') {
            value = JSON.stringify(value);
          }
        } catch (err) {
          isError = true;
          value = err instanceof Error ? `Error: ${err.message}` : 'Unknown error';
        }
        variables.set(ref.name, {
          value,
          from: `fieldRef: ${ref.fieldPath}`,
          isSecret: false,
          isError,
          isOutOfSync: false,
        });
        break;
      }

      case 'resourceField': {
        let value = '';
        let isError = false;
        const containerName = ref.containerName || container.name;
        const resourceType = ref.resource!;
        let divisor = ref.divisor || '1';
        if (divisor === '0') {
          divisor = '1';
        }

        try {
          const targetContainer = pod.spec?.containers?.find(c => c.name === containerName);
          if (!targetContainer) {
            throw new Error(`Container ${containerName} not found`);
          }

          const [category, type] = resourceType.split('.');
          const resourceValue =
            targetContainer.resources?.[category as 'requests' | 'limits']?.[
              type as 'cpu' | 'memory'
            ];
          if (!resourceValue) {
            throw new Error(`Resource ${resourceType} not found for container ${containerName}`);
          }

          value = `${ceil(divideK8sResources(resourceValue, divisor, type as 'cpu' | 'memory'))}`;
        } catch (err) {
          isError = true;
          if (err instanceof Error) {
            value = err.message;
          } else {
            value = 'Unknown error occurred.';
          }
        }

        variables.set(ref.name, {
          value,
          from: `resourceFieldRef: ${containerName}.${resourceType} / ${divisor}`,
          isSecret: false,
          isError,
          isOutOfSync: false,
        });
        break;
      }
    }
  });

  return Array.from(variables.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Displays environment variables for a container, fetching values from
 * Secrets and ConfigMaps as needed.
 */
export function ContainerEnvironmentVariables(props: EnvironmentVariablesProps) {
  const { pod, container } = props;
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();

  // State to store fetched resources
  const [fetchedSecrets, setFetchedSecrets] = React.useState<Map<string, FetchedResource>>(
    new Map()
  );
  const [fetchedConfigMaps, setFetchedConfigMaps] = React.useState<Map<string, FetchedResource>>(
    new Map()
  );

  // Early return if no env vars
  if (
    (!container?.env && !container?.envFrom) ||
    !pod?.status?.containerStatuses ||
    !pod?.metadata?.namespace
  ) {
    return null;
  }

  const namespace = pod.metadata.namespace;
  const containerStartTimestamp = (() => {
    let timestamp = pod.metadata?.creationTimestamp;
    const containerStatus = pod.status?.containerStatuses?.find(c => c.name === container?.name);
    if (containerStatus?.started && containerStatus.state?.running?.startedAt) {
      timestamp = containerStatus.state.running.startedAt;
    }
    return timestamp;
  })();

  // Extract all references upfront (pure function, no hooks)
  const references = extractEnvVarReferences(container);

  // Get unique resource names to fetch
  const secretsToFetch = React.useMemo(() => {
    const secrets = new Set<string>();
    references.forEach(ref => {
      if ((ref.type === 'secret' || ref.type === 'secretRef') && ref.resourceName) {
        secrets.add(ref.resourceName);
      }
    });
    return Array.from(secrets);
  }, [references]);

  const configMapsToFetch = React.useMemo(() => {
    const configMaps = new Set<string>();
    references.forEach(ref => {
      if ((ref.type === 'configMap' || ref.type === 'configMapRef') && ref.resourceName) {
        configMaps.add(ref.resourceName);
      }
    });
    return Array.from(configMaps);
  }, [references]);

  // Callbacks to handle fetched resources
  const handleSecretFetched = React.useCallback(
    (name: string, resource: KubeObject | null, error: ApiError | null) => {
      setFetchedSecrets(prev => {
        const next = new Map(prev);
        next.set(name, { resource, error });
        return next;
      });
    },
    []
  );

  const handleConfigMapFetched = React.useCallback(
    (name: string, resource: KubeObject | null, error: ApiError | null) => {
      setFetchedConfigMaps(prev => {
        const next = new Map(prev);
        next.set(name, { resource, error });
        return next;
      });
    },
    []
  );

  // Copy handler using notistack
  const handleCopy = React.useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => enqueueSnackbar(t('translation|Copied'), { variant: 'success' }),
        err => console.error('Failed to copy: ', err)
      );
    },
    [enqueueSnackbar, t]
  );

  // Build variables from fetched resources
  const variables = buildEnvironmentVariables(
    references,
    fetchedSecrets,
    fetchedConfigMaps,
    pod,
    container,
    containerStartTimestamp
  );

  // Define columns for the table
  const columns = [
    {
      label: t('translation|Name'),
      getter: (data: EnvironmentVariable) => {
        return (
          <Box display="flex" alignItems="center">
            <StatusLabel status="" sx={{ fontFamily: 'monospace' }}>
              {data.key}
            </StatusLabel>
            {data.isOutOfSync && (
              <Box aria-label="hidden" display="flex" alignItems="center" px={1}>
                <HoverInfoLabel
                  label=""
                  aria-label="error"
                  icon="mdi:alert-outline"
                  hoverInfo={t(
                    'translation|This value may differ in the container, since the pod is older than {{from}}',
                    {
                      from: (() => {
                        if (typeof data.from === 'object' && data.from !== null) {
                          const o = data.from as KubeObject;
                          return `${o.kind} ${o.metadata.name}`;
                        }
                        return 'the referenced object';
                      })(),
                    }
                  )}
                />
              </Box>
            )}
          </Box>
        );
      },
    },
    {
      label: t('translation|Value'),
      getter: (data: EnvironmentVariable) => {
        if (data.isError) {
          return (
            <Box display="flex" alignItems="center" px={1}>
              <Icon icon="mdi:alert-outline" aria-label="error" />
              <Typography color="error" sx={{ marginLeft: 1 }}>
                {data.value}
              </Typography>
            </Box>
          );
        }

        return (
          <Box display="flex" alignItems="center">
            {data.isSecret ? (
              <SecretField
                disableUnderline
                value={btoa(data.value)}
                sx={{ fontFamily: 'monospace' }}
              />
            ) : (
              <>
                <IconButton
                  edge="end"
                  aria-label={t('translation|Copy')}
                  onClick={() => handleCopy(data.value)}
                  onMouseDown={event => event.preventDefault()}
                  size="medium"
                >
                  <Icon icon="mdi:content-copy" />
                </IconButton>
                <Typography sx={{ fontFamily: 'monospace', ml: 1 }}>{data.value}</Typography>
              </>
            )}
          </Box>
        );
      },
    },
    {
      label: t('translation|From'),
      getter: (data: EnvironmentVariable) => {
        if (typeof data.from === 'object' && data.from !== null) {
          let routeName;
          try {
            routeName =
              ResourceClasses[data.from?.kind as keyof typeof ResourceClasses].detailsRoute;
          } catch (e) {
            console.error(`Error getting routeName for ${data.from?.kind}`, e);
            return null;
          }
          return (
            <Link
              routeName={routeName}
              params={{
                name: data.from?.metadata?.name,
                namespace: data.from?.metadata?.namespace,
              }}
            >
              {`${data.from?.kind}: ${data.from?.metadata?.name}`}
            </Link>
          );
        } else if (typeof data.from === 'string') {
          return data.from;
        }
        return null;
      },
    },
  ];

  return (
    <>
      {/* Render fetcher components - these call hooks properly at top level */}
      {secretsToFetch.map(name => (
        <SecretFetcher
          key={`secret-${name}`}
          name={name}
          namespace={namespace}
          onResult={handleSecretFetched}
        />
      ))}
      {configMapsToFetch.map(name => (
        <ConfigMapFetcher
          key={`configmap-${name}`}
          name={name}
          namespace={namespace}
          onResult={handleConfigMapFetched}
        />
      ))}
      <InnerTable columns={columns} data={variables} />
    </>
  );
}

export interface VolumeMountsProps {
  mounts?: {
    mountPath: string;
    name: string;
    readOnly: boolean;
  }[];
}

export function VolumeMounts(props: VolumeMountsProps) {
  const { mounts } = props;
  const { t } = useTranslation();
  if (!mounts) {
    return null;
  }

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Mount Path'),
          getter: (data: any) => data.mountPath,
        },
        {
          label: t('translation|from'),
          getter: (data: any) => data.name,
        },
        {
          label: t('translation|I/O'),
          getter: (data: any) => (data.readOnly ? 'ReadOnly' : 'ReadWrite'),
        },
      ]}
      data={mounts}
    />
  );
}

export function LivenessProbes(props: { liveness: KubeContainer['livenessProbe'] }) {
  const { liveness } = props;

  function LivenessProbeItem(props: { children: React.ReactNode }) {
    return props.children ? (
      <Box p={0.5}>
        <Typography sx={metadataStyles} display="inline">
          {props.children}
        </Typography>
      </Box>
    ) : null;
  }

  return (
    <Box display="flex" flexDirection="column">
      <LivenessProbeItem>
        {`http-get, path: ${liveness?.httpGet?.path}, port: ${liveness?.httpGet?.port},
    scheme: ${liveness?.httpGet?.scheme}`}
      </LivenessProbeItem>
      <LivenessProbeItem>
        {liveness?.exec?.command && `exec[${liveness?.exec?.command.join(' ')}]`}
      </LivenessProbeItem>
      <LivenessProbeItem>
        {liveness?.successThreshold && `success = ${liveness?.successThreshold}`}
      </LivenessProbeItem>
      <LivenessProbeItem>
        {liveness?.failureThreshold && `failure = ${liveness?.failureThreshold}`}
      </LivenessProbeItem>
      <LivenessProbeItem>
        {liveness?.initialDelaySeconds && `delay = ${liveness?.initialDelaySeconds}s`}
      </LivenessProbeItem>
      <LivenessProbeItem>
        {liveness?.timeoutSeconds && `timeout = ${liveness?.timeoutSeconds}s`}
      </LivenessProbeItem>
      <LivenessProbeItem>
        {liveness?.periodSeconds && `period = ${liveness?.periodSeconds}s`}
      </LivenessProbeItem>
    </Box>
  );
}

/** @deprecated Please use `ContainerInfoKubeObjectProps` for better type safety */
export interface ContainerInfoLegacyProps {
  container: KubeContainer;
  resource: KubeObjectInterface | null;
  status?: Omit<KubePod['status']['KubeContainerStatus'], 'name'>;
}

export interface ContainerInfoKubeObjectProps {
  container: KubeContainer;
  resource: KubeObject | null;
  status?: Omit<KubePod['status']['KubeContainerStatus'], 'name'>;
}

export type ContainerInfoProps = ContainerInfoKubeObjectProps | ContainerInfoLegacyProps;

export function ContainerInfo(props: ContainerInfoProps) {
  const { container, status, resource } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  const [startedDate, finishDate, lastStateStartedDate, lastStateFinishDate] = React.useMemo(() => {
    function getStartedDate(state?: KubeContainerStatus['state']) {
      let startedDate = state?.running?.startedAt || state?.terminated?.startedAt || '';
      if (!!startedDate) {
        startedDate = localeDate(startedDate);
      }
      return startedDate;
    }

    function getFinishDate(state?: KubeContainerStatus['state']) {
      let finishDate = state?.terminated?.finishedAt || '';
      if (!!finishDate) {
        finishDate = localeDate(finishDate);
      }
      return finishDate;
    }

    return [
      getStartedDate(status?.state),
      getFinishDate(status?.state),
      getStartedDate(status?.lastState),
      getFinishDate(status?.lastState),
    ];
  }, [status]);

  function ContainerStatusLabel(props: {
    state?: KubeContainerStatus['state'] | null;
    container?: KubeContainer;
  }) {
    const { state, container } = props;

    const [stateDetails, label, statusType] = React.useMemo(() => {
      let stateDetails: KubeContainerStatus['state']['waiting' | 'terminated'] | null = null;
      let label = t('translation|Ready');
      let statusType: StatusLabelProps['status'] = '';

      if (!state) {
        return [stateDetails, label, statusType];
      }

      if (!!state.waiting) {
        stateDetails = state.waiting;
        statusType = 'warning';
        label = t('translation|Waiting');
      } else if (!!state.running) {
        statusType = 'success';
        label = t('translation|Running');
      } else if (!!state.terminated) {
        stateDetails = state.terminated;
        if (state.terminated.exitCode === 0) {
          statusType = '';
          label = state.terminated.reason;
        } else {
          statusType = 'error';
          label = t('translation|Error');
        }
      }

      return [stateDetails, label, statusType];
    }, [state]);

    if (!state || !container) {
      return null;
    }

    const tooltipID = 'container-state-message-' + (container?.name ?? '');

    return (
      <Box>
        <Box>
          <StatusLabel
            status={statusType}
            aria-describedby={!!stateDetails?.message ? tooltipID : undefined}
          >
            {label + (stateDetails?.reason ? ` (${stateDetails.reason})` : '')}
          </StatusLabel>
          {!!stateDetails && stateDetails.message && (
            <LightTooltip role="tooltip" title={stateDetails.message} interactive id={tooltipID}>
              <Box aria-label="hidden" display="inline" px={1} style={{ verticalAlign: 'bottom' }}>
                <Icon icon="mdi:alert-outline" width="1.3rem" height="1.3rem" aria-label="hidden" />
              </Box>
            </LightTooltip>
          )}
        </Box>
      </Box>
    );
  }

  function StatusValue(props: {
    rows: { name: string; value: string | number; hide?: boolean }[];
  }) {
    const { rows } = props;
    const id = useId('status-value-');

    const rowsToDisplay = React.useMemo(() => {
      return rows.filter(({ hide }) => !hide);
    }, [rows]);

    if (rowsToDisplay.length === 0) {
      return null;
    }

    return (
      <Box>
        {rowsToDisplay.map(({ name, value }, idx) => {
          const rowId = `${id}-${idx}`;
          return (
            <Grid container spacing={2} direction="row" key={rowId}>
              <Grid item>
                <Typography id={rowId} color="textSecondary">
                  {name}
                </Typography>
              </Grid>
              <Grid item>
                <Typography aria-labelledby={rowId}>{value}</Typography>
              </Grid>
            </Grid>
          );
        })}
      </Box>
    );
  }

  function containerRows() {
    return [
      {
        name: container.name,
        withHighlightStyle: true,
      },
      {
        name: t('translation|Status'),
        value: <ContainerStatusLabel state={status?.state} container={container} />,
        hide: !status,
      },
      {
        name: t('translation|Exit Code'),
        value: status?.state?.terminated?.exitCode,
        hide: !status?.state?.terminated,
      },
      {
        name: t('translation|Started'),
        value: startedDate,
        hide: !startedDate,
      },
      {
        name: t('translation|Finished'),
        value: finishDate,
        hide: !finishDate,
      },
      {
        name: t('translation|Restart Count'),
        value: status?.restartCount,
        hide: !status,
      },
      {
        name: t('translation|Last State'),
        value: (
          <Grid container direction="column" spacing={1}>
            <Grid item>
              <ContainerStatusLabel state={status?.lastState} container={container} />
            </Grid>
            <Grid item>
              <StatusValue
                rows={[
                  {
                    name: t('translation|Exit Code'),
                    value: status?.lastState?.terminated?.exitCode,
                    hide: !status?.lastState?.terminated,
                  },
                  {
                    name: t('translation|Started'),
                    value: lastStateStartedDate,
                    hide: !lastStateStartedDate,
                  },
                  {
                    name: t('translation|Finished'),
                    value: lastStateFinishDate,
                    hide: !lastStateFinishDate,
                  },
                ]}
              />
            </Grid>
          </Grid>
        ),
        hide: Object.keys(status?.lastState ?? {}).length === 0,
      },
      {
        name: t('Container ID'),
        value: status?.containerID,
        hide: !status,
      },
      {
        name: t('Image Pull Policy'),
        value: container.imagePullPolicy,
      },
      {
        name: t('Image'),
        value: (
          <>
            <Typography>{container.image}</Typography>
            {status?.imageID && (
              <Typography
                sx={theme => ({
                  paddingTop: theme.spacing(1),
                  fontSize: '.95rem',
                })}
              >
                <Typography component="span" style={{ fontWeight: 'bold' }}>
                  ID:
                </Typography>{' '}
                {status?.imageID}
              </Typography>
            )}
          </>
        ),
      },
      {
        name: t('Args'),
        value: container.args && (
          <MetadataDictGrid dict={container.args as { [index: number]: string }} showKeys={false} />
        ),
        hide: !container.args,
      },
      {
        name: t('Command'),
        value: (container.command || []).join(' '),
        hide: !container.command,
      },
      {
        name: t('glossary|Environment'),
        value: <ContainerEnvironmentVariables pod={resource as KubePod} container={container} />,
        hide: _.isEmpty(container?.env) && _.isEmpty(container?.envFrom),
      },
      {
        name: t('Liveness Probes'),
        value: <LivenessProbes liveness={container.livenessProbe} />,
        hide: _.isEmpty(container.livenessProbe),
      },
      {
        name: t('Ports'),
        value: (
          <Grid container>
            {container.ports?.map(({ containerPort, protocol }, index) => (
              <>
                <Grid item xs={12} key={`port_line_${index}`}>
                  <Box display="flex" alignItems={'center'}>
                    <Box px={0.5} minWidth={120}>
                      <ValueLabel>{`${protocol}:`}</ValueLabel>
                      <ValueLabel>{containerPort}</ValueLabel>
                    </Box>
                    {!!resource && ['Service', 'Pod'].includes(resource.kind) && (
                      <PortForward containerPort={containerPort} resource={resource} />
                    )}
                  </Box>
                </Grid>
                {index < container.ports!.length - 1 && (
                  <Grid item xs={12}>
                    <Box mt={2} mb={2}>
                      <Divider role="separator" />
                    </Box>
                  </Grid>
                )}
              </>
            ))}
          </Grid>
        ),
        hide: _.isEmpty(container.ports),
      },
      {
        name: t('Volume Mounts'),
        value: <VolumeMounts mounts={container?.volumeMounts || undefined} />,
        valueFullRow: true,
        hide: _.isEmpty(container?.volumeMounts),
      },
    ];
  }

  return (
    <Box pb={1}>
      <NameValueTable rows={containerRows()} />
    </Box>
  );
}

export interface OwnedPodsSectionProps {
  resource: KubeObject;
  hideColumns?: PodListProps['hideColumns'];
  /**
   * Hides the namespace selector
   */
  noSearch?: boolean;
}

export function OwnedPodsSection(props: OwnedPodsSectionProps) {
  const { resource, hideColumns, noSearch } = props;
  let namespace;

  if (resource.kind === 'Namespace') {
    namespace = resource.metadata.name;
  } else {
    namespace = resource.metadata.namespace;
  }
  const queryData = {
    namespace,
    labelSelector: resource?.jsonData?.spec?.selector
      ? labelSelectorToQuery(resource?.jsonData?.spec?.selector)
      : '',
    fieldSelector: resource.kind === 'Node' ? `spec.nodeName=${resource.metadata.name}` : undefined,
    cluster: resource.cluster,
  };

  const { items: pods, errors } = Pod.useList(queryData);
  const { items: podMetrics } = PodMetrics.useList({
    ...queryData,
    refetchInterval: METRIC_REFETCH_INTERVAL_MS,
  });
  const onlyOneNamespace = !!resource.metadata.namespace || resource.kind === 'Namespace';
  const hideNamespaceFilter = onlyOneNamespace || noSearch;

  return (
    <PodListRenderer
      hideColumns={hideColumns || onlyOneNamespace ? ['namespace'] : undefined}
      pods={pods}
      errors={errors}
      metrics={podMetrics}
      noNamespaceFilter={hideNamespaceFilter}
    />
  );
}

export function ContainersSection(props: { resource: KubeObjectInterface | null }) {
  const { resource } = props;
  const { t } = useTranslation('glossary');

  let title = '…';

  function getContainers() {
    if (!resource) {
      return [];
    }

    let containers: KubeContainer[] = [];

    if (resource.spec) {
      if (resource.spec.containers) {
        title = t('Containers');
        containers = resource.spec.containers;
      } else if (resource.spec.template && resource.spec.template.spec) {
        title = t('Container Spec');
        containers = resource.spec.template.spec.containers;
      }
    }

    return containers;
  }

  function getInitContainers() {
    return resource?.spec?.initContainers || [];
  }

  function getEphemeralContainers() {
    return resource?.spec?.ephemeralContainers || [];
  }

  function getStatuses(
    statusKind: 'containerStatuses' | 'initContainerStatuses' | 'ephemeralContainerStatuses'
  ) {
    if (!resource || resource.kind !== 'Pod') {
      return {};
    }

    const statuses: {
      [key: string]: ContainerInfoProps['status'];
    } = {};

    ((resource as KubePod).status[statusKind] || []).forEach(containerStatus => {
      const { name, ...status } = containerStatus;
      statuses[name] = { ...status };
    });

    return statuses;
  }

  const containers = getContainers();
  const initContainers = getInitContainers();
  const ephemContainers = getEphemeralContainers();
  const statuses = getStatuses('containerStatuses');
  const initStatuses = getStatuses('initContainerStatuses');
  const ephemStatuses = getStatuses('ephemeralContainerStatuses');
  const numContainers = containers.length;

  return (
    <>
      <SectionBox title={title}>
        {numContainers === 0 ? (
          <Empty>{t('translation|No data to be shown.')}</Empty>
        ) : (
          containers.map((container: any) => (
            <ContainerInfo
              key={`container_${container.name}`}
              resource={resource}
              container={container}
              status={statuses[container.name]}
            />
          ))
        )}
      </SectionBox>

      {ephemContainers.length > 0 && (
        <SectionBox title={t('glossary|Ephemeral Containers')}>
          {ephemContainers.map((ephemContainer: KubeContainer) => (
            <ContainerInfo
              key={`ephem_container_${ephemContainer.name}`}
              resource={resource}
              container={ephemContainer}
              status={ephemStatuses[ephemContainer.name]}
            />
          ))}
        </SectionBox>
      )}

      {initContainers.length > 0 && (
        <SectionBox title={t('translation|Init Containers')}>
          {initContainers.map((initContainer: KubeContainer, i: number) => (
            <ContainerInfo
              key={`init_container_${i}`}
              resource={resource}
              container={initContainer}
              status={initStatuses[initContainer.name]}
            />
          ))}
        </SectionBox>
      )}
    </>
  );
}

export function ConditionsSection(props: { resource: KubeObjectInterface | null }) {
  const { resource } = props;
  const { t } = useTranslation(['glossary']);

  if (!resource) {
    return null;
  }

  return (
    <SectionBox title={t('translation|Conditions')}>
      <ConditionsTable resource={resource} />
    </SectionBox>
  );
}

export interface VolumeSectionProps {
  resource: KubeObjectInterface | null;
}

export interface VolumeRowsProps {
  volume: KubeVolume;
}

export interface PrintVolumeLinkProps {
  volumeName: string;
  volumeKind: string;
  volume: KubeVolume;
}

export interface VolumePrints {
  directPrint?: any[];
  yamlPrint?: any[];
}

export function VolumeSection(props: VolumeSectionProps) {
  const { t } = useTranslation('glossary');
  const { resource } = props;
  const volumes = resource?.spec?.volumes;

  if (!volumes) {
    return null;
  }

  const namespace = resource?.metadata?.namespace;

  /*
   * printVolumeLink will print a working link that is set within the router using fields from the resource as params
   */
  function PrintVolumeLink(props: PrintVolumeLinkProps) {
    const { volumeName, volumeKind, volume } = props;
    const resourceClasses = ResourceClasses;
    const classList = Object.keys(resourceClasses) as Array<keyof typeof resourceClasses>;

    for (const kind of classList) {
      if (kind.toLowerCase() === volumeKind.toLowerCase()) {
        const volumeClass = resourceClasses[kind];
        const volumeRoute = volumeClass.detailsRoute;
        const volumeNamespace = volumeClass.isNamespaced ? namespace : null;

        const volumeKindNames = {
          configMap: 'name',
          secret: 'secretName',
          persistentVolumeClaim: 'claimName',
        };

        const volumeNameKey = volumeKindNames[volumeKind as keyof typeof volumeKindNames];
        if (!!volumeNameKey) {
          const detailName = volume[volumeKind][volumeNameKey];
          if (!!detailName) {
            return (
              <Link
                routeName={volumeRoute}
                params={{ namespace: volumeNamespace, name: detailName }}
              >
                {volumeName}
              </Link>
            );
          }
        }
      }
    }

    return <Typography>{volumeName}</Typography>;
  }

  function volumeRows(volume: VolumeRowsProps['volume']) {
    const { name, ...objWithVolumeKind } = volume;
    const volumeKind = Object.keys(objWithVolumeKind)[0] || '';

    if (!volume) {
      return [];
    }

    function printVolumeDetails(volume: VolumeRowsProps['volume']): VolumePrints {
      const { ...vol } = volume[volumeKind];

      // array for items that are printable
      const directPrint = [];

      // array for items that are not printable and need to be printed to yaml
      const yamlPrint = [];

      // loop over volumeKeys and check if the value is a string, number, or bool
      for (const key in vol) {
        if (!(vol[key] === '')) {
          if (
            typeof vol[key] === 'string' ||
            typeof vol[key] === 'number' ||
            typeof vol[key] === 'boolean'
          ) {
            directPrint.push({
              volKey: key,
              volValue: typeof vol[key] === 'boolean' ? vol[key].toString() : vol[key],
            });
          } else {
            yamlPrint.push({
              volKey: key,
              volValue: vol[key],
            });
          }
        }
      }

      const volumePrints = {
        directPrint,
        yamlPrint,
      };

      return volumePrints;
    }

    const volumeDetails: VolumePrints = printVolumeDetails(volume);

    return [
      {
        name: name,
        withHighlightStyle: true,
      },
      ...(volumeKind
        ? [
            {
              name: 'Kind',
              value: volumeKind,
            },
          ]
        : []),
      {
        name: 'Source',
        value: <PrintVolumeLink volumeName={name} volumeKind={volumeKind} volume={volume} />,
      },
      ...(volumeDetails.directPrint
        ? volumeDetails.directPrint.map(
            ({ volKey, volValue }: { volKey: string; volValue: any }) => {
              return {
                name: volKey,
                value: volValue,
              };
            }
          )
        : []),
      ...(volumeDetails.yamlPrint
        ? volumeDetails.yamlPrint.map(({ volKey, volValue }: { volKey: string; volValue: any }) => {
            return {
              name: volKey,
              value: (
                <Typography component="pre" variant="body2">
                  {YAML.stringify(volValue)}
                </Typography>
              ),
            };
          })
        : []),
    ];
  }

  return (
    <SectionBox title={t('translation|Volumes')}>
      {volumes.map((volume: VolumeRowsProps['volume']) => (
        <NameValueTable key={volume.name} rows={volumeRows(volume)} />
      ))}
    </SectionBox>
  );
}
