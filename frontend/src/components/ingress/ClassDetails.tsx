import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import IngressClass from '../../lib/k8s/ingressClass';
import { DetailsGrid } from '../common/Resource';

export default function IngressClassDetails(props: { name?: string; cluster?: string }) {
  const params = useParams<{ name: string }>();
  const { name = params.name, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={IngressClass}
      name={name}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Default'),
            value: item.isDefault ? t('translation|Yes') : t('translation|No'),
          },
        ]
      }
    />
  );
}
