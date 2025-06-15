import {
  SectionBox,
  SectionFilterHeader,
  ViewButton,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { makeCustomResourceClass } from '@kinvolk/headlamp-plugin/lib/lib/k8s/crd';
import { useFilterFunc } from '@kinvolk/headlamp-plugin/lib/Utils';
import React, { useMemo } from 'react';
import { Table } from '../common/Table';
import { NameLink } from '../helpers';

export function NodeClasses() {
  return <NodeClassesList />;
}

export function nodeClassClass() {
  const nodeClassGroup = 'karpenter.k8s.aws';
  const nodeClassVersion = 'v1';

  return makeCustomResourceClass({
    apiInfo: [{ group: nodeClassGroup, version: nodeClassVersion }],
    isNamespaced: false,
    singularName: 'EC2NodeClass',
    pluralName: 'ec2nodeclasses',
  });
}

function NodeClassesList() {
  const filterFunction = useFilterFunc();
  const [resources, setResources] = React.useState<any[]>([]);

  React.useEffect(() => {
    const nodeClassApi = nodeClassClass();
    const fn = nodeClassApi.apiList(
      items => {
        const processedItems = (items || []).map(item => ({
          ...item.jsonData,
          _clusterName: item._clusterName,
          jsonData: item.jsonData,
        }));
        setResources(processedItems);
      },
      err => {
        console.error('API Error:', err);
      }
    );

    fn();
  }, []);

  const renderRowActionMenuItems = useMemo(() => {
    return ({ row }: { row: any }) => {
      return [<ViewButton key="view-yaml" item={row.original} buttonStyle="menu" />];
    };
  }, []);

  return (
    <SectionBox title={<SectionFilterHeader title="EC2 NodeClasses" />}>
      <Table
        data={resources}
        columns={[
          NameLink(nodeClassClass()),
          {
            header: 'Cluster',
            accessorFn: nodeClass => nodeClass._clusterName || '',
          },
          {
            header: 'Instance Profile',
            accessorFn: nodeClass => nodeClass.jsonData?.status?.instanceProfile || '',
          },
          {
            header: 'Status',
            accessorFn: nodeClass => {
              const conditions = nodeClass.jsonData?.status?.conditions || [];
              const readyCondition = conditions.find(c => c.type === 'Ready');
              return readyCondition?.status === 'True' ? 'Ready' : 'Not Ready';
            },
          },
          {
            header: 'Role',
            accessorFn: nodeClass => nodeClass.jsonData?.spec?.role || '',
          },
          'age',
        ]}
        filterFunction={filterFunction}
        enableRowActions
        renderRowActionMenuItems={renderRowActionMenuItems}
        enableSelectAll
      />
    </SectionBox>
  );
}
