import { Box } from '@mui/material';
import { JSONPath } from 'jsonpath-plus';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ResourceClasses } from '../../lib/k8s';
import CRD, { KubeCRD } from '../../lib/k8s/crd';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { localeDate } from '../../lib/util';
import { CreateResourceButton, Link, Loader, PageGrid, SectionHeader } from '../common';
import BackLink from '../common/BackLink';
import Empty from '../common/EmptyContent';
import ResourceListView from '../common/Resource/ResourceListView';
import { ResourceTableColumn, ResourceTableProps } from '../common/Resource/ResourceTable';

export default function CustomResourceList() {
  const { t } = useTranslation(['glossary', 'translation']);
  const { crd: crdName } = useParams<{ crd: string }>();
  const [crd, error] = CRD.useGet(crdName);

  if (!crd && !error) {
    return <Loader title={t('translation|Loading custom resource definition')} />;
  }

  if (!!error) {
    return (
      <Empty color="error">
        {t(
          'translation|Error getting custom resource definition {{ crdName }}: {{ errorMessage }}',
          {
            crdName,
            errorMessage: error,
          }
        )}
      </Empty>
    );
  }

  return <CustomResourceListRenderer crd={crd!} />;
}

function CustomResourceLink(props: {
  resource: KubeObject<KubeCRD>;
  crd: CRD;
  [otherProps: string]: any;
}) {
  const { resource, crd, ...otherProps } = props;

  return (
    <Link
      sx={{ cursor: 'pointer' }}
      routeName="customresource"
      params={{
        crName: resource.metadata.name,
        crd: crd.metadata.name,
        namespace: resource.metadata.namespace || '-',
      }}
      {...otherProps}
    >
      {resource.metadata.name}
    </Link>
  );
}

export interface CustomResourceListProps {
  crd: CRD;
}

function CustomResourceListRenderer(props: CustomResourceListProps) {
  const { crd } = props;
  const { t } = useTranslation('glossary');

  const CRClass = crd.makeCRClass();

  return (
    <PageGrid>
      <BackLink />
      <SectionHeader
        title={crd.spec.names.kind}
        titleSideActions={[
          <CreateResourceButton resourceClass={CRClass} resourceName={crd.spec.names.kind} />,
        ]}
        actions={[
          <Box mr={2}>
            <Link routeName="crd" params={{ name: crd.metadata.name }}>
              {t('glossary|CRD: {{ crdName }}', { crdName: crd.metadata.name })}
            </Link>
          </Box>,
        ]}
      />
      <CustomResourceListTable crd={crd} />
    </PageGrid>
  );
}

function getValueWithJSONPath(item: { jsonData: object }, jsonPath: string): string {
  let value: string | undefined;
  try {
    // Extract the value from the json item
    value = JSONPath({ path: '$' + jsonPath, json: item.jsonData });
  } catch (err) {
    console.error(`Failed to get value from JSONPath ${jsonPath} on CR item ${item}`);
  }

  // Make sure the value will be represented in string form (to account for
  // e.g. cases where we may get an array).
  return value?.toString() || '';
}

export interface CustomResourceTableProps {
  crd: CRD;
  title?: string;
}

export function CustomResourceListTable(props: CustomResourceTableProps) {
  const { t } = useTranslation(['glossary', 'translation']);
  const { crd, title = '' } = props;

  const apiGroup = React.useMemo(() => {
    return crd.getMainAPIGroup();
  }, [crd]);

  const CRClass: typeof KubeObject<KubeCRD> = React.useMemo(() => {
    return crd.makeCRClass();
  }, [crd]);

  if (!CRClass) {
    return <Empty>{t('translation|No custom resources found')}</Empty>;
  }

  function LinkOrValue(props: { maybeKind: string; value: string; namespace?: string }) {
    const { maybeKind, value, namespace } = props;
    const kubeClass = Object.values(ResourceClasses).find(
      cls => cls.kind.toLowerCase() === maybeKind.toLowerCase()
    );
    if (!kubeClass) {
      return <span>{value}</span>;
    }
    return (
      <Link routeName={kubeClass.detailsRoute} params={{ name: value, namespace }}>
        {value}
      </Link>
    );
  }

  const additionalPrinterCols = React.useMemo(() => {
    const currentVersion = apiGroup[1];
    const colsFromSpec =
      crd.jsonData.spec.versions.find(
        (version: KubeCRD['spec']['versions'][number]) => version.name === currentVersion
      )?.additionalPrinterColumns || [];
    const cols: ResourceTableColumn<KubeObject<KubeCRD>>[] = [];
    for (let i = 0; i < colsFromSpec.length; i++) {
      const idx = i;
      const colSpec = colsFromSpec[idx];
      // Skip creation date because we already show it by default
      if (colSpec.jsonPath === '.metadata.creationTimestamp') {
        continue;
      }

      cols.push({
        label: colSpec.name,
        getValue: resource => {
          let value = getValueWithJSONPath(resource, colSpec.jsonPath);
          if (colSpec.type === 'date') {
            value = localeDate(new Date(value));
          }
          return value;
        },
        render: (resource: KubeObject) => {
          const value = getValueWithJSONPath(resource, colSpec.jsonPath);
          const namespace = resource.metadata.namespace;
          const maybeItemKind = colSpec.name;
          return <LinkOrValue maybeKind={maybeItemKind} value={value} namespace={namespace} />;
        },
      });
    }

    return cols;
  }, [crd, apiGroup]);

  const cols = React.useMemo(() => {
    const colsToDisplay = [
      {
        label: t('translation|Name'),
        getValue: resource => resource.metadata.name,
        render: resource => <CustomResourceLink resource={resource} crd={crd} />,
      },
      ...additionalPrinterCols,
      'age',
    ] as ResourceTableProps<KubeObject<KubeCRD>>['columns'];

    if (crd.isNamespacedScope) {
      colsToDisplay.splice(1, 0, 'namespace');
    }

    return colsToDisplay;
  }, [crd, additionalPrinterCols]);

  return (
    <ResourceListView
      title={title}
      headerProps={{
        noNamespaceFilter: !crd.isNamespaced,
        titleSideActions: [],
      }}
      resourceClass={CRClass}
      columns={cols}
    />
  );
}
