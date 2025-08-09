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

import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';

export interface ClusterSelectorProps {
  currentCluster?: string;
  clusters: string[];
}

const ClusterSelector: React.FC<ClusterSelectorProps> = ({ currentCluster = '', clusters }) => {
  const history = useHistory();
  const { t } = useTranslation('glossary');

  return (
    <FormControl variant="outlined" margin="normal" size="small" sx={{ minWidth: 250 }}>
      <InputLabel id="settings--cluster-selector">{t('glossary|Cluster')}</InputLabel>
      <Select
        labelId="settings--cluster-selector"
        value={currentCluster}
        onChange={event => {
          history.replace(`/settings/cluster?c=${event.target.value}`);
        }}
        label={t('glossary|Cluster')}
        autoWidth
        aria-label={t('glossary|Cluster selector')}
      >
        {clusters.map(clusterName => (
          <MenuItem key={clusterName} value={clusterName}>
            {clusterName}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default ClusterSelector;
