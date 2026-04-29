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

import { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';
import { SeveritySelector } from './SeveritySelector';

type Args = React.ComponentProps<typeof SeveritySelector>;

export default {
  title: 'common/LogsViewer/SeveritySelector',
  component: SeveritySelector,
} as Meta<typeof SeveritySelector>;

/** Wraps the selector so click handlers update local state. */
const Template: StoryFn<Args> = args => {
  const [severities, setSeverities] = useState<Set<string> | undefined>(args.severities);
  return (
    <SeveritySelector
      severityStats={args.severityStats}
      severities={severities}
      setSeverities={setSeverities}
    />
  );
};

const fullStats = new Map<string, number>([
  ['info', 1284],
  ['error', 12],
  ['warning', 47],
  ['fatal', 1],
  ['trace', 8],
  ['debug', 332],
]);

/** All severity levels selected (default). */
export const AllLevels = Template.bind({});
AllLevels.args = {
  severityStats: fullStats,
  severities: undefined,
};

/** A subset of severity levels selected, label shows the active filters. */
export const FilteredSelection = Template.bind({});
FilteredSelection.args = {
  severityStats: fullStats,
  severities: new Set(['error', 'warning', 'fatal']),
};

/** Only one severity selected. */
export const SingleSeverity = Template.bind({});
SingleSeverity.args = {
  severityStats: fullStats,
  severities: new Set(['error']),
};

/** No counts provided, the menu shows just the severity names. */
export const NoStats = Template.bind({});
NoStats.args = {
  severityStats: undefined,
  severities: undefined,
};

/** Stats provided but all counts are zero. */
export const EmptyStats = Template.bind({});
EmptyStats.args = {
  severityStats: new Map(),
  severities: undefined,
};

/** All severities are deselected, the button label falls back to a placeholder. */
export const NoneSelected = Template.bind({});
NoneSelected.args = {
  severityStats: fullStats,
  severities: new Set<string>(),
};
