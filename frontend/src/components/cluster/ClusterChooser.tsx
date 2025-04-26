import { Icon } from '@iconify/react';
import Button from '@mui/material/Button';
import { alpha, styled } from '@mui/system';
import React, { ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';

export interface ClusterChooserProps {
  clickHandler: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  cluster?: string;
}
export type ClusterChooserType =
  | React.ComponentType<ClusterChooserProps>
  | ReactElement<ClusterChooserProps>
  | null;

const SpanClusterName = styled('span')({
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  display: 'block',
});

const ClusterChooser = React.forwardRef(function ClusterChooser(
  { clickHandler, cluster }: ClusterChooserProps,
  ref: React.Ref<HTMLButtonElement>
) {
  const { t } = useTranslation();

  return (
    <Button
      size="large"
      color="secondary"
      onClick={clickHandler}
      startIcon={<Icon icon="mdi:hexagon-multiple-outline" />}
      sx={theme => ({
        background: theme.palette.navbar.background,
        color: theme.palette.navbar.color,
        ':hover': {
          background: alpha(theme.palette.navbar.color, 0.07),
        },
        maxWidth: '20em',
        textTransform: 'none',
        padding: '6px 22px',
      })}
      ref={ref}
    >
      <SpanClusterName title={cluster}>
        <Trans t={t}>Cluster: {{ cluster }}</Trans>
      </SpanClusterName>
    </Button>
  );
});

export default ClusterChooser;
