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
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom';
import {
  Bar,
  BarChart,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Loader from './Loader';

export interface ChartDataPoint {
  name: string;
  value: number;
  fill?: string;
}

export interface PercentageCircleProps {
  data: ChartDataPoint[];
  size?: number;
  dataKey?: string;
  label?: string | null;
  title?: ReactNode;
  legend?: ReactNode;
  total?: number;
  totalProps?: {
    [propName: string]: any;
  };
  thickness?: number;
}

export function PercentageCircle(props: PercentageCircleProps) {
  const theme = useTheme();
  const {
    data,
    size = 200,
    dataKey = 'percentage',
    label = '',
    title = '',
    legend = null,
    total = 100,
    totalProps = {},
    thickness = 16,
  } = props;

  const chartSize = size * 0.8;
  const isLoading = total < 0;

  function formatData() {
    let filledValue = 0;
    const formattedData = data.map(item => {
      filledValue += item.value;

      return {
        percentage: (item.value / total) * 100,
        ...item,
      };
    });

    const totalValue =
      total === 0
        ? {
            name: 'total',
            percentage: 100,
            value: total,
            fill: theme.palette.chartStyles.defaultFillColor,
          }
        : {
            name: 'total',
            percentage: ((total - filledValue) / total) * 100,
            value: total,
            fill: theme.palette.chartStyles.defaultFillColor,
            ...totalProps,
          };

    return formattedData.concat(totalValue);
  }

  return (
    <Box
      aria-busy={isLoading}
      aria-live="polite"
      justifyContent="center"
      alignItems="center"
      alignContent="center"
      mx="auto"
    >
      {title && (
        <Typography
          sx={{
            textAlign: 'center',
            fontSize: '1.2em',
            flexGrow: 1,
            fontWeight: 'bold',
          }}
        >
          {title}
        </Typography>
      )}
      {isLoading ? (
        <Loader title={`Loading data for ${title}`} />
      ) : (
        <PieChart
          cx={size / 2}
          cy={size / 2}
          width={chartSize}
          height={chartSize}
          style={{
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <Pie
            isAnimationActive={false}
            data={formatData()}
            // Center the chart
            cx={chartSize / 2}
            cy={chartSize / 2}
            innerRadius={chartSize * 0.4 - thickness}
            outerRadius={chartSize * 0.4}
            dataKey={dataKey}
            // Start at the top
            startAngle={90}
            endAngle={-270}
            stroke={theme.palette.chartStyles.defaultFillColor}
            fill={theme.palette.chartStyles.fillColor || theme.palette.common.black}
          >
            <Label
              value={label || ''}
              position="center"
              style={{
                fontSize: `${chartSize * 0.15}px`,
                fill: theme.palette.chartStyles.labelColor,
              }}
            />
          </Pie>
        </PieChart>
      )}
      {!isLoading && legend !== null && (
        <Typography
          sx={{
            textAlign: 'center',
            fontSize: '1.1em',
            flexGrow: 1,
          }}
        >
          {legend}
        </Typography>
      )}
    </Box>
  );
}

const StyledResponsiveContainer = styled(ResponsiveContainer)({
  marginLeft: 'auto',
  marginRight: 'auto',
});

const StyledBarChart = styled(BarChart)(({ theme }) => ({
  zIndex: theme.zIndex.drawer,
}));

export interface PercentageBarProps {
  data: ChartDataPoint[];
  total?: number;
  tooltipFunc?: ((data: any) => ReactNode) | null;
}

export function PercentageBar(props: PercentageBarProps) {
  const theme = useTheme();

  const { data, total = 100, tooltipFunc = null } = props;

  function formatData() {
    const dataItems: { [name: string]: number } = {};

    data.forEach(item => {
      dataItems[item.name] = (item.value / total) * 100;
    });

    return dataItems;
  }

  const barBackground =
    theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[300];

  const barColor =
    theme.palette.mode === 'dark' ? theme.palette.primary.light : theme.palette.primary.main;

  return (
    <StyledResponsiveContainer width="95%" height={20}>
      <StyledBarChart layout="vertical" maxBarSize={5} data={[formatData()]}>
        {tooltipFunc && (
          <Tooltip
            content={props => (
              <PaperTooltip rechartsProps={props} tooltipFunc={tooltipFunc} data={data} />
            )}
          />
        )}
        <XAxis hide domain={[0, 100]} type="number" />
        <YAxis hide type="category" />
        {data.map((item, index) => {
          return (
            <Bar
              key={index}
              dataKey={item.name}
              stackId="1"
              fill={item.fill || barColor}
              layout="vertical"
              radius={theme.shape.borderRadius}
              background={{ fill: barBackground }}
            />
          );
        })}
      </StyledBarChart>
    </StyledResponsiveContainer>
  );
}

interface PaperTooltipProps {
  rechartsProps?: any;
  tooltipFunc: (data: any) => ReactNode;
  data: any;
}

function PaperTooltip({ rechartsProps, tooltipFunc, data }: PaperTooltipProps) {
  if (!rechartsProps || !rechartsProps.active || !rechartsProps.coordinate) return null;

  const chartRect = document.querySelector('.recharts-wrapper')?.getBoundingClientRect();

  const { x, y } = rechartsProps.coordinate;
  const left = (chartRect?.left || 0) + x;
  const top = (chartRect?.top || 0) + y;

  return ReactDOM.createPortal(
    <Paper
      className="custom-tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1500,
        pointerEvents: 'none',
        minWidth: 120,
      }}
    >
      <Box m={1}>{tooltipFunc(data)}</Box>
    </Paper>,
    document.body
  );
}
