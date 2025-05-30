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

// ## Component Testing
// Layout components use simplified versions for Storybook testing.
// `LayoutForStories.tsx` which provides a mock implementation
// that doesn't require Redux or API dependencies.

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import Link from '@mui/material/Link';
import { styled } from '@mui/material/styles';
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Simple styled components
const Div = styled('div')``;
const Main = styled('main')``;

export interface LayoutForStoriesProps {
  children?: ReactNode;
  showSidebar?: boolean;
  isFullWidth?: boolean;
  showErrorState?: boolean;
  customPanelElements?: {
    top?: ReactNode[];
    left?: ReactNode[];
    right?: ReactNode[];
    bottom?: ReactNode[];
  };
}

// Mock components to simplify the story
const MockTopBar = () => <Box sx={{ height: '64px', bgcolor: 'primary.main', width: '100%' }} />;
const MockSidebar = ({ visible = true }) =>
  visible ? (
    <Box
      sx={{
        width: '240px',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
      }}
    />
  ) : null;
const MockNavigationTabs = () => (
  <Box
    sx={{
      height: '48px',
      bgcolor: 'background.paper',
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
  />
);
const MockDetailsDrawer = () => null;

export default function LayoutForStories({
  children,
  showSidebar = true,
  isFullWidth = false,
  showErrorState = false,
  customPanelElements = { top: [], left: [], right: [], bottom: [] },
}: LayoutForStoriesProps) {
  const { t } = useTranslation();
  const containerProps = isFullWidth
    ? ({ maxWidth: false, disableGutters: true } as const)
    : ({ maxWidth: 'xl' } as const);

  return (
    <>
      <Link
        href="#main"
        sx={{
          border: 0,
          clip: 'rect(0 0 0 0)',
          height: '1px',
          margin: -1,
          overflow: 'hidden',
          padding: 0,
          position: 'absolute',
          whiteSpace: 'nowrap',
          width: '1px',
        }}
      >
        {t('Skip to main content')}
      </Link>
      <CssBaseline enableColorScheme />
      <Box sx={{ display: 'flex', height: '100dvh' }}>
        {customPanelElements.left?.map((element, idx) => (
          <React.Fragment key={`left-${idx}`}>{element}</React.Fragment>
        ))}
        <Box
          sx={{
            display: 'flex',
            overflow: 'auto',
            flexDirection: 'column',
            flexGrow: 1,
          }}
        >
          {customPanelElements.top?.map((element, idx) => (
            <React.Fragment key={`top-${idx}`}>{element}</React.Fragment>
          ))}
          <MockTopBar />
          <Box
            sx={{
              display: 'flex',
              overflow: 'hidden',
              flexGrow: 1,
              position: 'relative',
            }}
          >
            <MockSidebar visible={showSidebar} />
            <Main
              id="main"
              sx={{
                flexGrow: 1,
                marginLeft: 'initial',
                overflow: 'auto',
              }}
            >
              {showErrorState && (
                <Box
                  display={'flex'}
                  justifyContent="center"
                  sx={{
                    position: 'absolute',
                    color: 'common.white',
                    textAlign: 'center',
                  }}
                  bgcolor={'error.main'}
                  zIndex={1400}
                  width={'100%'}
                  p={0.5}
                  alignItems="center"
                >
                  <Box p={0.5}>{t('Something went wrong with cluster test-cluster')}</Box>
                </Box>
              )}
              <Box>
                <Div />
                <Container {...containerProps}>
                  <MockNavigationTabs />
                  {children || (
                    <Box sx={{ p: 2 }}>
                      <h1>Main Content Area</h1>
                      <p>This is where the main application content would be displayed.</p>
                    </Box>
                  )}
                </Container>
              </Box>
            </Main>
            <MockDetailsDrawer />
          </Box>
          {customPanelElements.bottom?.map((element, idx) => (
            <React.Fragment key={`bottom-${idx}`}>{element}</React.Fragment>
          ))}
        </Box>
        {customPanelElements.right?.map((element, idx) => (
          <React.Fragment key={`right-${idx}`}>{element}</React.Fragment>
        ))}
      </Box>
    </>
  );
}
