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

import { ExoticComponent, ReactNode } from 'react';
import type { DefaultSidebars } from '../../components/Sidebar';

export interface Route {
  /** Any valid URL path or array of paths that path-to-regexp@^1.7.0 understands. */
  path: string;
  /** When true, will only match if the path matches the location.pathname exactly. */
  exact?: boolean;
  /** Human readable name. Capitalized and short. */
  name?: string;
  /**
   * In case this route does *not* need a cluster prefix and context.
   * @deprecated please use useClusterURL.
   */
  noCluster?: boolean;
  /**
   * Should URL have the cluster prefix? (default=true)
   */
  useClusterURL?: boolean;
  /** This route does not require Authentication. */
  noAuthRequired?: boolean;
  /** The sidebar entry this Route should enable, or null if it shouldn't enable any. If an object is passed with item and sidebar, it will try to enable the given sidebar and the given item. */
  sidebar: string | null | { item: string | null; sidebar: string | DefaultSidebars };
  /** Shown component for this route. */
  component: ExoticComponent<{}> | (() => ReactNode);
  /** Hide the appbar at the top. */
  hideAppBar?: boolean;
  /** Whether the route should be disabled (not registered). */
  disabled?: boolean;
  /** Render route for full width */
  isFullWidth?: boolean;
}
