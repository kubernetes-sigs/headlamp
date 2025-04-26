import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import PDB from '../../lib/k8s/podDisruptionBudget';
import { DetailsGrid, StatusLabel } from '../common';

export default function PDBDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;

  function selectorsToJSX(selectors: string[]) {
    const values: ReactNode[] = [];

    selectors.forEach((selector: string) => {
      values.push(
        <StatusLabel key={selector} status="">
          {selector}
        </StatusLabel>
      );
    });

    return values;
  }

  const { t } = useTranslation(['translation', 'glossary']);
  return (
    <DetailsGrid
      resourceType={PDB}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Max Unavailable'),
            value: <>{item.spec.maxUnavailable}</>,
          },
          {
            name: t('translation|Min Available'),
            value: <>{item.spec.minAvailable}</>,
          },
          {
            name: t('glossary|Selector'),
            value: <>{selectorsToJSX(item.selectors)}</>,
          },
          {
            name: t('translation|Status'),
            value: (
              <>
                <StatusLabel status="">
                  {t('translation|Allowed disruptions')}:{item.status.disruptionsAllowed}
                </StatusLabel>
                <br />
                <StatusLabel status="">
                  {t('translation|Current', { context: 'pods' })}:{item.status.currentHealthy}
                </StatusLabel>
                <br />
                <StatusLabel status="">
                  {t('translation|Desired', { context: 'pods' })}:{item.status.desiredHealthy}
                </StatusLabel>
                <br />
                <StatusLabel status="">
                  {t('translation|Total')}:{item.status.expectedPods}
                </StatusLabel>
                <br />
              </>
            ),
          },
        ]
      }
    />
  );
}
