import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router';
import { isElectron } from '../../../helpers/isElectron';
import { setSelectedResource } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/reducers/reducers';
import { KubeObjectDetails } from '../../resourceMap/details/KubeNodeDetails';
import { ActionButton } from '..';

export default function DetailsDrawer() {
  const { t } = useTranslation();
  const selectedResource = useTypedSelector(state => state.drawerMode.selectedResource);
  const dispatch = useDispatch();
  const theme = useTheme();
  const location = useLocation();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isDetailDrawerEnabled = useTypedSelector(state => state.drawerMode.isDetailDrawerEnabled);

  function handleCloseDrawerReset() {
    if (isElectron()) return;

    const currentPlacement = location.pathname;
    const pathname = currentPlacement;

    window.history.replaceState({}, '', pathname);
  }

  function closeDrawer() {
    dispatch(setSelectedResource(undefined));
    handleCloseDrawerReset();
  }

  if (!selectedResource || isSmallScreen) {
    return null;
  }

  return (
    isDetailDrawerEnabled && (
      <Drawer
        variant="persistent"
        anchor="right"
        open
        onClose={closeDrawer}
        PaperProps={{
          sx: {
            marginTop: '64px',
            boxShadow: '-5px 0 20px rgba(0,0,0,0.08)',
            borderRadius: '10px',
            width: '45vw',
          },
        }}
      >
        {/* Note: the top margin is needed to not clip into the topbar */}
        <Box
          sx={{
            display: 'flex',
            padding: '1rem',
            justifyContent: 'right',
          }}
        >
          <ActionButton onClick={() => closeDrawer()} icon="mdi:close" description={t('Close')} />
        </Box>
        <Box>
          {selectedResource && (
            <KubeObjectDetails
              resource={{
                kind: selectedResource.kind,
                metadata: selectedResource.metadata,
                cluster: selectedResource.cluster,
              }}
              customResourceDefinition={selectedResource.customResourceDefinition}
            />
          )}
        </Box>
      </Drawer>
    )
  );
}
