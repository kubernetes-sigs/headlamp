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

import * as jsyaml from 'js-yaml';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/cluster';
import ActionButton, { ButtonStyle } from '../ActionButton';

export interface DownloadButtonProps {
  /** The Kubernetes resource object to download as YAML. */
  item: KubeObject;
  /** Optional button rendering style. */
  buttonStyle?: ButtonStyle;
}

/**
 * Renders a download action button for a Kubernetes resource.
 * When clicked, it serializes the item to YAML and downloads it.
 */
function DownloadButton({ item, buttonStyle }: DownloadButtonProps) {
  const { t } = useTranslation();

  const downloadYaml = () => {
    if (!item?.jsonData) {
      return;
    }

    const yaml = jsyaml.dump(item.jsonData, { lineWidth: -1 });
    const blob = new Blob([yaml], { type: 'application/x-yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');

    element.href = url;
    element.download = `${item.getName()}.yaml`;
    element.style.display = 'none';

    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  return (
    <ActionButton
      description={t('translation|Download')}
      longDescription={t('translation|Download')}
      buttonStyle={buttonStyle}
      onClick={downloadYaml}
      icon="mdi:file-download-outline"
      edge="end"
    />
  );
}

export default DownloadButton;
