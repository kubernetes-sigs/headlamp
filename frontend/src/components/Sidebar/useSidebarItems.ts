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

import _ from 'lodash';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isElectron } from '../../helpers/isElectron';
import { useSelectedClusters } from '../../lib/k8s';
import CRD from '../../lib/k8s/crd';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { useTypedSelector } from '../../redux/hooks';
import { DefaultSidebars, SidebarItemProps } from '.';

/** Iterates over every entry in the list, including children */
const forEachEntry = (items: SidebarItemProps[], cb: (item: SidebarItemProps) => void) => {
  items.forEach(it => {
    cb(it);
    if (it.subList) {
      forEachEntry(it.subList, cb);
    }
  });
};

const sortSidebarItems = (items: SidebarItemProps[]): SidebarItemProps[] => {
  const homeItems = items.filter(({ name }) => name === 'home');
  const otherItems = items
    .filter(({ name }) => name !== 'home')
    .sort((a, b) => {
      const aLabel = ((a.label ?? a.name) + '').toLowerCase();
      const bLabel = ((b.label ?? b.name) + '').toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  return [...homeItems, ...otherItems].map(item => ({
    ...item,
    subList: item.subList ? sortSidebarItems(item.subList) : undefined,
  }));
};

export const useSidebarItems = (sidebarName: string = DefaultSidebars.IN_CLUSTER) => {
  const clusters = useTypedSelector(state => state.config.clusters) ?? {};
  const settings = useTypedSelector(state => state.config.settings);
  const customSidebarEntries = useTypedSelector(state => state.sidebar.entries);
  const customSidebarFilters = useTypedSelector(state => state.sidebar.filters);
  const shouldShowHomeItem = isElectron() || Object.keys(clusters).length !== 1;
  const selectedClusters = useSelectedClusters();
  const { t } = useTranslation();

  const [crds, error] = CRD.useList();
  if (error !== null) {
    console.log(error);
  }

  const crdsSidebarEntries = useMemo(() => {
    const crdsSidebarEntries: SidebarItemProps[] = [];
    if (sidebarName !== DefaultSidebars.IN_CLUSTER) {
      return crdsSidebarEntries;
    }

    if (crds === null) {
      return crdsSidebarEntries;
    }

    const entriesGroup = new Map<string, SidebarItemProps>();
    crds.forEach(item => {
      const group = item.jsonData.spec.group;
      if (!entriesGroup.has(group)) {
        entriesGroup.set(group, {
          name: `group-${group}`,
          label: group,
          isCR: true,
          subList: [
            {
              name: item.jsonData.metadata.name,
              label: item.jsonData.spec.names.kind,
              isCR: true,
            },
          ],
        });
      } else {
        const entryGroup = entriesGroup.get(group)!;
        entryGroup.subList?.push({
          name: item.jsonData.metadata.name,
          label: item.jsonData.spec.names.kind,
          isCR: true,
        });
        //entryGroup.subList =
      }
    });
    entriesGroup.forEach(item => {
      crdsSidebarEntries.push(item);
    });
    return sortSidebarItems(crdsSidebarEntries);
  }, [sidebarName, crds]);

  const sidebars = useMemo(() => {
    const homeItems: SidebarItemProps[] = [
      {
        name: 'home',
        icon: shouldShowHomeItem ? 'mdi:home' : 'mdi:hexagon-multiple-outline',
        label: shouldShowHomeItem ? t('translation|Home') : t('glossary|Cluster'),
        url: shouldShowHomeItem
          ? '/'
          : createRouteURL('cluster', { cluster: Object.keys(clusters)[0] }),
        divider: !shouldShowHomeItem,
      },
      {
        name: 'notifications',
        icon: 'mdi:bell',
        label: t('translation|Notifications'),
        url: '/notifications',
      },
      {
        name: 'settings',
        icon: 'mdi:cog',
        label: t('translation|Settings'),
        url: '/settings/general',
        subList: [
          {
            name: 'settingsGeneral',
            label: t('translation|General'),
            url: '/settings/general',
          },
          {
            name: 'plugins',
            label: t('translation|Plugins'),
            url: '/settings/plugins',
          },
          {
            name: 'settingsCluster',
            label: t('glossary|Cluster'),
            url: '/settings/cluster',
          },
        ],
      },
    ];
    const inClusterItems: SidebarItemProps[] = [
      {
        name: 'home',
        icon: 'mdi:home',
        label: t('translation|Home'),
        url: '/',
        hide: !shouldShowHomeItem,
      },

      {
        name: 'cluster',
        label: selectedClusters.length ? t('Clusters') : t('glossary|Cluster'),
        subtitle: selectedClusters.join('\n') || undefined,
        icon: 'mdi:hexagon-multiple-outline',
        subList: [
          {
            name: 'namespaces',
            label: t('glossary|Namespaces'),
          },
          {
            name: 'nodes',
            label: t('glossary|Nodes'),
          },
          {
            name: 'advancedSearch',
            label: t('Advanced Search (Beta)'),
          },
        ],
      },
      {
        name: 'map',
        icon: 'mdi:map',
        label: t('glossary|Map'),
      },
      {
        name: 'workloads',
        label: t('glossary|Workloads'),
        icon: 'mdi:circle-slice-2',
        subList: [
          {
            name: 'Pods',
            label: t('glossary|Pods'),
          },
          {
            name: 'Deployments',
            label: t('glossary|Deployments'),
          },
          {
            name: 'StatefulSets',
            label: t('glossary|Stateful Sets'),
          },
          {
            name: 'DaemonSets',
            label: t('glossary|Daemon Sets'),
          },
          {
            name: 'ReplicaSets',
            label: t('glossary|Replica Sets'),
          },
          {
            name: 'Jobs',
            label: t('glossary|Jobs'),
          },
          {
            name: 'CronJobs',
            label: t('glossary|CronJobs'),
          },
        ],
      },
      {
        name: 'storage',
        label: t('glossary|Storage'),
        icon: 'mdi:database',
        subList: [
          {
            name: 'persistentVolumeClaims',
            label: t('glossary|Persistent Volume Claims'),
          },
          {
            name: 'persistentVolumes',
            label: t('glossary|Persistent Volumes'),
          },
          {
            name: 'storageClasses',
            label: t('glossary|Storage Classes'),
          },
        ],
      },
      {
        name: 'network',
        label: t('glossary|Network'),
        icon: 'mdi:folder-network-outline',
        subList: [
          {
            name: 'services',
            label: t('glossary|Services'),
          },
          {
            name: 'endpoints',
            label: t('glossary|Endpoints'),
          },
          {
            name: 'ingresses',
            label: t('glossary|Ingresses'),
          },
          {
            name: 'ingressclasses',
            label: t('glossary|Ingress Classes'),
          },
          {
            name: 'portforwards',
            label: t('glossary|Port Forwarding'),
            hide: !isElectron(),
          },
          {
            name: 'NetworkPolicies',
            label: t('glossary|Network Policies'),
          },
        ],
      },
      {
        name: 'gatewayapi',
        label: t('glossary|Gateway (beta)'),
        icon: 'mdi:lan-connect',
        subList: [
          {
            name: 'gateways',
            label: t('glossary|Gateways'),
          },
          {
            name: 'gatewayclasses',
            label: t('glossary|Gateway Classes'),
          },
          {
            name: 'httproutes',
            label: t('glossary|HTTP Routes'),
          },
          {
            name: 'grpcroutes',
            label: t('glossary|GRPC Routes'),
          },
          {
            name: 'referencegrants',
            label: t('glossary|Reference Grants'),
          },
          {
            name: 'backendtlspolicies',
            label: t('glossary|BackendTLSPolicies'),
          },
          {
            name: 'backendtrafficpolicies',
            label: t('glossary|BackendTrafficPolicies'),
          },
        ],
      },
      {
        name: 'security',
        label: t('glossary|Security'),
        icon: 'mdi:lock',
        subList: [
          {
            name: 'serviceAccounts',
            label: t('glossary|Service Accounts'),
          },
          {
            name: 'roles',
            label: t('glossary|Roles'),
          },
          {
            name: 'roleBindings',
            label: t('glossary|Role Bindings'),
          },
        ],
      },
      {
        name: 'config',
        label: t('glossary|Configuration'),
        icon: 'mdi:format-list-checks',
        subList: [
          {
            name: 'configMaps',
            label: t('glossary|Config Maps'),
          },
          {
            name: 'secrets',
            label: t('glossary|Secrets'),
          },
          {
            name: 'horizontalPodAutoscalers',
            label: t('glossary|HPAs'),
          },
          {
            name: 'verticalPodAutoscalers',
            label: t('glossary|VPAs'),
          },
          {
            name: 'podDisruptionBudgets',
            label: t('glossary|Pod Disruption Budgets'),
          },
          {
            name: 'resourceQuotas',
            label: t('glossary|Resource Quotas'),
          },
          {
            name: 'limitRanges',
            label: t('glossary|Limit Ranges'),
          },
          {
            name: 'priorityClasses',
            label: t('glossary|Priority Classes'),
          },
          {
            name: 'runtimeClasses',
            label: t('glossary|Runtime Classes'),
          },
          {
            name: 'leases',
            label: t('glossary|Leases'),
          },
          {
            name: 'mutatingWebhookConfigurations',
            label: t('glossary|Mutating Webhook Configurations'),
          },
          {
            name: 'validatingWebhookConfigurations',
            label: t('glossary|Validating Webhook Configurations'),
          },
        ],
      },
    ];

    if (crdsSidebarEntries.length !== 0) {
      const sublist: SidebarItemProps[] = [
        {
          name: 'crs',
          label: t('translation|Instances'),
          divider: true,
        },
      ];

      crdsSidebarEntries.forEach(item => {
        sublist.push(item);
      });
      inClusterItems.push({
        name: 'crds',
        label: t('glossary|Custom Resources'),
        icon: 'mdi:puzzle',
        subList: sublist,
      });
    } else {
      inClusterItems.push({
        name: 'crds',
        label: t('glossary|Custom Resources'),
        icon: 'mdi:puzzle',
        subList: [
          {
            name: 'crs',
            label: t('translation|Instances'),
          },
        ],
      });
    }

    // List of sidebars, they act as roots for the sidebar tree
    const sidebarsList: SidebarItemProps[] = [
      { name: DefaultSidebars.HOME, subList: homeItems, label: '' },
      { name: DefaultSidebars.IN_CLUSTER, subList: inClusterItems, label: '' },
    ];

    // Create a copy of all the custom entries so we don't accidentaly mutate them
    const customEntries = _.cloneDeep(Object.values(customSidebarEntries));

    // Lookup map of every sidebar entry
    const entryLookup = new Map<string, SidebarItemProps>();

    // Put all the entries in the map
    forEachEntry(sidebarsList, item => entryLookup.set(item.name, item));
    forEachEntry(customEntries, item => entryLookup.set(item.name, item));

    // Place all custom entries in the tree
    customEntries.forEach(item => {
      if (item.parent) {
        const parentEntry = entryLookup.get(item.parent);
        if (!parentEntry) {
          return;
        }
        parentEntry.subList ??= [];
        parentEntry?.subList?.push(item);
      } else {
        const sidebar = item.sidebar ?? DefaultSidebars.IN_CLUSTER;
        let sidebarEntry = entryLookup.get(sidebar);

        // Create the sidebar entry if it doesn't exist
        if (!sidebarEntry) {
          sidebarEntry = { name: sidebar, subList: [], label: '' };
          sidebarsList.push(sidebarEntry);
          entryLookup.set(sidebar, sidebarEntry);
        }

        sidebarEntry.subList?.push(item);
      }
    });

    const sidebars = Object.fromEntries(sidebarsList.map(item => [item.name, item.subList]));

    // Filter in-cluster sidebar
    if (customSidebarFilters.length > 0) {
      const filterSublist = (item: SidebarItemProps, filter: any) => {
        if (item.subList) {
          item.subList = item.subList.filter(it => filter(it));
          item.subList = item.subList.map(it => filterSublist(it, filter));
        }

        return item;
      };

      customSidebarFilters.forEach(customFilter => {
        sidebars[DefaultSidebars.IN_CLUSTER] = sidebars[DefaultSidebars.IN_CLUSTER]!.filter(it =>
          customFilter(it)
        ).map(it => filterSublist(it, customFilter));
      });
    }

    return sidebars;
  }, [
    customSidebarEntries,
    shouldShowHomeItem,
    Object.keys(clusters).join(','),
    selectedClusters.join(','),
    crdsSidebarEntries,
    t,
  ]);

  const unsortedItems =
    sidebars[sidebarName === '' ? DefaultSidebars.IN_CLUSTER : sidebarName] ?? [];

  const sortedItems = useMemo(() => {
    // Make a deep copy so that we always start from the original (unsorted) order.
    const itemsCopy = _.cloneDeep(unsortedItems);
    return settings?.sidebarSortAlphabetically ? sortSidebarItems(itemsCopy) : itemsCopy;
  }, [unsortedItems, settings.sidebarSortAlphabetically]);

  return sortedItems;
};
