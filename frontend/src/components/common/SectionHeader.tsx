import { Box } from '@mui/material';
import Grid from '@mui/material/Grid';
import { Variant } from '@mui/material/styles/createTypography';
import Typography from '@mui/material/Typography';
import React from 'react';

export type HeaderStyle = 'main' | 'subsection' | 'normal' | 'label';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string | React.ReactNode;
  actions?: React.ReactNode[] | null;
  noPadding?: boolean;
  headerStyle?: HeaderStyle;
  titleSideActions?: React.ReactNode[];
}

export default function SectionHeader(props: SectionHeaderProps) {
  const { noPadding = false, headerStyle = 'main', titleSideActions = [] } = props;
  const actions = props.actions || [];
  const titleVariants: { [key: string]: Variant } = {
    main: 'h1',
    subsection: 'h2',
    normal: 'h3',
    label: 'h4',
  };

  return (
    <Grid
      container
      alignItems="center"
      justifyContent="space-between"
      sx={theme => ({
        padding: theme.spacing(noPadding ? 0 : 2),
        paddingTop: theme.spacing(noPadding ? 0 : 3),
      })}
      spacing={2}
    >
      <Grid item>
        {(!!props.title || titleSideActions.length > 0) && (
          <Box display="flex" alignItems="center">
            {!!props.title && (
              <Typography
                variant={titleVariants[headerStyle]}
                noWrap
                sx={theme => ({
                  ...theme.palette.headerStyle[headerStyle || 'normal'],
                  whiteSpace: 'pre-wrap',
                })}
              >
                {props.title}
              </Typography>
            )}
            {!!titleSideActions && (
              <Box ml={1} justifyContent="center">
                {titleSideActions}
              </Box>
            )}
          </Box>
        )}
        {!!props.subtitle && (
          <Typography variant="h6" component="p" sx={{ fontStyle: 'italic' }}>
            {props.subtitle}
          </Typography>
        )}
      </Grid>
      {actions.length > 0 && (
        <Grid item>
          <Grid
            item
            container
            alignItems="center"
            justifyContent="flex-end"
            sx={{ minHeight: '40px' }}
          >
            {actions.map((action, i) => (
              <Grid item key={i}>
                {action}
              </Grid>
            ))}
          </Grid>
        </Grid>
      )}
    </Grid>
  );
}
