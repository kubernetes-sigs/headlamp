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

import UDPRoute from '../../lib/k8s/udpRoute';
import L4RouteDetails from './L4RouteDetails';

export default function UDPRouteDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  return <L4RouteDetails resourceClass={UDPRoute} {...props} />;
}
