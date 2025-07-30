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
import IconButton from '@mui/material/IconButton';
import { Theme } from '@mui/material/styles';
import Typography, { TypographyProps } from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ResourceClasses, useSelectedClusters } from '../../../lib/k8s';
import { KubeOwnerReference } from '../../../lib/k8s/cluster';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { localeDate } from '../../../lib/util';
import { NameValueTable, NameValueTableRow } from '../../common/SimpleTable';
import Link from '../Link';
import { LightTooltip } from '../Tooltip';

type ExtraRowsFunc<T extends KubeObject> = (resource: T) => NameValueTableRow[] | null;

export const metadataStyles = (theme: Theme) => ({
  color: theme.palette.text.primary,
  backgroundColor: theme.palette.metadataBgColor,
  fontSize: theme.typography.pxToRem(16),
  wordBreak: 'break-word',
  paddingLeft: theme.spacing(1),
  paddingRight: theme.spacing(1),
  marginRight: theme.spacing(1),
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  overflowWrap: 'anywhere',
  textOverflow: 'ellipsis',
});

export interface MetadataDisplayProps<T extends KubeObject = KubeObject> {
  resource: T;
  extraRows?: ExtraRowsFunc<T> | NameValueTableRow[] | null;
}

export function MetadataDisplay<T extends KubeObject>(props: MetadataDisplayProps<T>) {
  const { resource, extraRows } = props;
  const { t } = useTranslation();
  const shouldShowCluster = useSelectedClusters().length > 1;

  let makeExtraRows: ExtraRowsFunc<T>;

  function makeOwnerReferences(ownerReferences: KubeOwnerReference[]) {
    if (!resource || ownerReferences === undefined) {
      return undefined;
    }

    const numItems = ownerReferences.length;
    if (numItems === 0) {
      return undefined;
    }

    return ownerReferences
      .map((ownerRef, i) => {
        if (ownerRef.kind in ResourceClasses) {
          let routeName;
          try {
            routeName = ResourceClasses[ownerRef.kind as keyof typeof ResourceClasses].detailsRoute;
          } catch (e) {
            console.error(`Error getting routeName for {ownerRef.kind}`, e);
            return null;
          }
          return (
            <>
              <Link
                routeName={routeName}
                activeCluster={resource.cluster}
                params={{ name: ownerRef.name, namespace: resource.metadata.namespace }}
              >
                {ownerRef.kind}: {ownerRef.name}
              </Link>
              {i < numItems - 1 && <br />}
            </>
          );
        }
        return (
          <>
            {`${ownerRef.kind}: ${ownerRef.name}`}
            {i < numItems - 1 && <br />}
          </>
        );
      })
      .filter(element => element !== null);
  }

  if (typeof extraRows === 'function') {
    makeExtraRows = extraRows;
  } else if (!extraRows) {
    makeExtraRows = () => null;
  } else {
    makeExtraRows = () => extraRows as NameValueTableRow[];
  }

  const mainRows = (
    [
      {
        name: t('translation|Name'),
        value: resource.metadata.name,
      },
      {
        name: t('glossary|Namespace'),
        value: resource.metadata.namespace && (
          <Link
            routeName={'namespace'}
            params={{ name: resource.metadata.namespace }}
            activeCluster={resource.cluster}
          >
            {resource.metadata.namespace}
          </Link>
        ),
        hide: !resource.metadata.namespace,
      },
      shouldShowCluster && {
        name: t('glossary|Cluster'),
        value: resource.cluster,
      },
      {
        name: t('Creation'),
        value: localeDate(resource.metadata.creationTimestamp),
      },
      {
        name: t('Labels'),
        value: resource.metadata.labels && <MetadataDictGrid dict={resource.metadata.labels} />,
        hide: !resource.metadata.labels,
      },
      {
        name: t('Annotations'),
        value: resource.metadata.annotations && (
          <MetadataDictGrid dict={resource.metadata.annotations} />
        ),
        hide: !resource.metadata.annotations,
      },
      {
        name:
          resource.metadata.ownerReferences && resource.metadata.ownerReferences.length > 1
            ? t('Owner refs')
            : t('Controlled by'),
        value: makeOwnerReferences(resource.metadata.ownerReferences || []),
        hide: !resource.metadata.ownerReferences || resource.metadata.ownerReferences.length === 0,
      },
    ].filter(Boolean) as NameValueTableRow[]
  ).concat(makeExtraRows(resource) || []);

  return (
    <Box>
      <NameValueTable rows={mainRows} />
    </Box>
  );
}

interface MetadataDictGridProps {
  dict: {
    [index: string]: string;
    [index: number]: string;
  };
  showKeys?: boolean;
  gridProps?: {
    [index: string]: any;
  };
}

export function MetadataDictGrid(props: MetadataDictGridProps) {
  const { dict, showKeys = true, gridProps } = props;
  const [expanded, setExpanded] = React.useState(false);
  const defaultNumShown = 20;

  const keys = Object.keys(dict || []);

  const MetadataEntry = React.forwardRef((props: TypographyProps, ref: any) => {
    return (
      <Typography
        {...props}
        sx={theme => ({
          color: theme.palette.text.primary,
          borderRadius: theme.shape.borderRadius + 'px',
          backgroundColor: theme.palette.background.muted,
          border: '1px solid',
          borderColor: theme.palette.divider,
          fontSize: theme.typography.pxToRem(14),
          wordBreak: 'break-word',
          paddingTop: 0.5,
          paddingBottom: 0.5,
          paddingLeft: 1,
          paddingRight: 1,
          marginRight: theme.spacing(1),
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          overflowWrap: 'anywhere',
          textOverflow: 'ellipsis',
        })}
        ref={ref}
      />
    );
  });

  function makeLabel(key: string | number) {
    let fullText = dict[key];

    if (showKeys) {
      fullText = key + ': ' + fullText;
    }

    let shortText = fullText;

    // Shorten the label manually because relying on the ellipsing methods
    // was not working (it would correctly ellipse the text, but the width of it
    // would still extend the area/section where the text is contained).
    if (fullText.length > 50) {
      shortText = fullText.substr(0, 50) + '…';
    }

    let labelComponent = <MetadataEntry>{shortText}</MetadataEntry>;

    // If the full label is not being shown, use a tooltip to show the full text
    // to the user (so they select it, etc.).
    if (fullText.length !== shortText.length) {
      labelComponent = <LightTooltip title={fullText} children={labelComponent} interactive />;
    }
    return labelComponent;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
      }}
      {...gridProps}
    >
      {keys.length > defaultNumShown && (
        <IconButton onClick={() => setExpanded(!expanded)} size="small">
          <Icon icon={expanded ? 'mdi:menu-up' : 'mdi:menu-down'} />
        </IconButton>
      )}
      {/* Limit the size to two entries until the user chooses to expand the whole section */}
      {keys.slice(0, expanded ? keys.length : defaultNumShown).map(key => (
        <React.Fragment key={key}>{makeLabel(key)}</React.Fragment>
      ))}
    </Box>
  );
}
