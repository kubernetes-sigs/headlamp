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
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import headlampBrokenImage from '../../../assets/headlamp-broken.svg';

const WidthImg = styled('img')({
  width: '100%',
});

export interface ErrorComponentProps {
  /** The main title to display. By default it is: "Uh-oh! Something went wrong." */
  title?: React.ReactNode;
  /** The message to display. By default it is: "Head back <a href="..."> home</a>." */
  message?: React.ReactNode;
  /** The graphic or element to display as a main graphic. If used as a string, it will be
   * used as the source for displaying an image. By default it is "headlamp-broken.svg". */
  graphic?: React.ReactNode;
  /** Whether to use Typography or not. By default it is true. */
  withTypography?: boolean;
  /** The error object to display. */
  error?: Error;
}

export default function ErrorComponent(props: ErrorComponentProps) {
  const { t } = useTranslation();
  const {
    title = t('Uh-oh! Something went wrong.'),
    message = '',
    withTypography = true,
    // In vite headlampBrokenImage is a string, but in webpack it is an object
    // TODO: Remove this once we migrate plugins to vite
    graphic = headlampBrokenImage as any as string,
    error,
  } = props;
  return (
    <Grid
      container
      spacing={0}
      direction="column"
      alignItems="center"
      justifyContent="center"
      sx={{ textAlign: 'center' }}
    >
      <Grid item xs={12}>
        {typeof graphic === 'string' ? <WidthImg src={graphic} alt="" /> : graphic}
        {withTypography ? (
          <Typography variant="h1" sx={{ fontSize: '2.125rem', lineHeight: 1.2, fontWeight: 400 }}>
            {title}
          </Typography>
        ) : (
          title
        )}
        {withTypography ? (
          <Typography variant="h2" sx={{ fontSize: '1.25rem', lineHeight: 3.6, fontWeight: 500 }}>
            {!!message ? (
              message
            ) : (
              <Trans t={t}>
                Head back <Link href={window.desktopApi ? '#' : '/'}>home</Link>.
              </Trans>
            )}
          </Typography>
        ) : (
          message
        )}
      </Grid>
      {!!error?.stack && (
        <Grid item xs={12}>
          <Box
            sx={{
              width: '100%',
              maxWidth: 800,
            }}
          >
            <Accordion>
              <AccordionSummary expandIcon={<Icon icon="mdi:chevron-down" />}>
                <Typography>{t('translation|Error Details')}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box textAlign="right">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(error.stack!);
                    }}
                  >
                    {t('translation|Copy')}
                  </Button>
                </Box>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    textWrapMode: 'wrap',
                    textAlign: 'left',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {error.stack}
                </Typography>
              </AccordionDetails>
            </Accordion>
          </Box>
        </Grid>
      )}
    </Grid>
  );
}
