import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import { ResourceClasses } from '../../lib/k8s';
import Endpoints, { KubeEndpoint } from '../../lib/k8s/endpoints';
import Empty from '../common/EmptyContent';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SectionHeader from '../common/SectionHeader';
import SimpleTable from '../common/SimpleTable';

export default function EndpointDetails() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const location = useLocation();
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <DetailsGrid
      resourceType={Endpoints}
      name={name}
      namespace={namespace}
      title={t('Endpoint')}
      withEvents
      extraSections={(item: KubeEndpoint) =>
        item && [
          {
            id: 'headlamp.endpoint-subsets',
            section: (
              <>
                <SectionBox title={t('Subsets')} />
                <>
                  {!item.subsets?.length ? (
                    <SectionBox>
                      <Empty>{t('translation|No data to be shown.')}</Empty>
                    </SectionBox>
                  ) : (
                    item.subsets?.map((subset, i) => (
                      <SectionBox key={`subsetDetails_${i}`} outterBoxProps={{ pb: 3 }}>
                        <SectionHeader
                          noPadding
                          title={t('translation|Addresses')}
                          headerStyle="label"
                        />
                        <SimpleTable
                          data={subset?.addresses || []}
                          columns={[
                            {
                              label: t('IP'),
                              getter: address => address.ip,
                            },
                            {
                              label: t('Hostname'),
                              getter: address => address.hostname,
                            },
                            {
                              label: t('Target'),
                              getter: address => {
                                const targetRefClass = !!address.targetRef?.kind
                                  ? ResourceClasses[address.targetRef?.kind]
                                  : null;
                                if (!!targetRefClass) {
                                  return (
                                    <Link
                                      routeName={targetRefClass.detailsRoute}
                                      params={{
                                        name: address.targetRef.name,
                                        namespace: address.targetRef.namespace,
                                      }}
                                      state={{
                                        backLink: location,
                                      }}
                                    >
                                      {address.targetRef.name}
                                    </Link>
                                  );
                                } else {
                                  return address.targetRef?.name || '';
                                }
                              },
                            },
                          ]}
                          reflectInURL="addresses"
                        />
                        <SectionHeader noPadding title={t('Ports')} headerStyle="label" />
                        <SimpleTable
                          data={subset?.ports || []}
                          columns={[
                            {
                              label: t('translation|Name'),
                              datum: 'name',
                              sort: true,
                            },
                            {
                              label: t('Port'),
                              datum: 'port',
                              sort: true,
                            },
                            {
                              label: t('Protocol'),
                              datum: 'protocol',
                              sort: true,
                            },
                          ]}
                          defaultSortingColumn={1}
                          reflectInURL="ports"
                        />
                      </SectionBox>
                    ))
                  )}
                </>
              </>
            ),
          },
        ]
      }
    />
  );
}
