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
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  GatewayBackendReference,
  GatewayParentReference,
  GatewayRouteParentStatus,
} from '../../lib/k8s/gateway';
import {
  GATEWAY_API_GROUP,
  type ResolvedGatewayBackendReference,
  type ResolvedGatewayParentReference,
  resolveGatewayBackendReference,
  resolveGatewayParentReference,
} from '../../lib/k8s/gatewayReferences';
import { ConditionList } from '../common/ConditionList';
import EmptyContent from '../common/EmptyContent';
import InnerTable from '../common/InnerTable';
import Link from '../common/Link';
import NameValueTable from '../common/NameValueTable';
import SectionBox from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

/** A Gateway API route filter: a `type` plus its single configuration key. */
export interface RouteFilter {
  type: string;
  [key: string]: any;
}

/**
 * A Gateway API route filter is a `type` plus exactly one configuration key, so
 * the configuration is simply the other entry.
 *
 * The key cannot be derived from the type: these are Go JSON tags, so
 * `URLRewrite` is stored under `urlRewrite` and `CORS` under `cors`. Lowercasing
 * only the first letter yields `uRLRewrite` and `cORS`, and the lookup silently
 * returns nothing.
 */
function routeFilterConfig(filter: RouteFilter): Record<string, unknown> {
  const entry = Object.entries(filter).find(([key]) => key !== 'type');

  if (!entry) {
    return {};
  }

  const [key, value] = entry;
  // A configuration that is not a set of fields keeps its own key as the label.
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { [key]: value };
}

/** `{type: ReplacePrefixMatch, replacePrefixMatch: '/'}` reads as `ReplacePrefixMatch -> /`. */
function describePathModifier(path: Record<string, unknown>): string {
  const target = path.replacePrefixMatch ?? path.replaceFullPath;
  return [path.type, target].filter(value => value !== undefined).join(' \u2192 ');
}

/**
 * `{name, value}` is the header and parameter shape shared by several filters.
 *
 * An entry carrying anything beyond those two is a different shape - a backend
 * reference, say - and abbreviating it to its name would drop the rest, so it
 * is left to render as its fields.
 */
function isNamedEntry(value: unknown): value is { name: string; value?: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    typeof (value as any).name === 'string' && keys.every(key => key === 'name' || key === 'value')
  );
}

/**
 * Short tokens read best as chips, but chips cannot wrap, so anything longer is
 * clipped mid-word inside a column. Origins, paths and header values fall back
 * to wrapping text.
 */
const MAX_CHIP_LENGTH = 20;

/** Nothing to show: an unset field, or one the API left empty. */
function RouteFilterNoValue() {
  return (
    <Typography component="span" variant="body2" color="text.disabled">
      {'\u2014'}
    </Typography>
  );
}

function RouteFilterValue(props: { value: unknown }) {
  const { value } = props;

  if (value === undefined || value === null) {
    return <RouteFilterNoValue />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <RouteFilterNoValue />;
    }

    // An entry that is neither a scalar nor a {name, value} pair has fields of
    // its own, so it recurses rather than being stringified.
    const items = value.map(entry => {
      if (isNamedEntry(entry)) {
        return `${entry.name}${entry.value !== undefined ? `: ${entry.value}` : ''}`;
      }
      return entry !== null && typeof entry === 'object' ? null : String(entry);
    });

    const texts = items.every(item => item !== null) ? (items as string[]) : null;

    if (texts && texts.every(text => text.length <= MAX_CHIP_LENGTH)) {
      return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {texts.map((text, index) => (
            <Chip
              key={index}
              size="small"
              variant="outlined"
              label={text}
              sx={{ fontFamily: 'monospace' }}
            />
          ))}
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
        {items.map((item, index) =>
          item === null ? (
            <RouteFilterValue key={index} value={value[index]} />
          ) : (
            <RouteFilterText key={index}>{item}</RouteFilterText>
          )
        )}
      </Box>
    );
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    // A path modifier is two fields that only make sense read together.
    if ('replacePrefixMatch' in record || 'replaceFullPath' in record) {
      return <RouteFilterText>{describePathModifier(record)}</RouteFilterText>;
    }

    // A backendRef or fraction is a handful of fields. One per line reads
    // better than joining them into a run, and a field the API defaulted to
    // empty - an unset group - is noise. Values recurse, so a field that is
    // itself an object renders as its fields rather than as [object Object].
    const fields = Object.entries(record).filter(
      ([, entry]) => entry !== undefined && entry !== null && entry !== ''
    );

    if (fields.length === 0) {
      return <RouteFilterNoValue />;
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
        {fields.map(([key, entry]) => (
          <Box key={key} sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {key}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              <RouteFilterValue value={entry} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  return <RouteFilterText>{String(value)}</RouteFilterText>;
}

function RouteFilterText(props: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{ fontFamily: 'monospace', overflowWrap: 'break-word' }}
    >
      {props.children}
    </Typography>
  );
}

/**
 * A filter's configuration, one labelled line per field.
 *
 * Without this the tables listed only the filter type, so a route showed
 * `URLRewrite` and `CORS` with no way to see where it rewrites to or which
 * origins it allows short of opening the YAML.
 */
export function RouteFilterConfiguration(props: { filter: RouteFilter }) {
  const entries = Object.entries(routeFilterConfig(props.filter)).filter(
    ([, value]) => value !== undefined
  );

  if (entries.length === 0) {
    return <RouteFilterNoValue />;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(5.5rem, max-content) 1fr',
        columnGap: 2,
        rowGap: 0.5,
        alignItems: 'baseline',
        minWidth: 0,
      }}
    >
      {entries.map(([key, value]) => (
        <Box key={key} sx={{ display: 'contents' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {key}
          </Typography>
          <Box sx={{ minWidth: 0 }}>
            <RouteFilterValue value={value} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Pins the filter type column narrow so the configuration gets the rest.
 *
 * These tables are laid out as a CSS grid with rows of `display: contents`, so
 * a width on the cells has no effect; the track sizes come from the columns.
 */
export const ROUTE_FILTER_TYPE_WIDTH = '13rem';
export const ROUTE_FILTER_CONFIGURATION_WIDTH = 'minmax(0, 1fr)';

function GatewayParentReferenceName(props: {
  reference: ResolvedGatewayParentReference;
  cluster?: string;
}) {
  const { reference, cluster } = props;

  if (reference.group === GATEWAY_API_GROUP && reference.kind === 'Gateway') {
    return (
      <Link
        routeName="gateway"
        params={{ namespace: reference.namespace, name: reference.name }}
        activeCluster={cluster}
      >
        {reference.name}
      </Link>
    );
  }

  return <>{reference.name}</>;
}

function GatewayBackendReferenceName(props: {
  reference: ResolvedGatewayBackendReference;
  cluster?: string;
}) {
  const { reference, cluster } = props;

  if (reference.group === '' && reference.kind === 'Service') {
    return (
      <Link
        routeName="service"
        params={{ namespace: reference.namespace, name: reference.name }}
        activeCluster={cluster}
      >
        {reference.name}
      </Link>
    );
  }

  return <>{reference.name}</>;
}

export function GatewayBackendRefTable(props: {
  backendRefs: GatewayBackendReference[];
  namespace?: string;
  cluster?: string;
}) {
  const { backendRefs, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const references = backendRefs.map(ref => resolveGatewayBackendReference(ref, namespace));

  return (
    <InnerTable
      columns={[
        {
          label: t('translation|Name'),
          getter: (data: ResolvedGatewayBackendReference) => (
            <GatewayBackendReferenceName reference={data} cluster={cluster} />
          ),
        },
        {
          label: t('translation|Namespace'),
          getter: (data: ResolvedGatewayBackendReference) => data.namespace,
        },
        {
          label: t('translation|Kind'),
          getter: (data: ResolvedGatewayBackendReference) => data.kind,
        },
        {
          label: t('translation|Group'),
          getter: (data: ResolvedGatewayBackendReference) => data.group,
        },
        {
          label: t('translation|Port'),
          getter: (data: ResolvedGatewayBackendReference) => data.port,
        },
        {
          label: t('translation|Weight'),
          getter: (data: ResolvedGatewayBackendReference) => data.weight,
        },
      ]}
      data={references}
    />
  );
}

export function GatewayParentRefSection(props: {
  parentRefs: GatewayParentReference[];
  namespace?: string;
  cluster?: string;
}) {
  const { parentRefs, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const references = parentRefs.map(ref => resolveGatewayParentReference(ref, namespace));

  return (
    <SectionBox title={t('translation|ParentRefs')}>
      <SimpleTable
        emptyMessage={t('translation|No rules data to be shown.')}
        columns={[
          {
            label: t('translation|Name'),
            getter: (data: ResolvedGatewayParentReference) => (
              <GatewayParentReferenceName reference={data} cluster={cluster} />
            ),
          },
          {
            label: t('translation|Namespace'),
            getter: (data: ResolvedGatewayParentReference) => data.namespace,
          },
          {
            label: t('translation|Kind'),
            getter: (data: ResolvedGatewayParentReference) => data.kind,
          },
          {
            label: t('translation|Group'),
            getter: (data: ResolvedGatewayParentReference) => data.group,
          },
          {
            label: t('translation|Section Name'),
            getter: (data: ResolvedGatewayParentReference) => data.sectionName,
          },
          {
            label: t('translation|Port'),
            getter: (data: ResolvedGatewayParentReference) => data.port,
          },
        ]}
        data={references}
        reflectInURL="parentRefs"
      />
    </SectionBox>
  );
}

export function GatewayParentStatusSection(props: {
  parents: GatewayRouteParentStatus[];
  namespace?: string;
  cluster?: string;
}) {
  const { parents, namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  return (
    <SectionBox title={t('translation|Parent Status')}>
      {parents.length === 0 ? (
        <EmptyContent>{t('translation|No data')}</EmptyContent>
      ) : (
        parents.map((parent, index) => {
          const reference = resolveGatewayParentReference(parent.parentRef, namespace);

          return (
            <NameValueTable
              key={`${reference.group}/${reference.kind}/${reference.namespace}/${reference.name}/${index}`}
              rows={[
                {
                  name: <GatewayParentReferenceName reference={reference} cluster={cluster} />,
                  withHighlightStyle: true,
                },
                {
                  name: t('translation|Namespace'),
                  value: reference.namespace,
                },
                {
                  name: t('translation|Kind'),
                  value: reference.kind,
                },
                {
                  name: t('translation|Group'),
                  value: reference.group,
                },
                {
                  name: t('glossary|Controller'),
                  value: parent.controllerName,
                },
                {
                  name: t('translation|Conditions'),
                  value: <ConditionList conditions={parent.conditions} />,
                  valueFullRow: true,
                },
              ]}
            />
          );
        })
      )}
    </SectionBox>
  );
}
