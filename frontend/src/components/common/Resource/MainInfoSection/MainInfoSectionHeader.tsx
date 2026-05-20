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

import { Icon } from '@iconify/react';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { has } from 'lodash';
import React, { isValidElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../../lib/k8s/KubeObject';
import { useId } from '../../../../lib/util';
import {
  DefaultHeaderAction,
  HeaderAction,
  HeaderActionType,
} from '../../../../redux/actionButtonsSlice';
import { dispatchResourceAction, ResourceAction } from '../../../../redux/actionButtonsSlice';
import { useAppDispatch, useTypedSelector } from '../../../../redux/hooks';
import ActionButton from '../../ActionButton';
import ErrorBoundary from '../../ErrorBoundary';
import SectionHeader, { HeaderStyle } from '../../SectionHeader';
import CopyButton from '../CopyButton';
import DeleteButton from '../DeleteButton';
import EditButton from '../EditButton';
import { RestartButton } from '../RestartButton';
import ScaleButton from '../ScaleButton';

export function ResourceActionButton({
  action,
  resource,
}: {
  action: ResourceAction;
  resource: KubeObject;
}) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = React.useState(false);
  const { t } = useTranslation(['translation']);

  const handleExecute = React.useCallback(async () => {
    setLoading(true);
    try {
      await dispatchResourceAction(dispatch, t, action, resource);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [action, resource, dispatch, t]);

  return (
    <ActionButton
      description={action.label}
      icon={action.icon || 'mdi:play-circle'}
      onClick={handleExecute}
      iconButtonProps={{
        disabled: loading,
      }}
    />
  );
}

export function ResourceActionsDropdown({
  actions,
  resource,
}: {
  actions: ResourceAction[];
  resource: KubeObject;
}) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['translation']);
  const menuId = useId('custom-actions-menu');
  const buttonId = useId('custom-actions-menu-button');

  const handleOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <IconButton
        id={buttonId}
        aria-label={t('translation|More actions')}
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchorEl)}
        aria-controls={anchorEl ? menuId : undefined}
      >
        <Icon icon="mdi:dots-vertical" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        id={menuId}
        MenuListProps={{
          'aria-labelledby': buttonId,
        }}
      >
        {actions.map(action => {
          const handleExecute = async () => {
            handleClose();
            await dispatchResourceAction(dispatch, t, action, resource);
          };

          return (
            <MenuItem key={action.id} onClick={handleExecute}>
              {action.icon && (
                <ListItemIcon>
                  <Icon icon={action.icon} />
                </ListItemIcon>
              )}
              <ListItemText>{action.label}</ListItemText>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

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
  const { t } = useTranslation(['translation']);
  const headerActions = useTypedSelector(state => state.actionButtons?.headerActions || []);
  const headerActionsProcessors = useTypedSelector(
    state => state.actionButtons?.headerActionsProcessors || []
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
    } else if (typeof Action === 'function' && resource) {
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

  const resourceActionProviders = useTypedSelector(
    state => state.actionButtons?.resourceActionProviders || []
  );

  const customActions: ResourceAction[] = [];
  if (resource) {
    for (const provider of resourceActionProviders) {
      try {
        const res = provider(resource, t);
        if (res) {
          if (Array.isArray(res)) {
            customActions.push(...res);
          } else {
            customActions.push(res);
          }
        }
      } catch (err) {
        console.error('Error invoking resourceActionProvider:', err);
      }
    }
  }

  const visibleCustomActions = customActions.filter(action => {
    if (action.visible === undefined) return true;
    if (typeof action.visible === 'function') {
      try {
        return action.visible(resource!);
      } catch (err) {
        console.error('Error checking custom action visibility:', err);
        return false;
      }
    }
    return !!action.visible;
  });

  const primaryCustomActions = visibleCustomActions.filter(action => action.type === 'primary');
  const secondaryCustomActions = visibleCustomActions.filter(action => action.type !== 'primary');

  const customActionsElements = primaryCustomActions.map(action => (
    <ResourceActionButton key={action.id} action={action} resource={resource!} />
  ));

  if (secondaryCustomActions.length > 0) {
    customActionsElements.push(
      <ResourceActionsDropdown
        key="secondary-dropdown"
        actions={secondaryCustomActions}
        resource={resource!}
      />
    );
  }

  const allActions = React.Children.toArray(
    (function propsActions() {
      const pluginAddedActions = actionsProcessed.map(setupAction);
      return React.Children.toArray([...pluginAddedActions, ...customActionsElements]);
    })()
  );

  return (
    <SectionHeader
      title={title || (resource ? `${resource.kind}: ${resource.getName()}` : '')}
      headerStyle={headerStyle}
      titleSideActions={resource ? [<CopyButton text={resource?.getName()} />] : []}
      actions={allActions}
    />
  );
}
