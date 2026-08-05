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
import { KubeObject } from '../../../lib/k8s/KubeObject';
import ActionButton, { ButtonStyle } from '../ActionButton';

interface CopyKubectlCommandButtonProps {
  item: KubeObject;
  buttonStyle?: ButtonStyle;
}

/** Builds the `kubectl get <type> <name> [-n <namespace>] -o yaml` command for a resource. */
export function getKubectlGetCommand(item: KubeObject): string {
  const apiGroupName = item._class().apiGroupName;
  const resourceType = apiGroupName ? `${item.pluralName}.${apiGroupName}` : item.pluralName;
  const parts = ['kubectl', 'get', resourceType, item.getName()];

  const namespace = item.getNamespace();
  if (item.isNamespaced && namespace) {
    parts.push('-n', namespace);
  }

  parts.push('-o', 'yaml');

  return parts.join(' ');
}

export default function CopyKubectlCommandButton(props: CopyKubectlCommandButtonProps) {
  const { item, buttonStyle } = props;
  const { t } = useTranslation(['translation']);
  const { enqueueSnackbar } = useSnackbar();

  if (!item) {
    return null;
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(getKubectlGetCommand(item));
      enqueueSnackbar(t('translation|Copied kubectl command to clipboard.'), {
        variant: 'success',
      });
    } catch (error) {
      enqueueSnackbar(t('translation|Failed to copy kubectl command to clipboard.'), {
        variant: 'error',
      });
    }
  }

  return (
    <ActionButton
      description={t('translation|Copy as kubectl command')}
      buttonStyle={buttonStyle}
      onClick={onCopy}
      icon="mdi:console"
    />
  );
}
