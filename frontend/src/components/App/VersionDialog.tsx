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

import DialogContent from '@mui/material/DialogContent';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getProductName, getVersion } from '../../helpers/getProductInfo';
import { useTypedSelector } from '../../redux/hooks';
import { uiSlice } from '../../redux/uiSlice';
import { Dialog } from '../common/Dialog';
import NameValueTable from '../common/NameValueTable';

export default function VersionDialog(props: {
  getVersion?: () => {
    VERSION: any;
    GIT_VERSION: any;
  };
}) {
  const open = useTypedSelector(state => state.ui.isVersionDialogOpen);
  const dispatch = useDispatch();
  const { t } = useTranslation(['glossary', 'translation']);
  const { VERSION, GIT_VERSION } = props.getVersion ? props.getVersion() : getVersion();

  return (
    <Dialog
      maxWidth="sm"
      open={open}
      onClose={() => dispatch(uiSlice.actions.setVersionDialogOpen(false))}
      title={getProductName()}
      // We want the dialog to show on top of the cluster chooser one if needed
      style={{ zIndex: 1900 }}
    >
      <DialogContent>
        <NameValueTable
          rows={[
            {
              name: t('translation|Version'),
              value: VERSION,
            },
            {
              name: t('Git Commit'),
              value: GIT_VERSION,
            },
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}
