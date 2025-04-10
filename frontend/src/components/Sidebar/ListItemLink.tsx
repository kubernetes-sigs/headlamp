import { Icon, IconProps } from '@iconify/react';
import { alpha, ListItemButton, styled, Tooltip } from '@mui/material';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import React from 'react';
import { Link as RouterLink, LinkProps as RouterLinkProps } from 'react-router-dom';

const ExpandedIconSize = 20;
const CollapsedIconSize = 24;

interface ListItemLinkProps {
  primary: string;
  pathname: string;
  search?: string;
  name: string;
  subtitle?: string;
  icon?: IconProps['icon'];
  iconOnly?: boolean;
  hasParent?: boolean;
  fullWidth?: boolean;
  divider?: boolean;
  containerProps?: {
    [prop: string]: any;
  };
}

const StyledLi = styled('li')<{ hasParent?: boolean }>(({ hasParent }) => ({
  marginRight: '5px',
  marginLeft: hasParent ? '35px' : '5px',
  marginBottom: '1px',
}));

export default function ListItemLink(props: ListItemLinkProps) {
  const {
    primary,
    pathname,
    search,
    icon,
    name,
    iconOnly,
    subtitle,
    hasParent,
    fullWidth,
    ...other
  } = props;

  const iconSize = React.useMemo(
    () => (iconOnly ? CollapsedIconSize : ExpandedIconSize),
    [iconOnly]
  );

  const renderLink = React.useMemo(
    () =>
      React.forwardRef<any, Omit<RouterLinkProps, 'to'>>((itemProps, ref) => (
        <RouterLink to={{ pathname: pathname, search: search }} ref={ref} {...itemProps} />
      )),
    [pathname, search]
  );
  let listItemLink = null;

  if (icon) {
    listItemLink = (
      <ListItemIcon sx={{ minWidth: '24px' }}>
        <Icon icon={icon} width={iconSize} height={iconSize} />
      </ListItemIcon>
    );
  }

  let listItemLinkContainer = listItemLink;
  if (!primary) {
    listItemLinkContainer = listItemLink && (
      <Tooltip
        title={name}
        placement="right-start"
        sx={{
          backgroundColor: '#474747',
          color: '#fff',
          minWidth: 60,
          padding: '0.5rem',
          fontSize: '0.8rem',
          border: '1px solid #474747',
          marginLeft: '1rem',
        }}
      >
        {listItemLink}
      </Tooltip>
    );
  }

  const hasSubtitle = Boolean(subtitle);

  return (
    <StyledLi hasParent={hasParent}>
      <ListItemButton
        component={renderLink}
        {...other}
        sx={theme => ({
          color:
            theme.palette.sidebar.color ??
            theme.palette.getContrastText(theme.palette.sidebar.background),
          margin: 0,
          border: 'none',
          borderRadius: theme.shape.borderRadius + 'px',
          height: iconOnly ? '50px' : undefined,
          opacity: hasParent ? 0.9 : 1.0,
          fontSize: hasParent ? '0.85rem' : '1rem',

          svg: {
            color: 'currentColor',
          },

          ':before': other.divider
            ? {
                content: '""',
                position: 'absolute',
                bottom: 0,
                left: theme.shape.borderRadius + 'px',
                right: theme.shape.borderRadius + 'px',
                height: '1px',
                background: alpha(theme.palette.sidebar.color, 0.15),
              }
            : undefined,

          '&.Mui-selected': hasParent
            ? {
                ':before': {
                  content: "''",
                  width: '4px',
                  borderRadius: theme.shape.borderRadius + 'px',
                  background: theme.palette.sidebar.selectedColor,
                  position: 'absolute',
                  left: '4px',
                  top: '7px',
                  bottom: '7px',
                },
                opacity: 1.0,
                color: theme.palette.sidebar.selectedColor,
                background: 'none',
              }
            : {
                opacity: 1.0,
                boxShadow: '1px 1px 4px rgb(0 0 0 / 12%)',
                background: theme.palette.sidebar.selectedBackground,
                color: theme.palette.getContrastText(theme.palette.sidebar.selectedBackground),
              },

          '&.Mui-selected:hover': hasParent
            ? {
                backgroundColor: alpha(
                  theme.palette.getContrastText(theme.palette.sidebar.background),
                  0.07
                ),
              }
            : {
                backgroundColor: alpha(theme.palette.sidebar.selectedBackground, 0.8),
              },

          ':hover': {
            backgroundColor: alpha(
              theme.palette.getContrastText(theme.palette.sidebar.background),
              0.07
            ),
          },

          '.MuiListItemIcon-root': {
            color: 'unset',
          },

          '.MuiListItemText-root': {
            margin: 0,
          },

          '& *': {
            fontSize: '.875rem',
            textTransform: 'none',
          },
          '& .MuiListItem-root': {
            paddingTop: '4px',
            paddingBottom: '4px',
          },

          '& .MuiListItemIcon-root': {
            minWidth: 0,
            alignSelf: fullWidth && hasSubtitle ? 'stretch' : 'auto',
            paddingTop: fullWidth && hasSubtitle ? theme.spacing(1) : 0,
            marginRight: fullWidth ? '8px' : '0',
          },
          '& .MuiListItemText-secondary': {
            fontSize: '.85rem',
            fontStyle: 'italic',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflowWrap: 'anywhere',
            overflow: 'hidden',
            color: 'currentColor',
          },

          ...(!hasParent && {
            '& .MuiListItem-root': {
              paddingTop: hasSubtitle ? '0' : '7px',
              paddingBottom: hasSubtitle ? '0' : '7px',
              paddingLeft: '19px',
              minHeight: !fullWidth ? '56px' : 'unset',
            },

            '& *': {
              fontSize: '1rem',
            },
          }),
        })}
      >
        {listItemLinkContainer}
        {!iconOnly && <ListItemText primary={primary} secondary={subtitle} />}
      </ListItemButton>
    </StyledLi>
  );
}
