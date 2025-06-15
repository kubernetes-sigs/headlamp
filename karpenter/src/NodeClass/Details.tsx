import {
  ConditionsTable,
  MainInfoSection,
  SectionBox,
  SimpleTable,
  StatusLabel,
} from '@kinvolk/headlamp-plugin/lib/components/common';
import { Box } from '@mui/material';
import React from 'react';
import { useParams } from 'react-router-dom';
import { nodeClassClass } from './List';

export function NodeClassDetailView(props: { name?: string; namespace?: string }) {
  const params = useParams<{ name: string; namespace: string }>();
  const name = props.name || params.name;

  return (
    <>
      <CustomResourceDetails name={name} />
    </>
  );
}

function CustomResourceDetails(props: { name: string }) {
  const { name } = props;
  const [cr, setCr] = React.useState<any>(null);

  nodeClassClass().useApiGet(setCr, name);

  function prepareExtraInfo() {
    if (!cr) return [];

    return [
      {
        name: 'Status',
        value:
          cr?.jsonData?.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True'
            ? 'Ready'
            : 'Not Ready',
      },
      {
        name: 'Role',
        value: cr?.jsonData?.spec?.role || '-',
      },
      {
        name: 'Instance Profile',
        value: cr?.jsonData?.status?.instanceProfile || '-',
      },
      {
        name: 'AMI Family',
        value: cr?.jsonData?.spec?.amiFamily || '-',
      },
      {
        name: 'Subnet Selector',
        value:
          Object.entries(cr?.jsonData?.spec?.subnetSelector || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || '-',
      },
    ];
  }

  return (
    <>
      {cr && <MainInfoSection resource={cr} extraInfo={prepareExtraInfo()} />}

      <NodeClassSpecDetails spec={cr?.jsonData?.spec} />

      <NodeClassStatus status={cr?.jsonData?.status} />

      <SectionBox title="Conditions">
        <ConditionsTable resource={cr?.jsonData} />
      </SectionBox>
    </>
  );
}

export function NodeClassSpecDetails({ spec }: { spec: any }) {
  const subnetTags = spec?.subnetSelectorTerms?.[0]?.tags || {};
  const tagDisplay = Object.entries(subnetTags).map(([key, value]) => `${key}=${value}`);

  const securityTags = spec?.securityGroupSelectorTerms?.[0]?.tags || {};
  const display = Object.entries(securityTags).map(([key, value]) => `${key}=${value}`);

  const specDetails = [
    {
      key: 'SecurityGroup Selector Tags',
      value: display || '-',
    },
    {
      key: 'Subnet Selector Tags',
      value: tagDisplay || '-',
    },
  ];

  return (
    <SectionBox title="NodeClass Configuration" paddingTop={2}>
      <SimpleTable
        columns={[
          {
            label: 'Setting',
            getter: (item: any) => <strong>{item.key}</strong>,
            gridTemplate: '50%',
          },
          {
            label: 'Value',
            getter: (item: any) => (
              <Box
                sx={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap',
                }}
              >
                {item.value.length > 0
                  ? item.value.map((value: string, index: number) => (
                      <StatusLabel key={index}>{value}</StatusLabel>
                    ))
                  : '-'}
              </Box>
            ),
            gridTemplate: '50%',
          },
        ]}
        data={specDetails}
      />
    </SectionBox>
  );
}

export function NodeClassStatus({ status }: { status: any }) {
  const statusDetails = [
    {
      key: 'Security Group IDs',
      values: status?.securityGroups?.map(g => g.id) || [],
    },
    {
      key: 'Subnet IDs',
      values: status?.subnets?.map(g => g.id) || [],
    },
    {
      key: 'Zone',
      values: status?.subnets?.map(g => g.zone) || [],
    },
  ];

  return (
    <SectionBox title="Status">
      <SimpleTable
        columns={[
          {
            label: 'Resource',
            getter: (item: any) => <strong>{item.key}</strong>,
            gridTemplate: '50%',
          },
          {
            label: 'Value',
            getter: (item: any) => (
              <Box
                sx={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap',
                }}
              >
                {item.values.length > 0
                  ? item.values.map((value: string, index: number) => (
                      <StatusLabel key={index}>{value}</StatusLabel>
                    ))
                  : '-'}
              </Box>
            ),
            gridTemplate: '50%',
          },
        ]}
        data={statusDetails}
      />
    </SectionBox>
  );
}
