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
import { useMemo } from 'react';
import Gateway from '../../lib/k8s/gateway';
import GatewayClass from '../../lib/k8s/gatewayClass';
import GatewayClassDetailView from './ClassDetails';
import GatewayDetailView from './GatewayDetails';

export const makeKubeToKubeEdge = (from: any, to: any): any => ({
  id: `${from.metadata.uid}-${to.metadata.uid}`,
  source: from.metadata.uid,
  target: to.metadata.uid,
});

const GatewayClassDetails = ({ node }: any) => {
  return <GatewayClassDetailView name={node.kubeObject.jsonData.metadata.name} />;
};

const GatewayDetails = ({ node }: any) => (
  <GatewayDetailView
    name={node.kubeObject.jsonData.metadata.name}
    namespace={node.kubeObject.jsonData.metadata.namespace}
  />
);

const gatewayClassSource = {
  id: 'gateway-classes',
  label: 'GatewayClass',
  icon: <Icon icon="mdi:gate" width="100%" height="100%" color="rgb(50, 108, 229)" />,
  useData() {
    const [gatewayClasses] = GatewayClass.useList();
    const [gateways] = Gateway.useList();

    return useMemo(() => {
      if (!gatewayClasses || !gateways) return null;

      const nodes = gatewayClasses.map(it => ({
        id: it.metadata.uid,
        kubeObject: it,
        detailsComponent: GatewayClassDetails,
      }));

      const edges: any[] = [];

      gatewayClasses.forEach(gc => {
        const className = gc.metadata.name;
        gateways
          ?.filter(gw => gw.jsonData.spec?.gatewayClassName === className)
          .forEach(gw => {
            edges.push(makeKubeToKubeEdge(gc, gw));
          });
      });

      return {
        nodes,
        edges,
      };
    }, [gatewayClasses, gateways]);
  },
};

const gatewaySource = {
  id: 'gateways',
  label: 'Gateway',
  icon: <Icon icon="mdi:gate" width="100%" height="100%" color="rgb(50, 108, 229)" />,
  useData() {
    const [gateways] = Gateway.useList();

    return useMemo(() => {
      if (!gateways) return null;

      const nodes = gateways.map(it => ({
        id: it.metadata.uid,
        kubeObject: it,
        detailsComponent: GatewayDetails,
      }));

      const edges: any[] = [];

      return {
        nodes,
        edges,
      };
    }, [gateways]);
  },
};

export const gatewayMapSource = {
  id: 'gateway-api',
  label: 'Gateway API',
  icon: <Icon icon="mdi:gate" width="100%" height="100%" color="rgb(50, 108, 229)" />,
  sources: [gatewayClassSource, gatewaySource],
};
