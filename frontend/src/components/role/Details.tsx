import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import ClusterRole from '../../lib/k8s/clusterRole';
import Role from '../../lib/k8s/role';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

export default function RoleDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace?: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation('glossary');

  return (
    <DetailsGrid
      resourceType={!namespace ? ClusterRole : Role}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraSections={item =>
        item && [
          {
            id: 'headlamp.role-rules',
            section: (
              <SectionBox title={t('Rules')}>
                <SimpleTable
                  columns={[
                    {
                      label: t('API Groups'),
                      getter: ({ apiGroups = [] }) => apiGroups.join(', '),
                    },
                    {
                      label: t('Resources'),
                      getter: ({ resources = [] }) => resources.join(', '),
                    },
                    {
                      label: t('Non Resources'),
                      getter: ({ nonResources = [] }) => nonResources.join(', '),
                    },
                    {
                      label: t('Verbs'),
                      getter: ({ verbs = [] }) => verbs.join(', '),
                    },
                  ]}
                  data={item.rules || []}
                  reflectInURL="rules"
                />
              </SectionBox>
            ),
          },
        ]
      }
    />
  );
}
