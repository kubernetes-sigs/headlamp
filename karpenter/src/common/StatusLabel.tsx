import { StatusLabel as HLStatusLabel } from '@kinvolk/headlamp-plugin/lib/components/common';
import { KubeCRD } from '@kinvolk/headlamp-plugin/lib/lib/k8s/crd';
import { Tooltip } from '@mui/material';

interface StatusLabelProps {
  item: KubeCRD;
}

export function StatusLabel(props: StatusLabelProps) {
  const { item } = props;
  const ready = item?.jsonData?.status?.conditions?.find(c => c.type === 'Ready');

  if (!ready) {
    return <span>-</span>;
  }

  if (item?.jsonData?.spec?.suspend) {
    return <HLStatusLabel status="warning">Suspended</HLStatusLabel>;
  }
  if (ready.status === 'Unknown') {
    return <HLStatusLabel status="warning">Reconciling…</HLStatusLabel>;
  }

  if (ready.reason === 'DependencyNotReady') {
    return (
      <HLStatusLabel status={'warning'}>
        <Tooltip title={ready.message}>
          <div>{'Waiting'}</div>
        </Tooltip>
      </HLStatusLabel>
    );
  }

  const isReady = ready.status === 'True';
  return (
    <HLStatusLabel status={isReady ? 'success' : 'error'}>
      <Tooltip title={ready.message}>
        <div>{isReady ? 'Ready' : 'Failed'}</div>
      </Tooltip>
    </HLStatusLabel>
  );
}
