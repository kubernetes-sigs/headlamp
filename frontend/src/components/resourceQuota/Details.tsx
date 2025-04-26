import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import ResourceQuota from '../../lib/k8s/resourceQuota';
import { compareUnits, normalizeUnit } from '../../lib/util';
import { DetailsGrid, SimpleTable } from '../common';

export default function ResourceQuotaDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <DetailsGrid
      resourceType={ResourceQuota}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={item =>
        item && [
          {
            name: t('translation|Status'),
            value: (
              <SimpleTable
                data={item.resourceStats}
                columns={[
                  {
                    label: t('glossary|Resource'),
                    getter: item => item.name,
                  },
                  {
                    label: t('translation|Used'),
                    getter: item => {
                      const normalizedUnit = normalizeUnit(item.name, item.used);
                      return compareUnits(item.used, normalizedUnit)
                        ? normalizedUnit
                        : `${item.used} (${normalizedUnit})`;
                    },
                  },
                  {
                    label: t('translation|Hard'),
                    getter: item => {
                      const normalizedUnit = normalizeUnit(item.name, item.hard);
                      return compareUnits(item.hard, normalizedUnit)
                        ? normalizedUnit
                        : `${item.hard} (${normalizedUnit})`;
                    },
                  },
                ]}
              />
            ),
          },
        ]
      }
    />
  );
}
