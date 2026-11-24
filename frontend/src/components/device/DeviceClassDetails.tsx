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
import DeviceClass from '../../lib/k8s/deviceClass';
import { DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

/** Text shown as code, because selectors are CEL and parameters are driver JSON. */
function CodeText(props: { children: string }) {
  return (
    <Typography
      component="pre"
      variant="body2"
      sx={{ fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {props.children}
    </Typography>
  );
}

export default function DeviceClassDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={DeviceClass}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Extended Resource'),
            value: item.extendedResourceName,
            hide: !item.extendedResourceName,
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.deviceclass-selectors',
            section: (
              <SectionBox title={t('translation|Selectors')}>
                {item.matchesAllDevices ? (
                  <Typography sx={{ px: 2, pb: 1 }}>
                    {t('translation|This class has no selectors, so it matches every device.')}
                  </Typography>
                ) : (
                  <SimpleTable
                    columns={[
                      {
                        label: t('translation|CEL Expression'),
                        getter: (selector: { expression: string }) => (
                          <CodeText>{selector.expression}</CodeText>
                        ),
                      },
                    ]}
                    data={item.selectorExpressions.map(expression => ({ expression }))}
                  />
                )}
              </SectionBox>
            ),
          },
          {
            id: 'headlamp.deviceclass-config',
            section: (
              <SectionBox title={t('translation|Driver Configuration')}>
                <SimpleTable
                  columns={[
                    {
                      label: t('glossary|Driver'),
                      datum: 'driver',
                      gridTemplate: 'min-content',
                    },
                    {
                      label: t('translation|Parameters'),
                      getter: (config: { parameters: Record<string, unknown> }) => (
                        <CodeText>{JSON.stringify(config.parameters, null, 2)}</CodeText>
                      ),
                    },
                  ]}
                  data={item.driverConfigs}
                  emptyMessage={t('translation|No driver configuration.')}
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
