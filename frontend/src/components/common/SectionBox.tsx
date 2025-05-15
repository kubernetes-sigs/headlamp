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

import Box, { BoxProps } from '@mui/material/Box';
import React from 'react';
import BackLink, { BackLinkProps } from './BackLink';
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

export interface SectionBoxProps extends Omit<BoxProps, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerProps?: Omit<SectionHeaderProps, 'title'>;
  outterBoxProps?: Omit<BoxProps, 'title'>;
  //** The location to go back to. If provided as an empty string, the browser's history will be used. If not provided (default)), then no back button is used. */
  backLink?: BackLinkProps['to'] | boolean;
}

export function SectionBox(props: SectionBoxProps) {
  const {
    title,
    subtitle,
    children,
    headerProps = { noPadding: false, headerStyle: 'subsection' },
    outterBoxProps = {},
    backLink,
    ...otherProps
  } = props;

  let titleElem: React.ReactNode;
  // If backLink is a boolean, then we want to use the browser's history if true.
  const actualBackLink = typeof backLink === 'boolean' ? (!!backLink ? '' : undefined) : backLink;

  if (typeof title === 'string') {
    titleElem = (
      <SectionHeader title={title as string} subtitle={subtitle as string} {...headerProps} />
    );
  } else {
    titleElem = title;
  }

  return (
    <>
      {actualBackLink !== undefined && <BackLink to={actualBackLink} />}
      <Box py={0} {...outterBoxProps}>
        {title && titleElem}
        <Box
          sx={theme => ({
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: theme.spacing(2),
            paddingRight: theme.spacing(2),
            [theme.breakpoints.down('sm')]: {
              paddingLeft: 0,
              paddingRight: 0,
            },
          })}
          {...otherProps}
        >
          {React.Children.toArray(children)}
        </Box>
      </Box>
    </>
  );
}

export default SectionBox;
