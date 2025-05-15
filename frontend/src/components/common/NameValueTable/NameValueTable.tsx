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

import { Grid, GridProps } from '@mui/material';
import React, { ReactNode } from 'react';
import { ValueLabel } from '../Label';

// TODO: use ReactNode after migration to react 18
export interface NameValueTableRow {
  /** The name (key) for this row */
  name: ReactNode;
  /** The value for this row */
  value?: ReactNode;
  /** Whether this row should be hidden (can be a boolean or a function that will take the
   * @param value and return a boolean) */
  hide?: boolean | ((value: NameValueTableRow['value']) => boolean);
  /** Extra properties to pass to the value cell */
  valueCellProps?: GridProps;
  /** Whether to highlight the row (used for titles, separators, etc.). */
  withHighlightStyle?: boolean;
}

export interface NameValueTableProps {
  rows: NameValueTableRow[];
  valueCellProps?: GridProps;
}

function Value({ value }: { value: ReactNode }): ReactNode {
  if (typeof value === 'undefined') {
    return null;
  } else if (typeof value === 'string') {
    return <ValueLabel>{value}</ValueLabel>;
  } else if (Array.isArray(value)) {
    return (
      <>
        {value.map((val, i) => (
          <Value value={val} key={i} />
        ))}
      </>
    );
  } else {
    return value;
  }
}

export default function NameValueTable(props: NameValueTableProps) {
  const { rows, valueCellProps: globalValueCellProps } = props;

  const visibleRows = React.useMemo(
    () =>
      rows.filter(({ value, hide = false }) => {
        let shouldHide = false;
        if (typeof hide === 'function') {
          shouldHide = hide(value);
        } else {
          shouldHide = hide;
        }

        return !shouldHide;
      }),
    [rows]
  );

  return (
    <Grid
      container
      component="dl" // mount a Definition List
      sx={theme => ({
        border: '1px solid',
        borderColor: theme.palette.tables.head.borderColor,
        borderRadius: theme.shape.borderRadius + 'px',
        overflow: 'hidden',
      })}
    >
      {visibleRows.flatMap(
        ({ name, value, hide = false, withHighlightStyle = false, valueCellProps = {} }, i) => {
          let shouldHide = false;
          if (typeof hide === 'function') {
            shouldHide = hide(value);
          } else {
            shouldHide = hide;
          }

          if (shouldHide) {
            return null;
          }

          const last = visibleRows.length === i + 1;
          const { className, ...otherValueCellProps } = globalValueCellProps || {};

          const hideValueGridItem = withHighlightStyle && !value;

          const items = [
            <Grid
              item
              key={i}
              xs={12}
              sm={hideValueGridItem ? 12 : 4}
              component="dt"
              className={className}
              sx={theme => {
                const extra = withHighlightStyle
                  ? {
                      color: theme.palette.text.primary,
                      fontWeight: 'bold',
                      background: theme.palette.background.muted,
                    }
                  : {};
                return {
                  fontSize: '1rem',
                  textAlign: 'left',
                  maxWidth: '100%',
                  minWidth: '10rem',
                  verticalAlign: 'top',
                  color: theme.palette.text.secondary,
                  borderBottom: last ? 'none' : `1px solid ${theme.palette.divider}`,
                  padding: '7px 12px',
                  [theme.breakpoints.down('sm')]: {
                    color: theme.palette.text.primary,
                    fontSize: '1.5rem',
                    minWidth: '100%',
                    width: '100%',
                    maxWidth: '100%',
                    display: 'block',
                    borderTop: `1px solid ${theme.palette.divider}`,
                    borderBottom: `none`,
                  },
                  ...extra,
                };
              }}
            >
              {name}
            </Grid>,
          ];
          if (!hideValueGridItem) {
            items.push(
              <Grid
                item
                key={i + 10000}
                xs={12}
                sm={8}
                component="dd"
                sx={theme => {
                  const extra = withHighlightStyle
                    ? {
                        color: theme.palette.text.primary,
                        fontWeight: 'bold',
                        background: theme.palette.background.muted,
                      }
                    : {};
                  return {
                    width: '100%',
                    verticalAlign: 'top',
                    fontSize: '1rem',
                    overflowWrap: 'anywhere',
                    padding: '7px 12px',
                    borderBottom: last ? 'none' : `1px solid ${theme.palette.divider}`,
                    [theme.breakpoints.down('sm')]: {
                      color: theme.palette.text.secondary,
                      minWidth: '100%',
                      width: '100%',
                      maxWidth: '100%',
                      display: 'block',
                      marginBottom: '2rem',
                      borderBottom: `none`,
                    },
                    ...extra,
                  };
                }}
                {...otherValueCellProps}
                {...valueCellProps}
              >
                <Value value={value} />
              </Grid>
            );
          }
          return items;
        }
      )}
    </Grid>
  );
}
