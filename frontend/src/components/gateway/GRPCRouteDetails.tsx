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

import { useParams } from 'react-router-dom';
import GRPCRoute from '../../lib/k8s/grpcRoute';
import { DetailsGrid } from '../common/Resource';
import { GatewayParentRefSection } from './utils';

export default function GRPCRouteDetails(props: { name?: string; namespace?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace } = props;

  return (
    <DetailsGrid
      resourceType={GRPCRoute}
      name={name}
      namespace={namespace}
      withEvents
      extraSections={(item: GRPCRoute) =>
        item && [
          {
            id: 'headlamp.httproute-parentrefs',
            section: <GatewayParentRefSection parentRefs={item?.parentRefs || []} />,
          },
        ]
      }
    />
  );
}
