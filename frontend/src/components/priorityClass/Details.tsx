import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import PriorityClass from '../../lib/k8s/priorityClass';
import { DetailsGrid } from '../common';

export default function PriorityClassDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation(['translation']);

  return (
    <DetailsGrid
      resourceType={PriorityClass}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Value'),
            value: item.value,
          },
          {
            name: t('translation|Global Default'),
            value: item.globalDefault || 'False',
          },
          {
            name: t('translation|Preemption Policy'),
            value: item.preemptionPolicy,
          },
          {
            name: t('translation|Description'),
            value: item.description,
          },
        ]
      }
    />
  );
}
