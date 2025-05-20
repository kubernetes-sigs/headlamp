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

import React, { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { KubeObject, KubeObjectClass } from '../../../lib/k8s/KubeObject';
import { CreateResourceButton } from '../CreateResourceButton';
import SectionBox from '../SectionBox';
import SectionFilterHeader, { SectionFilterHeaderProps } from '../SectionFilterHeader';
import ResourceTable, { ResourceTableProps } from './ResourceTable';

export interface ResourceListViewProps<Item extends KubeObject>
  extends PropsWithChildren<Omit<ResourceTableProps<Item>, 'data'>> {
  title: ReactNode;
  headerProps?: Omit<SectionFilterHeaderProps, 'title'>;
  data: Item[] | null;
}

export interface ResourceListViewWithResourceClassProps<ItemClass extends KubeObjectClass>
  extends PropsWithChildren<Omit<ResourceTableProps<InstanceType<ItemClass>>, 'data'>> {
  title: ReactNode;
  headerProps?: Omit<SectionFilterHeaderProps, 'title'>;
  resourceClass: ItemClass;
}

export default function ResourceListView<ItemClass extends KubeObjectClass>(
  props: ResourceListViewWithResourceClassProps<ItemClass>
): ReactElement;
export default function ResourceListView<Item extends KubeObject<any>>(
  props: ResourceListViewProps<Item>
): ReactElement;
export default function ResourceListView(
  props: ResourceListViewProps<any> | ResourceListViewWithResourceClassProps<any>
) {
  const { title, children, headerProps, ...tableProps } = props;
  const withNamespaceFilter = 'resourceClass' in props && props.resourceClass?.isNamespaced;
  const resourceClass = (props as ResourceListViewWithResourceClassProps<any>)
    .resourceClass as KubeObjectClass;

  return (
    <SectionBox
      title={
        typeof title === 'string' ? (
          <SectionFilterHeader
            title={title}
            noNamespaceFilter={!withNamespaceFilter}
            titleSideActions={
              headerProps?.titleSideActions ||
              (resourceClass ? [<CreateResourceButton resourceClass={resourceClass} />] : undefined)
            }
            {...headerProps}
          />
        ) : (
          title
        )
      }
    >
      <ResourceTable enableRowActions enableRowSelection {...tableProps} />
      {children}
    </SectionBox>
  );
}
