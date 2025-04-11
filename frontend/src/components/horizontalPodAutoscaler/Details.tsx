import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import HPA from '../../lib/k8s/hpa';
import { ConditionsSection, DetailsGrid, Link, SimpleTable } from '../common';

export default function HpaDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation();

  return (
    <DetailsGrid
      resourceType={HPA}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Reference'),
            value: (
              <Link kubeObject={item.referenceObject}>
                {item.referenceObject?.kind}/{item.referenceObject?.metadata.name}
              </Link>
            ),
          },
          {
            name: t('translation|Metrics'),
            value: (
              <SimpleTable
                data={item.metrics(t)}
                columns={[
                  { label: t('translation|Name'), getter: item => item.definition },
                  { label: t('translation|(Current/Target)'), getter: item => item.value },
                ]}
              />
            ),
          },
          {
            name: t('translation|MinReplicas'),
            value: item.spec.minReplicas,
          },
          {
            name: t('translation|MaxReplicas'),
            value: item.spec.maxReplicas,
          },
          {
            name: t('translation|Deployment pods'),
            value: t(`translation|{{ currentReplicas }} current / {{ desiredReplicas }} desired`, {
              currentReplicas: item.status.currentReplicas,
              desiredReplicas: item.status.desiredReplicas,
            }),
          },
        ]
      }
      extraSections={item =>
        item && [
          {
            id: 'headlamp.hpa-conditions',
            section: <ConditionsSection resource={item?.jsonData} />,
          },
        ]
      }
    />
  );
}
