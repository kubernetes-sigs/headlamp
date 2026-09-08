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

import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { getCluster } from '../../lib/cluster';
import ActionButton from '../common/ActionButton';
import CopyButton from '../common/Resource/CopyButton';
import { downloadKubeconfigYaml, getClusterKubeconfigYaml } from './Home/clusterKubeconfigExport';

export default function KubeconfigButton(props: { onClickExtra?: () => void }) {
  const { onClickExtra } = props;
  const { t } = useTranslation(['translation']);
  const clusterName = getCluster();
  const { enqueueSnackbar } = useSnackbar();

  if (clusterName === null) {
    return null;
  }

  async function handleDownload() {
    const kubeconfigYaml = await getClusterKubeconfigYaml(clusterName!);
    if (!kubeconfigYaml) {
      enqueueSnackbar(t('translation|Failed to find kubeconfig for this cluster'), {
        variant: 'error',
      });
      onClickExtra?.();
      return;
    }
    downloadKubeconfigYaml(clusterName!, kubeconfigYaml);
    onClickExtra?.();
  }

  return (
    <>
      <CopyButton
        buttonStyle="action"
        description={t('translation|Copy kubeconfig')}
        text={() => getClusterKubeconfigYaml(clusterName)}
        iconButtonProps={{ color: 'inherit' }}
        onClick={onClickExtra}
        onCopied={() =>
          enqueueSnackbar(t('translation|Kubeconfig copied to clipboard'), {
            variant: 'success',
          })
        }
        onError={() =>
          enqueueSnackbar(t('translation|Failed to copy kubeconfig to clipboard'), {
            variant: 'error',
          })
        }
      />
      <ActionButton
        icon="mdi:file-download-outline"
        description={t('translation|Download kubeconfig')}
        iconButtonProps={{ color: 'inherit' }}
        onClick={handleDownload}
      />
    </>
  );
}
