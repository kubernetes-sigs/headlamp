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

import { sortBy } from 'lodash';
import { useMemo } from 'react';

const severities = {
  warning: ['warning', 'warn', 'wrn'],
  error: ['error', 'err'],
  info: ['info', 'inf'],
  debug: ['debug', 'dbg'],
  trace: ['trace'],
  fatal: ['fatal'],
};

export interface ParsedLog {
  timestamp: string;
  severity: 'info' | 'error' | 'warning' | 'fatal' | 'trace' | 'debug';
  content: string;
  pod?: string;
}

const severityLookupMap: Record<string, ParsedLog['severity']> = {};
for (const severityLevel in severities) {
  const key = severityLevel as ParsedLog['severity'];
  for (const alias of severities[key]) {
    severityLookupMap[alias] = key;
  }
}

const allAliases = Object.values(severities).flat();
const masterSeverityRegex = new RegExp(`\\b(${allAliases.join('|')})\\b`, 'i');

const ansiLikeRegex = /\[\s*\[?\s*\d+m/g;

// Regex to identify an ISO 8601-like timestamp at the start of a string.
const secondTimestampRegex =
  /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;

/**
 * Parses a log line in a single pass (linear time complexity).
 *
 * @param line The log line string to parse.
 * @returns A ParsedLog object.
 */
function parseLogLine(line: string, pod?: string): ParsedLog {
  const timestampMatch = line.match(/^\S+/);
  const timestamp = timestampMatch ? timestampMatch[0] : '';

  let severity: ParsedLog['severity'] = 'info'; // Default severity
  const severityMatch = line.replace(ansiLikeRegex, '').match(masterSeverityRegex);
  if (severityMatch) {
    const matchedAlias = severityMatch[1].toLowerCase();
    severity = severityLookupMap[matchedAlias];
  }

  const content = line.substring(timestamp.length).trim().replace(secondTimestampRegex, '');

  return {
    timestamp: timestamp,
    severity: severity,
    content,
    pod,
  };
}

export const useParsedLogs = (logs: string[] | Record<string, string[]>) => {
  const parsed = useMemo(() => {
    if (Array.isArray(logs)) {
      return logs.map(log => parseLogLine(log));
    }

    const result: ParsedLog[] = [];
    const addPod = Object.keys(logs).length > 1;
    Object.entries(logs).forEach(([pod, logs]) => {
      logs.forEach(log => {
        result.push(parseLogLine(log, addPod ? pod : undefined));
      });
    });
    return sortBy(result, it => it.timestamp);
  }, [logs]);
  return parsed;
};
