/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setSelectedResource } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { KubeObjectDetails } from '../../resourceMap/details/KubeNodeDetails';
import { ActionButton } from '..';

export default function DetailsDrawer() {
  const { t } = useTranslation();
  const selectedResource = useTypedSelector(state => state.drawerMode.selectedResource);
  const dispatch = useDispatch();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isDetailDrawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);

  function closeDrawer() {
    dispatch(setSelectedResource(undefined));
  }

  if (!selectedResource || isSmallScreen || !isDetailDrawerEnabled) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        backgroundColor: 'background.paper',
        width: '60vw',
        right: 0,
        height: '100%',
        overflowY: 'auto',
        boxShadow: '-5px 0 20px rgba(0,0,0,0.08)',
        borderRadius: '10px 0 0 10px',
        zIndex: 1,
        border: '1px solid',
        borderColor: theme.palette.divider,
      }}
      role="complementary"
      aria-describedby="resource-details-content"
    >
      <Box
        sx={{
          display: 'flex',
          padding: '1rem',
          justifyContent: 'right',
        }}
      >
        <ActionButton onClick={() => closeDrawer()} icon="mdi:close" description={t('Close')} />
      </Box>
      <Box id="resource-details-content">
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
    </Box>
  );
}
