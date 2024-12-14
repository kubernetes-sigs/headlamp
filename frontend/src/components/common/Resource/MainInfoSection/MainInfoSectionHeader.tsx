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
import React from 'react';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../../lib/k8s/KubeObject';
import { HeaderAction } from '../../../../redux/actionButtonsSlice';
import SectionHeader, { HeaderStyle } from '../../SectionHeader';
import { useResourceMenuActionItems } from '../resourceActionsMenu';

export interface MainInfoHeaderProps<T extends KubeObject> {
  resource: T | null;
  headerSection?: ((resource: T | null) => React.ReactNode) | React.ReactNode;
  title?: string;
  actions?:
    | ((resource: T | null) => React.ReactNode[] | HeaderAction[] | null)
    | React.ReactNode[]
    | null
    | HeaderAction[];
  headerStyle?: HeaderStyle;
  noDefaultActions?: boolean;
  /** The route or location to go to. If it's an empty string, then the "browser back" function is used. If null, no back button will be shown. */
  backLink?: string | ReturnType<typeof useLocation> | null;
}

export function MainInfoHeader<T extends KubeObject>(props: MainInfoHeaderProps<T>) {
  const { resource, title, actions = [], headerStyle = 'main', noDefaultActions = false } = props;
  const allActions = useResourceMenuActionItems(resource, 'action', actions, noDefaultActions);
  return (
    <SectionHeader
      title={title || (resource ? `${resource.kind}: ${resource.getName()}` : '')}
      headerStyle={headerStyle}
      actions={allActions}
    />
  );
}
