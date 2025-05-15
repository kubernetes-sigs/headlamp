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

import React from 'react';
import { LightTooltip } from './Tooltip';

export interface LabelListItemProps {
  labels?: React.ReactNode[];
}

export default function LabelListItem(props: LabelListItemProps) {
  const { labels = [] } = props;
  const [text, tooltip] = React.useMemo(() => {
    const text = labels.join(', ');
    const tooltip = labels.join('\n');
    return [text, tooltip];
  }, [labels]);

  if (!text) {
    return null;
  }

  return (
    <LightTooltip title={tooltip} interactive>
      <span>{text}</span>
    </LightTooltip>
  );
}
