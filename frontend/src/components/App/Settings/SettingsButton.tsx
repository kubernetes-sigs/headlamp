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

import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { getCluster } from '../../../lib/cluster';
import { createRouteURL } from '../../../lib/router';
import { ActionButton } from '../../common';

export default function SettingsButton(props: { onClickExtra?: () => void }) {
  const { onClickExtra } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const history = useHistory();
  const clusterName = getCluster();

  if (clusterName === null) {
    return null;
  }

  return (
    <ActionButton
      icon="mdi:cog"
      description={t('translation|Settings')}
      iconButtonProps={{
        color: 'inherit',
      }}
      onClick={() => {
        history.push(createRouteURL('settingsCluster', { cluster: clusterName }));
        onClickExtra && onClickExtra();
      }}
    />
  );
}
