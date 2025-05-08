import { has } from 'lodash';
import { MRT_Row } from 'material-react-table';
import { isValidElement } from 'react';
import React from 'react';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import {
  DefaultHeaderAction,
  HeaderAction,
  HeaderActionType,
} from '../../../redux/actionButtonsSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import { ButtonStyle } from '../ActionButton/ActionButton';
import ErrorBoundary from '../ErrorBoundary';
import DeleteButton from './DeleteButton';
import EditButton from './EditButton';
import { RestartButton } from './RestartButton';
import ScaleButton from './ScaleButton';

/**
 * useResourceMenuActions is a hook that returns a list of actions for a resource.
 *
 * It takes a resource, button style, actions, noDefaultActions flag, and closeMenu function as parameters.
 * It uses the headerActions and headerActionsProcessors from the redux store to process the actions.
 * It also sets up the action components based on the provided actions and default actions.
 *
 * @template T - The type of the resource.
 *
 * @param resource
 * @param buttonStyle - The style of the button.
 * @param actions - The actions to be displayed in the menu.
 * @param noDefaultActions - A flag to indicate if default actions should be included.
 * @param closeMenu - A function to close the menu.
 * @returns The menu items for the resource.
 */
export function useResourceMenuActionItems<T extends KubeObject>(
  resource: T | null,
  buttonStyle: ButtonStyle,
  actions:
    | ((resource: T | null) => React.ReactNode[] | HeaderAction[] | null)
    | React.ReactNode[]
    | null
    | HeaderAction[],
  noDefaultActions?: boolean,
  closeMenu?: () => void
): React.ReactNode[] {
  const headerActions = useTypedSelector(state => state.actionButtons.headerActions);
  const headerActionsProcessors = useTypedSelector(
    state => state.actionButtons.headerActionsProcessors
  );

  const setupAction = React.useCallback(
    (headerAction: HeaderAction) => {
      let Action = has(headerAction, 'action') ? headerAction.action : headerAction;

      if (!noDefaultActions && has(headerAction, 'id')) {
        switch (headerAction.id) {
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

      if (!Action || headerAction.action === null) {
        return null;
      }

      if (isValidElement(Action)) {
        return <ErrorBoundary>{Action}</ErrorBoundary>;
      } else if (Action === null) {
        return null;
      } else if (typeof Action === 'function') {
        return (
          <ErrorBoundary>
            <Action item={resource} buttonStyle={buttonStyle} closeMenu={closeMenu} />
          </ErrorBoundary>
        );
      }
    },
    [buttonStyle, closeMenu, noDefaultActions, resource]
  );

  return React.useMemo(() => {
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
    return allActions;
  }, [actions, headerActions, headerActionsProcessors, resource, setupAction]);
}

/**
 * useTableRenderRowActionMenuItems makes a renderer of menu items for a resource item in a Table.
 *
 * @param actions - The actions to be displayed in the menu.
 * @param enabled - A boolean indicating if the actions are enabled.
 *
 * returns a component renders MenuItems for an actions menu.
 */
export function useTableRenderRowActionMenuItems<T extends KubeObject>(
  actions: HeaderAction[] | null | undefined,
  enabled: boolean
) {
  return React.useCallback(
    ({ closeMenu, row }: { closeMenu: () => void; row: MRT_Row<Record<string, any>> }) => {
      const actionsProcessed = useResourceMenuActionItems<T>(
        row.original as T,
        'menu',
        actions || [],
        false,
        closeMenu
      );
      if (!enabled) {
        return [];
      }
      return actionsProcessed;
    },
    [actions, enabled]
  );
}
