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

import { createSelector } from '@reduxjs/toolkit';
import type { i18n } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { ConfigState } from '../redux/configSlice';
import { useTypedSelector } from '../redux/hooks';
import { createClusterPresentation, EMPTY_SOURCE_VIEWS } from './clusterPresentation';

type PresentationState = { config?: Partial<ConfigState> };

const selectConnections = createSelector(
  [
    (state: PresentationState) => state.config?.allClusters,
    (state: PresentationState) => state.config?.clusters,
    (state: PresentationState) => state.config?.statelessClusters,
  ],
  (all, server, stateless) => Object.values({ ...all, ...server, ...stateless })
);

// Shared across consumers, including row menus; unrelated settings do not rebuild the index.
export const selectClusterPresentation = createSelector(
  [
    selectConnections,
    (state: PresentationState) => state.config?.clusterSources || EMPTY_SOURCE_VIEWS,
    (_state: PresentationState, language: string) => language,
    (_state: PresentationState, _language: string, instance?: i18n) => instance,
  ],
  (clusters, sources, language, instance) => ({
    clusters,
    sources,
    ...createClusterPresentation(clusters, sources, instance?.getFixedT(language, 'translation')),
  })
);

/** Resolve labels without changing keys used by routes, plugins or persisted settings. */
export function useClusterPresentation() {
  const { i18n: instance, ready } = useTranslation();
  const language = instance?.resolvedLanguage || instance?.language || 'en';
  return useTypedSelector(state =>
    selectClusterPresentation(state, language, ready ? instance : undefined)
  );
}
