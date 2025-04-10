import { InlineIcon } from '@iconify/react';
import { Button } from '@mui/material';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import helpers from '../../helpers';
import { createRouteURL } from '../../lib/router';
import { useTypedSelector } from '../../redux/reducers/reducers';
import { ActionButton } from '../common';
import CreateButton from '../common/Resource/CreateButton';
import NavigationTabs from './NavigationTabs';
import SidebarItem, { SidebarItemProps } from './SidebarItem';
import { DefaultSidebars, setSidebarSelected, setWhetherSidebarOpen } from './sidebarSlice';
import { useSidebarItems } from './useSidebarItems';
import VersionButton from './VersionButton';

export const drawerWidth = 240;
export const mobileDrawerWidth = 320;
export const drawerWidthClosed = 64;

// exported for backwards compatibility for plugins
export { DefaultSidebars };

export function useSidebarInfo() {
  const isSidebarOpen = useTypedSelector(state => state.sidebar.isSidebarOpen);
  const isSidebarOpenUserSelected = useTypedSelector(
    state => state.sidebar.isSidebarOpenUserSelected
  );
  const isTemporary = useMediaQuery('(max-width:599px)');
  const isNarrowOnly = useMediaQuery('(max-width:960px) and (min-width:600px)');
  const temporarySideBarOpen =
    isSidebarOpen === true && isTemporary && isSidebarOpenUserSelected === true;

  // The large sidebar does not open in medium view (600-960px).
  const isOpen =
    (isSidebarOpen === true && !isNarrowOnly) || (isSidebarOpen === true && temporarySideBarOpen);

  return {
    isCollapsed: !temporarySideBarOpen && !isNarrowOnly,
    isOpen,
    isNarrow: !isSidebarOpen || isNarrowOnly,
    canExpand: !isNarrowOnly,
    isTemporary,
    isUserOpened: isSidebarOpenUserSelected,
    width: isOpen ? `${drawerWidth}px` : isTemporary ? '0px' : `${drawerWidthClosed}px`,
  };
}

function AddClusterButton() {
  const history = useHistory();
  const { t } = useTranslation(['translation']);
  const { isOpen } = useSidebarInfo();

  return (
    <Box pb={2}>
      {isOpen ? (
        <Button
          onClick={() => history.push(createRouteURL('addCluster'))}
          startIcon={<InlineIcon icon="mdi:plus-box-outline" />}
        >
          {t('translation|Add Cluster')}
        </Button>
      ) : (
        <ActionButton
          onClick={() => history.push(createRouteURL('addCluster'))}
          icon="mdi:plus-box-outline"
          description={t('translation|Add Cluster')}
          color="#adadad"
          width={38}
        />
      )}
    </Box>
  );
}

function SidebarToggleButton() {
  const dispatch = useDispatch();
  const { isOpen, isNarrow, canExpand, isTemporary } = useSidebarInfo();

  const { t } = useTranslation();
  const isNarrowOnly = isNarrow && !canExpand;

  if (isTemporary || isNarrowOnly) {
    return null;
  }

  return (
    <Box textAlign={isOpen ? 'right' : 'center'}>
      <ActionButton
        iconButtonProps={{
          size: 'small',
          sx: theme => ({
            color: theme.palette.sidebar.color,
          }),
        }}
        onClick={() => {
          dispatch(setWhetherSidebarOpen(!isOpen));
        }}
        icon={isOpen ? 'mdi:chevron-left-box-outline' : 'mdi:chevron-right-box-outline'}
        description={t('translation|Collapse Sidebar')}
      />
    </Box>
  );
}

const DefaultLinkArea = memo((props: { sidebarName: string; isOpen: boolean }) => {
  const { sidebarName, isOpen } = props;

  if (sidebarName === DefaultSidebars.HOME) {
    return (
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        flexDirection={isOpen ? 'row' : 'column'}
        p={1}
      >
        <Box>{helpers.isElectron() && <AddClusterButton />}</Box>
        <Box>
          <SidebarToggleButton />
        </Box>
      </Box>
    );
  }

  return (
    <Box textAlign="center">
      <CreateButton isNarrow={!isOpen} />
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        flexDirection={isOpen ? 'row' : 'column'}
        p={1}
      >
        <Box>
          <VersionButton />
        </Box>
        <Box>
          <SidebarToggleButton />
        </Box>
      </Box>
    </Box>
  );
});

/**
 * Checks if item or any sub items are selected
 */
function getIsSelected(item: SidebarItemProps, selectedName?: string | null): boolean {
  if (!selectedName) return false;
  return (
    item.name === selectedName || Boolean(item.subList?.find(it => getIsSelected(it, selectedName)))
  );
}

/**
 * Updates the isSelected field of an item
 */
function updateItemSelected(
  item: SidebarItemProps,
  selectedName?: string | null
): SidebarItemProps {
  const isSelected = getIsSelected(item, selectedName);
  if (isSelected === false) return item;
  return {
    ...item,
    isSelected: isSelected,
    subList: item.subList
      ? item.subList.map(it => updateItemSelected(it, selectedName))
      : item.subList,
  };
}

export default function Sidebar() {
  const sidebar = useTypedSelector(state => state.sidebar);
  const {
    isOpen,
    isUserOpened,
    isNarrow,
    canExpand,
    isTemporary: isTemporaryDrawer,
  } = useSidebarInfo();
  const isNarrowOnly = isNarrow && !canExpand;
  const namespaces = useTypedSelector(state => state.filter.namespaces);
  const dispatch = useDispatch();

  const items = useSidebarItems(sidebar?.selected?.sidebar ?? undefined);

  const search = namespaces.size !== 0 ? `?namespace=${[...namespaces].join('+')}` : '';

  const handleToggleOpen = useCallback(() => {
    dispatch(setWhetherSidebarOpen(!sidebar.isSidebarOpen));
  }, [sidebar.isSidebarOpen]);

  const linkArea = useMemo(
    () => <DefaultLinkArea sidebarName={sidebar.selected.sidebar || ''} isOpen={isOpen} />,
    [sidebar.selected.sidebar, isOpen]
  );

  const processedItems = useMemo(
    () => items.map(item => updateItemSelected(item, sidebar.selected.item)),
    [items, sidebar.selected.item]
  );

  if (sidebar.selected.sidebar === null || !sidebar?.isVisible) {
    return null;
  }

  return (
    <PureSidebar
      items={processedItems}
      open={isOpen}
      openUserSelected={isUserOpened}
      isNarrowOnly={isNarrowOnly}
      isTemporaryDrawer={isTemporaryDrawer}
      selectedName={sidebar?.selected.item}
      search={search}
      onToggleOpen={handleToggleOpen}
      linkArea={linkArea}
    />
  );
}

export interface PureSidebarProps {
  /** If the sidebar is fully expanded open or shrunk. */
  open?: boolean;
  /** If the user has selected to open/shrink the sidebar */
  openUserSelected?: boolean;
  /** To show in the sidebar. */
  items: SidebarItemProps[];
  /** The selected route name of the sidebar open. */
  selectedName: string | null;
  /** If the sidebar is the temporary one (full sidebar when user selects it in mobile). */
  isTemporaryDrawer?: boolean;
  /** If the sidebar is in narrow mode. */
  isNarrowOnly?: boolean;
  /** Called when sidebar toggles between open and closed. */
  onToggleOpen: () => void;
  /** The search part of the url */
  search?: string;
  /** A place to put extra components below the links. */
  linkArea: React.ReactNode;
}

export const PureSidebar = memo(
  ({
    open,
    openUserSelected,
    items,
    isTemporaryDrawer = false,
    isNarrowOnly = false,
    onToggleOpen,
    search,
    linkArea,
  }: PureSidebarProps) => {
    const { t } = useTranslation();
    const listContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [isOverflowing, setIsOverflowing] = React.useState(false);
    const [scrollbarWidth, setScrollbarWidth] = React.useState(0);
    const closedWidth = 72 + (isOverflowing ? scrollbarWidth : 0);
    const temporarySideBarOpen = open === true && isTemporaryDrawer && openUserSelected === true;

    // The large sidebar does not open in medium view (600-960px).
    const largeSideBarOpen =
      (open === true && !isNarrowOnly) || (open === true && temporarySideBarOpen);

    const adjustedDrawerWidth = largeSideBarOpen ? drawerWidth : closedWidth;

    /**
     * For closing the sidebar if temporaryDrawer on mobile.
     */
    const toggleDrawer = (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === 'keydown' &&
        ((event as React.KeyboardEvent).key === 'Tab' ||
          (event as React.KeyboardEvent).key === 'Shift')
      ) {
        return;
      }
      onToggleOpen();
    };

    const contents = (
      <>
        <Box
          sx={theme => ({
            ...theme.mixins.toolbar,
          })}
        />
        <Grid
          ref={listContainerRef}
          sx={{
            height: '100%',
            overflowY: 'auto',
          }}
          container
          direction="column"
          justifyContent="space-between"
          wrap="nowrap"
        >
          <Grid item>
            <List
              onClick={isTemporaryDrawer ? toggleDrawer : undefined}
              onKeyDown={isTemporaryDrawer ? toggleDrawer : undefined}
            >
              {items.map(item => (
                <SidebarItem
                  key={item.name}
                  isSelected={item.isSelected}
                  fullWidth={largeSideBarOpen}
                  search={search}
                  {...item}
                />
              ))}
            </List>
          </Grid>
          <Grid item>
            <Box textAlign="center">{linkArea}</Box>
          </Grid>
        </Grid>
      </>
    );

    const conditionalProps = isTemporaryDrawer
      ? {
          open: temporarySideBarOpen,
          onClose: onToggleOpen,
        }
      : {};

    React.useEffect(() => {
      const el = listContainerRef.current;
      if (!el) {
        return;
      }

      const update = () => {
        setIsOverflowing(el.scrollHeight > el.clientHeight);
        setScrollbarWidth(Math.max(0, el.offsetWidth - el.clientWidth));
      };

      const observer = new ResizeObserver(update);
      observer.observe(el);

      window.addEventListener('resize', update);
      update();

      return () => {
        observer.disconnect();
        window.removeEventListener('resize', update);
      };
    }, [items]);

    return (
      <Box component="nav" aria-label={t('translation|Navigation')}>
        <Drawer
          variant={isTemporaryDrawer ? 'temporary' : 'permanent'}
          sx={theme => {
            const drawer = {
              width: drawerWidth,
              flexShrink: 0,
              background: theme.palette.sidebar.background,
              color: theme.palette.sidebar.color,
            };

            const drawerOpen = {
              width: drawerWidth,
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              background: theme.palette.sidebar.background,
            };

            const drawerClose = {
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              overflowX: 'hidden',
              width: adjustedDrawerWidth,
              background: theme.palette.sidebar.background,
            };

            if (
              (isTemporaryDrawer && temporarySideBarOpen) ||
              (!isTemporaryDrawer && largeSideBarOpen)
            ) {
              return { ...drawer, ...drawerOpen, '& .MuiPaper-root': { ...drawerOpen } };
            } else {
              return { ...drawer, ...drawerClose, '& .MuiPaper-root': { ...drawerClose } };
            }
          }}
          {...conditionalProps}
        >
          {contents}
        </Drawer>
      </Box>
    );
  }
);

export function useSidebarItem(
  sidebarDesc: string | null | { item: string | null; sidebar?: string }
) {
  let itemName: string | null = null;
  let sidebar: DefaultSidebars | string | null = DefaultSidebars.IN_CLUSTER;
  if (typeof sidebarDesc === 'string') {
    itemName = sidebarDesc;
  } else if (sidebarDesc === null) {
    sidebar = null;
  } else if (!!sidebarDesc) {
    itemName = sidebarDesc.item;
    if (!!sidebarDesc.sidebar) {
      sidebar = sidebarDesc.sidebar || DefaultSidebars.IN_CLUSTER;
    }
  }

  const dispatch = useDispatch();

  React.useEffect(
    () => {
      dispatch(setSidebarSelected({ item: itemName, sidebar: sidebar }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemName]
  );
}

export { NavigationTabs };
