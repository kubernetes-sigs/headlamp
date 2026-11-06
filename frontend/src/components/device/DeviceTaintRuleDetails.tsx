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

import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import DeviceTaintRule from '../../lib/k8s/deviceTaintRule';
import { ConditionsTable, DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import DeviceTaintRuleStatus from './DeviceTaintRuleStatus';

function CodeText({ children }: { children: string }) {
  return (
    <Typography
      component="code"
      variant="body2"
      sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}
    >
      {children}
    </Typography>
  );
}

export default function DeviceTaintRuleDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['translation']);

  return (
    <DetailsGrid
      resourceType={DeviceTaintRule}
      name={name}
      cluster={cluster}
      withEvents
      noDefaultActions
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: <DeviceTaintRuleStatus rule={item} />,
          },
          {
            name: t('translation|Effect'),
            value: item.taint.effect,
          },
          {
            name: t('translation|Key'),
            value: <CodeText>{item.taint.key}</CodeText>,
          },
          {
            name: t('translation|Value'),
            value: item.taint.value,
            hide: !item.taint.value,
          },
          {
            name: t('translation|Time Added'),
            value: item.taint.timeAdded,
            hide: !item.taint.timeAdded,
          },
          {
            name: t('translation|Eviction message'),
            value: item.evictionCondition?.message,
            hide: !item.evictionCondition?.message,
          },
        ]
      }
      extraSections={(item: DeviceTaintRule) =>
        item && [
          {
            id: 'headlamp.devicetaint-rule-selector',
            section: (
              <SectionBox title={t('translation|Device selector')}>
                {item.matchesAllDevices ? (
                  <Typography sx={{ px: 2, pb: 1 }}>
                    {t('translation|This rule matches every device.')}
                  </Typography>
                ) : (
                  <SimpleTable
                    columns={[
                      { label: t('translation|Field'), datum: 'field' },
                      {
                        label: t('translation|Value'),
                        getter: (entry: { value: string }) => <CodeText>{entry.value}</CodeText>,
                      },
                    ]}
                    data={item.selectorEntries}
                  />
                )}
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.devicetaint-rule-conditions',
            section: (
              <SectionBox title={t('translation|Conditions')}>
                <ConditionsTable resource={item.jsonData} showLastUpdate={false} />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
