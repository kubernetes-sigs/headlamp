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
import { getProductName, getProductVersion, getVersion } from '../../helpers/getProductInfo';
import { useTypedSelector } from '../../redux/hooks';
import { uiSlice } from '../../redux/uiSlice';
import { Dialog } from '../common/Dialog';
import NameValueTable from '../common/NameValueTable';
import Tabs from '../common/Tabs';
import LegalDocuments from './LegalDocuments';

/** Version values displayed by the About dialog. */
interface VersionInformation {
  /** Application release version. */
  VERSION: string;
  /** Source revision used to build the application. */
  GIT_VERSION: string;
}

export interface VersionDialogProps {
  /** Overrides Headlamp version lookup, primarily for tests and stories. */
  getVersion?: () => VersionInformation;
  /** Overrides product distribution version lookup, primarily for tests and stories. */
  getProductVersion?: typeof getProductVersion;
}

/**
 * Displays product, Headlamp, Git, and host-provided legal information.
 *
 * @param props - Version dialog dependencies.
 * @returns The version information dialog.
 */
export default function VersionDialog(props: VersionDialogProps) {
  const open = useTypedSelector(state => state.ui.isVersionDialogOpen);
  const dispatch = useDispatch();
  const { t } = useTranslation(['glossary', 'translation']);
  const { VERSION, GIT_VERSION } = (
    props.getVersion ? props.getVersion() : getVersion()
  ) as VersionInformation;
  const productVersion = (
    props.getProductVersion ? props.getProductVersion() : getProductVersion()
  )?.trim();
  const showProductVersion = productVersion && productVersion !== VERSION;
  const defaultProductName = t('translation|Product');
  const productName = getProductName();
  const productVersionName =
    productName && productName !== 'Headlamp' ? productName : defaultProductName;
  const rows = [
    ...(showProductVersion
      ? [
          {
            name: t('translation|{{ productName }} Version', {
              productName: productVersionName,
            }),
            value: productVersion,
          },
        ]
      : []),
    {
      name: showProductVersion
        ? t('translation|{{ productName }} Version', { productName: 'Headlamp' })
        : t('translation|Version'),
      value: VERSION,
    },
    {
      name: t('Git Commit'),
      value: GIT_VERSION,
    },
  ];
  const versionInformation = <NameValueTable rows={rows} />;
  const hasLegalDocuments = Boolean(window.desktopApi?.getLegalDocuments);

  return (
    <Dialog
      maxWidth="md"
      open={open}
      onClose={() => dispatch(uiSlice.actions.setVersionDialogOpen(false))}
      title={productName}
      aria-label={t('translation|Version information')}
      // We want the dialog to show on top of the cluster chooser one if needed
      style={{ zIndex: 1900 }}
    >
      <DialogContent>
        {hasLegalDocuments ? (
          <Tabs
            ariaLabel={t('translation|About dialog tabs')}
            tabs={[
              {
                label: t('translation|About'),
                component: versionInformation,
              },
              {
                label: t('translation|Legal'),
                component: <LegalDocuments />,
              },
            ]}
          />
        ) : (
          versionInformation
        )}
      </DialogContent>
    </Dialog>
  );
}
