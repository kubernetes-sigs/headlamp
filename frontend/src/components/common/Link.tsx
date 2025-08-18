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

import MuiLink from '@mui/material/Link';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { formatClusterPathParam, getCluster, getSelectedClusters } from '../../lib/cluster';
import { kubeObjectQueryKey, useEndpoints } from '../../lib/k8s/api/v2/hooks';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { createRouteURL, RouteURLProps } from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import { Activity } from '../activity/Activity';
import { canRenderDetails, KubeObjectDetails } from '../resourceMap/details/KubeNodeDetails';
import { KubeIcon } from '../resourceMap/kubeIcon/KubeIcon';
import { LightTooltip } from './Tooltip';

export interface LinkBaseProps {
  /** The tooltip to display on hover. If true, the tooltip will be the link's text. */
  tooltip?: string | boolean;
}

export interface LinkProps extends LinkBaseProps {
  /** A key in the default routes object (given by router.tsx's getDefaultRoutes). */
  routeName: string;
  /** An object with corresponding params for the pattern to use. */
  params?: RouteURLProps;
  /** A string representation of query parameters. */
  search?: string;
  /** Cluster name of the resource. Set this parameter to not override selected clusters param */
  activeCluster?: string;
  /** State to persist to the location. */
  state?: {
    [prop: string]: any;
  };
}

export interface LinkObjectProps extends LinkBaseProps {
  kubeObject?: KubeObject | null;
  [prop: string]: any;
}

function KubeObjectLink(props: {
  kubeObject: KubeObject;
  /** if onClick callback is provided navigation is disabled */
  onClick?: () => void;
  [prop: string]: any;
}) {
  const { kubeObject, onClick, ...otherProps } = props;

  const client = useQueryClient();
  const { namespace, name } = kubeObject.metadata;
  const { endpoint } = useEndpoints(kubeObject._class().apiEndpoint.apiInfo, kubeObject.cluster);

  return (
    <MuiLink
      onClick={e => {
        const key = kubeObjectQueryKey({
          cluster: kubeObject.cluster,
          endpoint,
          namespace,
          name,
        });
        // prepopulate the query cache with existing object
        client.setQueryData(key, kubeObject);
        // and invalidate it (mark as stale)
        // so that the latest version will be downloaded in the background
        client.invalidateQueries({ queryKey: key });

        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      component={RouterLink}
      to={kubeObject.getDetailsLink()}
      {...otherProps}
    >
      {props.children || kubeObject!.getName()}
    </MuiLink>
  );
}

function PureLink(
  props: React.PropsWithChildren<LinkProps | LinkObjectProps> & {
    /** if onClick callback is provided navigation is disabled */
    onClick?: () => void;
  }
) {
  if ((props as LinkObjectProps).kubeObject) {
    const { kubeObject, ...otherProps } = props as LinkObjectProps;
    return <KubeObjectLink kubeObject={kubeObject!} {...otherProps} />;
  }
  const {
    routeName,
    params = {},
    search,
    state,
    // eslint-disable-next-line no-unused-vars -- make sure not to pass it to the link
    kubeObject,
    activeCluster,
    ...otherProps
  } = props as LinkObjectProps;

  if (activeCluster) {
    params.cluster = formatClusterPathParam(getSelectedClusters(), activeCluster);
  }

  return (
    <MuiLink
      component={RouterLink}
      to={{
        pathname: createRouteURL(routeName, params),
        search,
        state,
      }}
      {...otherProps}
      onClick={e => {
        if (otherProps.onClick) {
          e.preventDefault();
          otherProps.onClick();
        }
      }}
    >
      {props.children}
    </MuiLink>
  );
}

export default function Link(props: React.PropsWithChildren<LinkProps | LinkObjectProps>) {
  const drawerEnabled = useTypedSelector(state => state.drawerMode.isDetailDrawerEnabled);

  const { tooltip, ...propsRest } = props as LinkObjectProps;

  const kind = 'kubeObject' in props ? props.kubeObject?._class().kind : props?.routeName;
  const cluster =
    'kubeObject' in props && props.kubeObject?.cluster
      ? props.kubeObject?.cluster
      : props.activeCluster ?? getCluster() ?? '';

  const openDrawer =
    drawerEnabled && canRenderDetails(kind)
      ? () => {
          // Object information can be provided throught kubeObject or route parameters
          const name = 'kubeObject' in props ? props.kubeObject?.getName() : props.params?.name;
          const namespace =
            'kubeObject' in props ? props.kubeObject?.getNamespace() : props.params?.namespace;

          const selectedResource =
            kind === 'customresource'
              ? {
                  // Custom resource links don't follow the same convention
                  // so we need to create a different object
                  kind,
                  metadata: {
                    name: props.params?.crName,
                    namespace,
                  },
                  cluster,
                  customResourceDefinition: props.params?.crd,
                }
              : { kind, metadata: { name, namespace }, cluster };

          Activity.launch({
            id:
              'details' +
              selectedResource.kind +
              ' ' +
              selectedResource.metadata.name +
              selectedResource.cluster,
            title: selectedResource.kind + ' ' + selectedResource.metadata.name,
            hideTitleInHeader: true,
            location: 'split-right',
            cluster: selectedResource.cluster,
            temporary: true,
            content: (
              <KubeObjectDetails
                resource={{
                  kind: selectedResource.kind,
                  metadata: {
                    name: selectedResource.metadata.name,
                    namespace: selectedResource.metadata.namespace,
                  },
                  cluster: selectedResource.cluster,
                }}
                customResourceDefinition={selectedResource.customResourceDefinition}
              />
            ),
            icon: <KubeIcon kind={selectedResource.kind} width="100%" height="100%" />,
          });
        }
      : undefined;

  const link = <PureLink {...propsRest} onClick={openDrawer} />;

  if (tooltip) {
    let tooltipText = '';
    if (typeof tooltip === 'string') {
      tooltipText = tooltip;
    } else if ((props as LinkObjectProps).kubeObject) {
      tooltipText = (props as LinkObjectProps).getName();
    } else if (typeof props.children === 'string') {
      tooltipText = props.children;
    }

    if (!!tooltipText) {
      return (
        <LightTooltip title={tooltipText} interactive>
          {link}
        </LightTooltip>
      );
    }
  }

  return link;
}
