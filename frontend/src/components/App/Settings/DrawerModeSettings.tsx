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

import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setDetailDrawerEnabled } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import { TooltipIcon } from '../../common';

export default function DrawerModeSettings() {
  const dispatch = useDispatch();
  const { t } = useTranslation('translation');

  const isDrawerEnabled = useTypedSelector(state => state.drawerMode.isDetailDrawerEnabled);

  function drawerModeToggle() {
    dispatch(setDetailDrawerEnabled(!isDrawerEnabled));
  }

  return (
    <FormControlLabel
      control={
        <Switch
          checked={isDrawerEnabled}
          onClick={drawerModeToggle}
          name="drawerMode"
          color="primary"
        />
      }
      label={
        <>
          {t('translation|Overlay')}
          <TooltipIcon>
            {t(
              'translation|Shows resource details in a pane overlaid on the list view instead of a full page.'
            )}
          </TooltipIcon>
        </>
      }
    />
  );
}
