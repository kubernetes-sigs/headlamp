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
import { useParams } from 'react-router-dom';
import GatewayClass, { KubeGatewayClass } from '../../lib/k8s/gatewayClass';
import { ConditionsTable, DetailsGrid } from '../common/Resource';
import SectionBox from '../common/SectionBox';

export default function GatewayClassDetails() {
  const { name } = useParams<{ name: string }>();
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={GatewayClass}
      name={name}
      withEvents
      extraInfo={gatewayClass =>
        gatewayClass && [
          {
            name: t('Controller Name'),
            value: gatewayClass.controllerName,
          },
        ]
      }
      extraSections={(item: KubeGatewayClass) =>
        item && [
          {
            id: 'headlamp.gatewayclass-conditions',
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
