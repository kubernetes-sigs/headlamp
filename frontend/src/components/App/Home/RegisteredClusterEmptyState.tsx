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

import { createElement, ReactNode } from 'react';
import { useTypedSelector } from '../../../redux/hooks';

/** Properties for the registered cluster empty-state renderer. */
interface RegisteredClusterEmptyStateProps {
  /** Headlamp's standard no-cluster content. */
  defaultContent: ReactNode;
}

/** Render a plugin-provided cluster empty state or Headlamp's standard content. */
export default function RegisteredClusterEmptyState({
  defaultContent,
}: RegisteredClusterEmptyStateProps): ReactNode {
  const ClusterEmptyState = useTypedSelector(state => state.clusterProvider.clusterEmptyState);

  return ClusterEmptyState ? createElement(ClusterEmptyState, { defaultContent }) : defaultContent;
}
