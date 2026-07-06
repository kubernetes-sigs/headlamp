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
import { useTranslation } from 'react-i18next';
import Loader from '../../common/Loader';
import SectionBox from '../../common/SectionBox';
import Tabs from '../../common/Tabs';
import { usePluginManagerInfo } from './api';
import CatalogSettings from './CatalogSettings';
import InstalledPlugins from './InstalledPlugins';
import PluginBrowser from './PluginBrowser';

export default function PluginManager() {
  const { t } = useTranslation(['translation']);
  const { info, isLoading, refetch } = usePluginManagerInfo();

  if (isLoading || !info) {
    return <Loader title={t('translation|Loading plugin manager')} />;
  }

  if (!info.enabled) {
    return (
      <SectionBox title={t('translation|Plugin Manager')}>
        <Alert severity="info">
          {t(
            'translation|The plugin manager is not enabled on this Headlamp deployment. Start the backend with -enable-plugin-manager to use it.'
          )}
        </Alert>
      </SectionBox>
    );
  }

  return (
    <SectionBox title={t('translation|Plugin Manager')} paddingTop={2}>
      {!!info.status.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {info.status.error}
        </Alert>
      )}
      {!info.status.configMapFound && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t(
            'translation|No plugin manager configuration found yet. It will be created in ConfigMap {{ configMap }} (namespace {{ namespace }}) on the first change.',
            { configMap: info.configMapName, namespace: info.namespace }
          )}
        </Alert>
      )}
      <Tabs
        ariaLabel={t('translation|Plugin Manager')}
        tabs={[
          {
            label: t('translation|Installed Plugins'),
            component: <InstalledPlugins info={info} onChanged={refetch} />,
          },
          {
            label: t('translation|Plugin Browser'),
            component: <PluginBrowser info={info} onChanged={refetch} />,
          },
          {
            label: t('translation|Catalog Settings'),
            component: <CatalogSettings info={info} onChanged={refetch} />,
          },
        ]}
      />
    </SectionBox>
  );
}
