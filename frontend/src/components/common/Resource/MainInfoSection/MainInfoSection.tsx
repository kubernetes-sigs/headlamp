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

import Paper from '@mui/material/Paper';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../../lib/k8s/KubeObject';
import { createRouteURL } from '../../../../lib/router/createRouteURL';
import { HeaderAction } from '../../../../redux/actionButtonsSlice';
import Loader from '../../../common/Loader';
import { HeaderStyle } from '../../../common/SectionHeader';
import { NameValueTableRow } from '../../../common/SimpleTable';
import Empty from '../../EmptyContent';
import SectionBox from '../../SectionBox';
import { MetadataDisplay } from '../MetadataDisplay';
import { MainInfoHeader } from './MainInfoSectionHeader';

export interface MainInfoSectionProps<T extends KubeObject = KubeObject> {
  resource: T | null;
  headerSection?: ((resource: T | null) => React.ReactNode) | React.ReactNode;
  title?: string;
  extraInfo?: ((resource: T | null) => NameValueTableRow[] | null) | NameValueTableRow[] | null;
  actions?:
    | ((resource: T | null) => React.ReactNode[] | HeaderAction[] | null)
    | React.ReactNode[]
    | null
    | HeaderAction[];
  headerStyle?: HeaderStyle;
  noDefaultActions?: boolean;
  /** The route or location to go to. If it's an empty string, then the "browser back" function is used. If null, no back button will be shown. */
  backLink?: string | ReturnType<typeof useLocation> | null;
  error?: string | Error | null;
}

export function MainInfoSection<T extends KubeObject>(props: MainInfoSectionProps<T>) {
  const {
    resource,
    headerSection,
    title,
    extraInfo = [],
    actions = [],
    headerStyle = 'main',
    noDefaultActions = false,
    backLink,
    error = null,
  } = props;
  const { t } = useTranslation();
  const header = typeof headerSection === 'function' ? headerSection(resource) : headerSection;

  function getBackLink() {
    if (backLink === null) {
      return false;
    }

    if (!!backLink || backLink === '') {
      return backLink;
    }

    if (!!resource) {
      return createRouteURL(resource.listRoute);
    }
  }

  return (
    <SectionBox
      aria-busy={resource === null}
      aria-live="polite"
      title={
        <MainInfoHeader
          title={title}
          resource={resource}
          headerStyle={headerStyle}
          noDefaultActions={noDefaultActions}
          actions={actions}
        />
      }
      backLink={getBackLink()}
    >
      {resource === null ? (
        !!error ? (
          <Paper variant="outlined">
            <Empty color="error">{error.toString()}</Empty>
          </Paper>
        ) : (
          <Loader title={t('translation|Loading resource data')} />
        )
      ) : (
        <React.Fragment>
          {header}
          <MetadataDisplay resource={resource} extraRows={extraInfo} />
        </React.Fragment>
      )}
    </SectionBox>
  );
}
