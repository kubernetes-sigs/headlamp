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

import React from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/cluster';
import ActionButton, { ButtonStyle } from '../ActionButton';
import EditorDialog from './EditorDialog';

export interface ViewButtonProps {
  /** The item we want to view */
  item: KubeObject;
  /** If we want to have the view open by default */
  initialToggle?: boolean;
  buttonStyle?: ButtonStyle;
}

function ViewButton({ item, buttonStyle, initialToggle = false }: ViewButtonProps) {
  const [toggle, setToggle] = React.useState(initialToggle);
  const { t } = useTranslation();
  return (
    <>
      <ActionButton
        description={t('translation|View YAML')}
        buttonStyle={buttonStyle}
        onClick={() => {
          setToggle(true);
        }}
        icon="mdi:eye"
        edge="end"
      />
      <EditorDialog
        item={item.jsonData}
        open={toggle}
        onClose={() => setToggle(toggle => !toggle)}
        onSave={null}
      />
    </>
  );
}

export default ViewButton;
