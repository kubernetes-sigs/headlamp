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

import React, { isValidElement, ReactElement, ReactNode, useMemo } from 'react';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { useTypedSelector } from '../../redux/reducers/reducers';
import ErrorBoundary from '../common/ErrorBoundary';

export interface DetailsViewSectionProps {
  resource: KubeObject;
}
export type DetailsViewSectionType =
  | ((...args: any[]) => ReactNode)
  | null
  | ReactElement
  | ReactNode;

/**
 * View components registered by plugins in the different Details views.
 *
 * @see registerDetailsViewSection
 */
export default function DetailsViewSection(props: DetailsViewSectionProps) {
  const { resource } = props;
  const detailViews = useTypedSelector(state => state.detailsViewSection.detailViews);
  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.DETAILS_VIEW);

  React.useEffect(() => {
    dispatchHeadlampEvent({ resource });
  }, [resource]);

  const memoizedComponents = useMemo(
    () =>
      detailViews.map((Component, index) => {
        if (!resource || !Component) {
          return null;
        }

        return <ErrorBoundary key={index}>{isValidElement(Component) && Component}</ErrorBoundary>;
      }),
    [detailViews, resource]
  );
  return <>{memoizedComponents}</>;
}
