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

import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Namespace from '../../../lib/k8s/namespace';
import Pod from '../../../lib/k8s/pod';
import { useId } from '../../../lib/util';
import { CallbackActionOptions, clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { useSettings } from '../../App/Settings/hook';
import ActionButton, { ButtonStyle } from '../ActionButton';
import { ConfirmDialog } from '../Dialog';
import AuthVisible from './AuthVisible';

type DeleteAction = 'delete' | 'evict';

interface DeleteButtonProps {
  item?: KubeObject;
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

export default function DeleteButton(props: DeleteButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const settingsObj = useSettings();

  const { item, options, buttonStyle, afterConfirm } = props;
  const [openAlert, setOpenAlert] = React.useState(false);
  const [forceDelete, setForceDelete] = React.useState(false);
  // For protected (system) namespaces the user must type the name to confirm deletion.
  const [confirmInput, setConfirmInput] = React.useState('');
  const location = useLocation();
  const { t } = useTranslation(['translation']);
  const dispatchDeleteEvent = useEventCallback(HeadlampEventType.DELETE_RESOURCE);

  // Pods offer both delete and evict; other resources only delete. `action` is
  // the one currently being confirmed, defaulting to the useEvict setting.
  const isPod = item?.kind === 'Pod';
  const [action, setAction] = React.useState<DeleteAction>(
    settingsObj.useEvict && isPod ? 'evict' : 'delete'
  );
  const [menuAnchorEl, setMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const menuId = useId('delete-button-menu');

  // Delete and evict are different API operations with different RBAC verbs (evict is
  // a "create" on the pods/eviction subresource, not a pod "delete"), so each is
  // checked and shown independently rather than gating both behind one authVerb.
  const [canDelete, setCanDelete] = React.useState(false);
  const [canEvict, setCanEvict] = React.useState(false);

  const deleteFunc = React.useCallback(
    () => {
      if (!item) {
        return;
      }

      const isEvict = action === 'evict' && item.kind === 'Pod';
      let callback = item!.delete;
      if (isEvict) {
        const pod = item as Pod;
        callback = pod.evict;
      }

      const itemName = item!.metadata.name;

      callback &&
        dispatch(
          clusterAction(callback.bind(item), {
            callbackArgs: [forceDelete],
            startMessage: isEvict
              ? t('Evicting pod {{ itemName }}…', { itemName })
              : t('Deleting item {{ itemName }}…', { itemName }),
            cancelledMessage: isEvict
              ? t('Cancelled eviction of {{ itemName }}.', { itemName })
              : t('Cancelled deletion of {{ itemName }}.', { itemName }),
            successMessage: isEvict
              ? t('Evicted pod {{ itemName }}.', { itemName })
              : t('Deleted item {{ itemName }}.', { itemName }),
            errorMessage: isEvict
              ? t('Error evicting pod {{ itemName }}.', { itemName })
              : t('Error deleting item {{ itemName }}.', { itemName }),
            cancelUrl: location.pathname,
            startUrl: item!.getListLink(),
            errorUrl: item!.getListLink(),
            ...options,
          })
        );
    },
    // eslint-disable-next-line
    [item, forceDelete, action]
  );

  if (!item) {
    return null;
  }

  // System namespaces require an extra type-to-confirm step before they can be deleted.
  const isProtectedNamespace = Namespace.isClassOf(item) && item.isProtected();
  // Use the same label-or-name value that isProtected() checks so the confirmation prompt matches.
  const namespaceName = item.metadata.labels?.['kubernetes.io/metadata.name'] || item.metadata.name;

  const openDialogFor = (nextAction: DeleteAction) => {
    setAction(nextAction);
    setConfirmInput('');
    setForceDelete(false);
    setMenuAnchorEl(null);
    setOpenAlert(true);
  };

  const defaultAction: DeleteAction = settingsObj.useEvict ? 'evict' : 'delete';
  const alternateAction: DeleteAction = defaultAction === 'evict' ? 'delete' : 'evict';
  const label = (a: DeleteAction) =>
    a === 'evict' ? t('translation|Evict') : t('translation|Delete');
  const icon = (a: DeleteAction) => (a === 'evict' ? 'mdi:logout' : 'mdi:delete');

  // Only offer actions the user is actually authorized for. Evict never applies to
  // non-pod resources.
  const availableActions: DeleteAction[] = (
    isPod ? [defaultAction, alternateAction] : (['delete'] as DeleteAction[])
  ).filter(a => (a === 'evict' ? canEvict : canDelete));

  return (
    <>
      <AuthVisible
        item={item}
        authVerb="delete"
        onAuthResult={result => setCanDelete(result.allowed)}
        onError={(err: Error) => {
          console.error(`Error while getting authorization for delete button in ${item}:`, err);
        }}
      />
      {isPod && (
        <AuthVisible
          item={item}
          authVerb="create"
          subresource="eviction"
          onAuthResult={result => setCanEvict(result.allowed)}
          onError={(err: Error) => {
            console.error(`Error while getting authorization for evict button in ${item}:`, err);
          }}
        />
      )}

      {availableActions.length > 0 && (
        <>
          {isPod && buttonStyle === 'menu' ? (
            // Inside a row's overflow menu a split button can't nest, so offer each
            // authorized action as a separate menu item.
            <>
              {availableActions.map(a => (
                <ActionButton
                  key={a}
                  description={label(a)}
                  buttonStyle="menu"
                  onClick={() => openDialogFor(a)}
                  icon={icon(a)}
                />
              ))}
            </>
          ) : availableActions.length === 2 ? (
            // Split button: the default action from the useEvict setting, with the
            // other authorized option available in the dropdown.
            <>
              <ActionButton
                description={label(defaultAction)}
                buttonStyle={buttonStyle}
                onClick={() => openDialogFor(defaultAction)}
                icon="mdi:delete"
              />
              <ActionButton
                description={t('translation|More delete options')}
                buttonStyle={buttonStyle}
                onClick={(event: React.MouseEvent<HTMLElement>) =>
                  setMenuAnchorEl(event.currentTarget)
                }
                icon="mdi:menu-down"
                iconButtonProps={{
                  'aria-haspopup': 'true',
                  'aria-expanded': Boolean(menuAnchorEl),
                  'aria-controls': Boolean(menuAnchorEl) ? menuId : undefined,
                }}
              />
              <Menu
                id={menuId}
                anchorEl={menuAnchorEl}
                open={Boolean(menuAnchorEl)}
                onClose={() => setMenuAnchorEl(null)}
              >
                <MenuItem onClick={() => openDialogFor(alternateAction)}>
                  {label(alternateAction)}
                </MenuItem>
              </Menu>
            </>
          ) : (
            <ActionButton
              description={label(availableActions[0])}
              buttonStyle={buttonStyle}
              onClick={() => openDialogFor(availableActions[0])}
              icon={icon(availableActions[0])}
            />
          )}

          <ConfirmDialog
            open={openAlert}
            title={action === 'evict' ? t('translation|Evict Pod') : t('translation|Delete item')}
            description={
              <Grid container direction="column">
                <Grid item>
                  {action === 'evict'
                    ? t('translation|Are you sure you want to evict pod {{ itemName }}?', {
                        itemName: item.metadata.name,
                      })
                    : t('translation|Are you sure you want to delete item {{ itemName }}?', {
                        itemName: item.metadata.name,
                      })}
                </Grid>
                {action !== 'evict' && (
                  <Grid item sx={{ mt: 1 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={forceDelete}
                          onChange={() => setForceDelete(!forceDelete)}
                          name="forceDelete"
                        />
                      }
                      label={t('Force Delete')}
                    />
                  </Grid>
                )}
                {isProtectedNamespace && (
                  <>
                    <Grid item sx={{ mt: 2 }}>
                      <Alert
                        severity="warning"
                        variant="outlined"
                        sx={theme => ({
                          color: theme.palette.warning.main,
                          borderColor: theme.palette.warning.main,
                          '& .MuiAlert-icon': { color: theme.palette.warning.main },
                          '& .MuiAlert-message': { fontSize: '0.95rem', fontWeight: 600 },
                        })}
                      >
                        {t(
                          'translation|This is a system namespace. Deleting it may break your cluster.'
                        )}
                      </Alert>
                    </Grid>
                    <Grid item sx={{ mt: 2.5 }}>
                      <Typography variant="body1" sx={{ mb: 1.5 }}>
                        {t('translation|To confirm, type {{ name }} in the field below.', {
                          name: namespaceName,
                        })}
                      </Typography>
                      <TextField
                        fullWidth
                        autoComplete="off"
                        value={confirmInput}
                        onChange={event => setConfirmInput(event.target.value)}
                        placeholder={namespaceName}
                        inputProps={{ 'aria-label': t('translation|Namespace name') }}
                      />
                    </Grid>
                  </>
                )}
              </Grid>
            }
            handleClose={() => setOpenAlert(false)}
            confirmButtonDisabled={isProtectedNamespace && confirmInput.trim() !== namespaceName}
            cancelLabel={t('Cancel')}
            confirmLabel={action === 'evict' ? t('Evict') : t('Delete')}
            onConfirm={() => {
              deleteFunc();
              dispatchDeleteEvent({
                resource: item,
                status: EventStatus.CONFIRMED,
              });
              if (afterConfirm) {
                afterConfirm();
              }
            }}
          />
        </>
      )}
    </>
  );
}
