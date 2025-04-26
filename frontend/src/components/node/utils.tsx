import { Box, Chip, Tooltip } from '@mui/material';
import { styled } from '@mui/system';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Node from '../../lib/k8s/node';

const WrappingBox = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'left',
  flexWrap: 'wrap',
  '& > *': {
    margin: theme.spacing(0.5),
  },
}));

const PaddedChip = styled(Chip)({
  paddingTop: '2px',
  paddingBottom: '2px',
});

export function formatTaint(taint: { key: string; value?: string; effect: string }) {
  return `${taint.key}${taint.value ? '=' + taint.value : ''}:${taint.effect}`;
}

export function NodeTaintsLabel(props: { node: Node }) {
  const { node } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  if (node.spec?.taints === undefined) {
    return <WrappingBox>{t('translation|None')}</WrappingBox>;
  }
  const limits: ReactNode[] = [];
  node.spec.taints.forEach(taint => {
    const format = formatTaint(taint);
    limits.push(
      <Tooltip title={format} key={taint.key}>
        <PaddedChip label={format} variant="outlined" size="small" />
      </Tooltip>
    );
  });
  return <WrappingBox>{limits}</WrappingBox>;
}
