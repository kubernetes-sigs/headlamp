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

import { Icon } from '@iconify/react';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { formatClusterPathParam } from '../../lib/cluster';
import { useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { createRouteURL } from '../../lib/router/createRouteURL';

type ClusterOption = { type: 'select-all' } | { type: 'cluster'; name: string };

const SELECT_ALL_OPTION: ClusterOption = { type: 'select-all' };
const clusterOption = (name: string): ClusterOption => ({ type: 'cluster', name });

export function ClusterScopeSelector() {
  const { t } = useTranslation();
  const history = useHistory();
  const clusters = useClustersConf() ?? {};
  const selectedClusters = useSelectedClusters();
  const clusterNames = Object.keys(clusters).sort((left, right) => left.localeCompare(right));
  const clusterOptions = [...new Set([...clusterNames, ...selectedClusters])].map(clusterOption);
  const selectionMatchesConfiguredClusters =
    selectedClusters.length === clusterNames.length &&
    clusterNames.every(cluster => selectedClusters.includes(cluster));
  const allSelected = clusterNames.length > 1 && selectionMatchesConfiguredClusters;

  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      disableClearable
      options={[SELECT_ALL_OPTION, ...clusterOptions]}
      value={selectedClusters.map(clusterOption)}
      getOptionLabel={option =>
        option.type === 'select-all' ? t('Select all clusters') : option.name
      }
      isOptionEqualToValue={(option, value) =>
        option.type === value.type &&
        (option.type === 'select-all' || (value.type === 'cluster' && option.name === value.name))
      }
      getOptionDisabled={option =>
        (option.type === 'select-all' &&
          (clusterNames.length === 0 || selectionMatchesConfiguredClusters)) ||
        (option.type === 'cluster' &&
          selectedClusters.length === 1 &&
          selectedClusters.includes(option.name))
      }
      renderOption={(props, option, { selected }) => {
        const label = option.type === 'select-all' ? t('Select all clusters') : option.name;

        return (
          <li {...props} key={props.key}>
            {option.type === 'select-all' ? (
              <Box
                sx={{
                  alignItems: 'center',
                  display: 'flex',
                  flex: '0 0 34px',
                  height: 34,
                  justifyContent: 'center',
                }}
              >
                <SelectAllIcon sx={{ fontSize: '1rem' }} />
              </Box>
            ) : (
              <Checkbox
                checked={selected}
                icon={<Icon icon="mdi:checkbox-blank-outline" />}
                checkedIcon={<Icon icon="mdi:check-box-outline" />}
              />
            )}
            {label}
          </li>
        );
      }}
      onChange={(_event, value) => {
        const nextClusters = value.some(option => option.type === 'select-all')
          ? clusterNames
          : value.flatMap(option => (option.type === 'cluster' ? [option.name] : []));
        if (nextClusters.length === 0) {
          return;
        }

        const currentCluster = selectedClusters.find(cluster => nextClusters.includes(cluster));

        history.push({
          pathname: createRouteURL('advancedSearch', {
            cluster: formatClusterPathParam(nextClusters, currentCluster),
          }),
          search: history.location.search,
        });
      }}
      renderTags={options => {
        if (allSelected) {
          return (
            <Typography variant="body2" sx={{ ml: 1 }}>
              {t('All clusters')}
            </Typography>
          );
        }

        const clusterValues = options.flatMap(option =>
          option.type === 'cluster' ? [option.name] : []
        );
        const [firstCluster, ...remainingClusters] = clusterValues;
        if (!firstCluster) {
          return null;
        }

        return (
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere', ml: 1 }}>
            {firstCluster}
            {remainingClusters.length > 0 && (
              <>
                <span>,&nbsp;</span>
                <Tooltip
                  title={
                    <ul style={{ margin: 0, padding: 10, listStyle: 'none' }}>
                      {remainingClusters.map(cluster => (
                        <li key={cluster}>{cluster}</li>
                      ))}
                    </ul>
                  }
                  arrow
                  placement="top"
                >
                  <Box
                    component="span"
                    tabIndex={0}
                    aria-label={remainingClusters.join(', ')}
                    sx={{ cursor: 'help', fontWeight: 'bold' }}
                  >
                    {`+${remainingClusters.length}`}
                  </Box>
                </Tooltip>
              </>
            )}
          </Typography>
        );
      }}
      renderInput={params => (
        <Box width="15rem">
          <TextField
            {...params}
            variant="outlined"
            size="small"
            label={t('Clusters')}
            fullWidth
            InputLabelProps={{ shrink: true }}
            style={{ marginTop: 0 }}
          />
        </Box>
      )}
    />
  );
}
