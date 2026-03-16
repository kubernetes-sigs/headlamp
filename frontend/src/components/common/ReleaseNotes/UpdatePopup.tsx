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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { styled } from '@mui/system';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ColoredSnackbar = styled(Snackbar)({
  '& .MuiSnackbarContent-root': {
    backgroundColor: 'rgb(49, 49, 49)',
    color: '#fff',
  },
});

export interface UpdatePopupProps {
  /** URL for the release */
  releaseDownloadURL?: string | null;
  /** Whether the release is being fetched */
  fetchingRelease?: boolean;
  /** If release fetch failed */
  releaseFetchFailed?: boolean;
  /** if the user wants to skip a release */
  skipUpdateHandler: () => void;
}

function UpdatePopup({
  releaseDownloadURL,
  fetchingRelease,
  releaseFetchFailed,
  skipUpdateHandler,
}: UpdatePopupProps) {
  const [show, setShow] = React.useState(true);
  const { t } = useTranslation();
  const [closeSnackError, setCloseSnackError] = React.useState(false);

  if (fetchingRelease && !releaseDownloadURL) {
    return (
      <ColoredSnackbar
        sx={{
          '& .MuiSnackbarContent-root': {
            backgroundColor: 'rgb(49, 49, 49)',
            color: '#fff',
          },
        }}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        autoHideDuration={5000}
        message={t('translation|Fetching release information…')}
        ContentProps={{
          'aria-describedby': 'updatePopup',
        }}
        open={fetchingRelease}
        action={
          <React.Fragment>
            <Button
              style={{
                color: 'rgb(255, 242, 0)',
              }}
              onClick={() => {
                skipUpdateHandler();
              }}
            >
              {t('translation|Skip')}
            </Button>
          </React.Fragment>
        }
      />
    );
  }

  if (releaseFetchFailed && !releaseDownloadURL) {
    return (
      <ColoredSnackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        open={releaseFetchFailed && !closeSnackError}
        onClose={() => {
          setCloseSnackError(true);
        }}
        message={t('translation|Failed to fetch release information')}
        ContentProps={{
          'aria-describedby': 'updatePopup',
        }}
        autoHideDuration={6000}
      />
    );
  }

  if (!releaseDownloadURL) {
    return null;
  }

  if (fetchingRelease && !releaseDownloadURL) {
    return (
      <ColoredSnackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        autoHideDuration={5000}
        message={t('translation|Fetching release information…')}
        ContentProps={{
          'aria-describedby': 'updatePopup',
        }}
        open={fetchingRelease && !closeSnackError}
        onClose={() => {
          setCloseSnackError(true);
        }}
        action={
          <React.Fragment>
            <Button
              style={{
                color: 'rgb(255, 242, 0)',
              }}
              onClick={() => {
                skipUpdateHandler();
              }}
            >
              {t('translation|Skip')}
            </Button>
          </React.Fragment>
        }
      />
    );
  }

  if (releaseFetchFailed && !releaseDownloadURL) {
    return (
      <ColoredSnackbar
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        open={releaseFetchFailed}
        message={t('translation|Failed to fetch release information')}
        ContentProps={{
          'aria-describedby': 'updatePopup',
        }}
        autoHideDuration={6000}
      />
    );
  }

  if (!releaseDownloadURL) {
    return null;
  }

  return (
    <ColoredSnackbar
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      open={show}
      autoHideDuration={100000}
      ContentProps={{
        'aria-describedby': 'updatePopup',
      }}
      message={t('translation|An update is available')}
      action={
        <React.Fragment>
          <Box display={'flex'} alignItems="center">
            <Box ml={-1}>
              <Button
                onClick={() => window.open(releaseDownloadURL)}
                style={{
                  color: 'inherit',
                  textTransform: 'none',
                }}
              >
                {t('translation|Read more')}
              </Button>
            </Box>
            <Box mb={0.5}>
              <Button
                style={{
                  color: 'rgb(255, 242, 0)',
                }}
                onClick={() => {
                  localStorage.setItem('disable_update_check', 'true');
                  setShow(false);
                }}
                aria-label={t('translation|Disable update notifications')}
              >
                <Icon icon={'mdi:bell-off-outline'} width="20" />
              </Button>
            </Box>
            <Box>
              <Button
                style={{
                  color: 'rgb(255, 242, 0)',
                }}
                onClick={() => setShow(false)}
              >
                {t('translation|Dismiss')}
              </Button>
            </Box>
          </Box>
        </React.Fragment>
      }
    />
  );
}

export default UpdatePopup;
