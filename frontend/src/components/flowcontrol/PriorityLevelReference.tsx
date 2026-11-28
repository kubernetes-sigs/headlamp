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

import FlowSchema from '../../lib/k8s/flowSchema';
import PriorityLevelConfiguration from '../../lib/k8s/priorityLevelConfiguration';
import Link from '../common/Link';

export default function PriorityLevelReference({ schema }: { schema: FlowSchema }) {
  const name = schema.priorityLevelName;

  if (!name || schema.isDangling) {
    return name || '-';
  }

  return (
    <Link
      routeName={PriorityLevelConfiguration.detailsRoute}
      params={{ name }}
      activeCluster={schema.cluster}
    >
      {name}
    </Link>
  );
}
