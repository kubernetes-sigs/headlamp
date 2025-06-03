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

import { has } from 'lodash';
import React, { isValidElement } from 'react';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../../lib/k8s/KubeObject';
import {
  DefaultHeaderAction,
  HeaderAction,
  HeaderActionType,
} from '../../../../redux/actionButtonsSlice';
import { useTypedSelector } from '../../../../redux/hooks';
import ErrorBoundary from '../../ErrorBoundary';
import SectionHeader, { HeaderStyle } from '../../SectionHeader';
import DeleteButton from '../DeleteButton';
import EditButton from '../EditButton';
import { RestartButton } from '../RestartButton';
import ScaleButton from '../ScaleButton';

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
  const headerActions = useTypedSelector(state => state.actionButtons.headerActions);
  const headerActionsProcessors = useTypedSelector(
    state => state.actionButtons.headerActionsProcessors
  );
  function setupAction(headerAction: HeaderAction) {
    let Action = has(headerAction, 'action') ? (headerAction as any).action : headerAction;

    if (!noDefaultActions && has(headerAction, 'id')) {
      switch ((headerAction as HeaderAction).id) {
        case DefaultHeaderAction.RESTART:
          Action = RestartButton;
          break;
        case DefaultHeaderAction.SCALE:
          Action = ScaleButton;
          break;
        case DefaultHeaderAction.EDIT:
          Action = EditButton;
          break;
        case DefaultHeaderAction.DELETE:
          Action = DeleteButton;
          break;
        default:
          break;
      }
    }

    if (!Action || (headerAction as unknown as HeaderAction).action === null) {
      return null;
    }

    if (isValidElement(Action)) {
      return <ErrorBoundary>{Action}</ErrorBoundary>;
    } else if (Action === null) {
      return null;
    } else if (typeof Action === 'function') {
      return (
        <ErrorBoundary>
          <Action item={resource} />
        </ErrorBoundary>
      );
    }
  }

  const defaultActions = [
    {
      id: DefaultHeaderAction.RESTART,
    },
    {
      id: DefaultHeaderAction.SCALE,
    },
    {
      id: DefaultHeaderAction.EDIT,
    },
    {
      id: DefaultHeaderAction.DELETE,
    },
  ];

  let hAccs: HeaderAction[] = [];
  const accs = typeof actions === 'function' ? actions(resource) || [] : actions;
  if (accs !== null) {
    hAccs = [...accs].map((action, i): HeaderAction => {
      if ((action as HeaderAction)?.id !== undefined) {
        return action as HeaderAction;
      } else {
        return { id: `gen-${i}`, action: action as HeaderActionType };
      }
    });
  }

  let actionsProcessed = [...headerActions, ...hAccs, ...defaultActions];
  if (headerActionsProcessors.length > 0) {
    for (const headerProcessor of headerActionsProcessors) {
      actionsProcessed = headerProcessor.processor(resource, actionsProcessed);
    }
  }

  const allActions = React.Children.toArray(
    (function propsActions() {
      const pluginAddedActions = actionsProcessed.map(setupAction);
      return React.Children.toArray(pluginAddedActions);
    })()
  );

  return (
    <SectionHeader
      title={title || (resource ? `${resource.kind}: ${resource.getName()}` : '')}
      headerStyle={headerStyle}
      actions={allActions}
    />
  );
}
