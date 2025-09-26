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

// notes:
// drop-in wrapper. only shows the yellow highlight when its context's topic
// matches the current active topic from localstorage.
// when inactive: renders the label untouched (no extra DOM, no ARIA noise).

import { Icon } from '@iconify/react';
import { Box } from '@mui/material';
import React from 'react';
import TooltipLight from '../Tooltip/TooltipLight';
import { getTutorialText } from './tutorialContent';
import { getActiveTutorial, TUTORIAL_ACTIVE_KEY } from './tutorialStorage';
import { contextToTopic } from './tutorialTopicsMap';
import type { TutorialContextId } from './types';

interface TutorialToolTipProps {
  context: TutorialContextId;
  labelText?: string | React.ReactNode;
}

export function TutorialToolTip({ context, labelText }: TutorialToolTipProps) {
  const [isActive, setIsActive] = React.useState(false);

  React.useEffect(() => {
    // helper so we can reuse it on mount + storage changes
    const check = () => {
      const active = getActiveTutorial();
      const topicForContext = contextToTopic[context];
      setIsActive(!!topicForContext && active.topicId === topicForContext);
    };

    // initial check
    check();

    // react to other places toggling the active topic
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === TUTORIAL_ACTIVE_KEY) check();
    };
    window.addEventListener('storage', onStorage);

    return () => window.removeEventListener('storage', onStorage);
  }, [context]);

  // if the context isn't active, render the label with zero changes
  if (!isActive) return <>{labelText}</>;

  const currentTutorialText = getTutorialText(context);

  // active: wrap with the yellow helper chrome + tooltip
  return (
    <Box
      sx={{
        borderColor: 'yellow',
        borderWidth: '2px',
        borderStyle: 'solid',
        padding: '0.2rem 0.4rem',
        borderRadius: '0.5rem',
        backgroundColor: 'rgba(255, 255, 0, 0.1)',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.3rem',
        display: 'flex',
      }}
    >
      <TooltipLight title={currentTutorialText} interactive>
        {labelText}
      </TooltipLight>
      <Box>
        <Icon icon="mdi:lightbulb-alert-outline" color="yellow" width="1.2rem" height="1.2rem" />
      </Box>
    </Box>
  );
}
