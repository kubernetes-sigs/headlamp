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

import React, { useEffect, useState } from 'react';
import Job from '../../lib/k8s/job';
import { formatDuration } from '../../lib/util';

export interface JobDurationProps {
  /** The Job whose completed or live elapsed duration should be displayed. */
  job: Job;
}

/**
 * Displays a Job's formatted duration and refreshes once per second while the
 * Job has started and does not yet have a `completionTime`. Completed or
 * unstarted Jobs render statically without an active timer.
 */
export default function JobDuration({ job }: JobDurationProps): React.ReactNode {
  const [, setTick] = useState(0);
  const duration = job.getDuration();
  const shouldRefresh = duration >= 0 && !job.status?.completionTime;

  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    const id = setInterval(() => {
      setTick(t => t + 1);
    }, 1_000);

    return () => clearInterval(id);
  }, [shouldRefresh]);

  if (duration < 0) {
    return '-';
  }

  return formatDuration(duration, { format: 'mini' });
}
