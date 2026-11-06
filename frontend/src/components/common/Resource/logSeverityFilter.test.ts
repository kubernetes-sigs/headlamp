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

import { ALL_SEVERITIES, detectSeverity, filterLogsBySeverity } from './logSeverityFilter';

describe('logSeverityFilter', () => {
  describe('detectSeverity', () => {
    it('detects JSON formats', () => {
      expect(detectSeverity('{"level": "error", "msg": "failed"}')).toBe('error');
      expect(detectSeverity('{"severity":"warning","message":"slow"}')).toBe('warn');
      expect(detectSeverity('{"level":"info","msg":"started"}')).toBe('info');
      expect(detectSeverity('{"level":"debug","msg":"trace"}')).toBe('debug');
      expect(detectSeverity('{"level":"fatal","msg":"died"}')).toBe('error');
    });

    it('detects key-value formats', () => {
      expect(detectSeverity('time="2023-01-01" level=error msg="failed"')).toBe('error');
      expect(detectSeverity('severity=WARNING message="slow"')).toBe('warn');
      expect(detectSeverity('level="info" msg="started"')).toBe('info');
      expect(detectSeverity('level=debug msg="trace"')).toBe('debug');
    });

    it('detects bracketed formats', () => {
      expect(detectSeverity('[ERROR] failed to start')).toBe('error');
      expect(detectSeverity('[WARN] slow response')).toBe('warn');
      expect(detectSeverity('[INFO] app started')).toBe('info');
      expect(detectSeverity('[DEBUG] tracing execution')).toBe('debug');
    });

    it('detects space-delimited formats', () => {
      expect(detectSeverity('2023-01-01 12:00:00 ERROR failed to start')).toBe('error');
      expect(detectSeverity('WARNING slow response')).toBe('warn');
      expect(detectSeverity('INFO app started')).toBe('info');
      expect(detectSeverity('DEBUG tracing execution')).toBe('debug');
      expect(detectSeverity('ERR failed')).toBe('error');
    });

    it('returns null for lines with no detectable severity', () => {
      expect(detectSeverity('Just a normal log line without any keywords')).toBeNull();
      expect(detectSeverity('{"message": "started server on port 8080"}')).toBeNull();
      expect(detectSeverity('Starting up...')).toBeNull();
      // Ensure it does not match partial words
      expect(detectSeverity('information overload')).toBeNull(); // "info" is part of "information" but not word boundary. Wait, \b matches boundary.
      // Actually \binformation\b does not match \binfo\b.
      expect(detectSeverity('ErrorLog is a class')).toBeNull(); // ErrorLog -> errorlog, "error" is not word boundary.
    });
  });

  describe('filterLogsBySeverity', () => {
    const logs = [
      '[ERROR] Database connection failed',
      '[WARN] High memory usage',
      '[INFO] Server started on port 8080',
      '[DEBUG] Initializing plugins',
      'Plain text log without severity',
      '{"level": "error", "message": "Failed to sync"}',
    ];

    it('returns all logs if all severities are selected', () => {
      const result = filterLogsBySeverity(logs, ['error', 'warn', 'info', 'debug']);
      expect(result).toHaveLength(logs.length);
      expect(result).toEqual(logs);
    });

    it('filters logs based on selected severities', () => {
      const result = filterLogsBySeverity(logs, ['error']);
      expect(result).toEqual([
        '[ERROR] Database connection failed',
        'Plain text log without severity',
        '{"level": "error", "message": "Failed to sync"}',
      ]);
    });

    it('always includes logs with no detectable severity', () => {
      const result = filterLogsBySeverity(logs, ['warn', 'debug']);
      expect(result).toContain('Plain text log without severity');
      expect(result).toContain('[WARN] High memory usage');
      expect(result).toContain('[DEBUG] Initializing plugins');
      expect(result).not.toContain('[ERROR] Database connection failed');
      expect(result).not.toContain('[INFO] Server started on port 8080');
      expect(result).not.toContain('{"level": "error", "message": "Failed to sync"}');
    });

    it('returns only structureless logs if no severities are selected', () => {
      const result = filterLogsBySeverity(logs, []);
      expect(result).toEqual(['Plain text log without severity']);
    });
  });

  describe('filterLogsBySeverity with one line per entry', () => {
    const lines = [
      '{"level":"info","message":"test0"}\n',
      '{"level":"warn","message":"test1"}\n',
      '{"level":"error","message":"test2"}\n',
    ];

    it('keeps only the error line', () => {
      expect(filterLogsBySeverity(lines, ['error'])).toEqual([
        '{"level":"error","message":"test2"}\n',
      ]);
    });

    it('keeps only the info line', () => {
      expect(filterLogsBySeverity(lines, ['info'])).toEqual([
        '{"level":"info","message":"test0"}\n',
      ]);
    });

    it('keeps every line when all severities are selected', () => {
      expect(filterLogsBySeverity(lines, ALL_SEVERITIES).join('')).toBe(lines.join(''));
    });

    it('keeps lines with no detectable severity', () => {
      const mixed = ['plain line\n', '{"level":"error","message":"boom"}\n'];
      expect(filterLogsBySeverity(mixed, ['warn'])).toEqual(['plain line\n']);
    });

    it('rejoins to the original text when nothing is filtered out', () => {
      expect(filterLogsBySeverity(lines, ['error', 'warn', 'info']).join('')).toBe(lines.join(''));
    });
  });

  describe('filterLogsBySeverity with prettified entries', () => {
    const prettify = (level: string, message: string) =>
      JSON.stringify({ level, message }, null, 2) + '\n';

    const entries = [prettify('info', 'test0'), prettify('error', 'test2')];

    it('drops a whole prettified object rather than part of it', () => {
      expect(filterLogsBySeverity(entries, ['error'])).toEqual([prettify('error', 'test2')]);
    });

    it('never leaks a fragment of a filtered-out object', () => {
      expect(filterLogsBySeverity(entries, ['error']).join('')).not.toContain('test0');
    });

    it('keeps a whole prettified object that matches', () => {
      expect(filterLogsBySeverity(entries, ['info'])).toEqual([prettify('info', 'test0')]);
    });

    it('keeps a prettified object with a timestamp in front of it', () => {
      const timestamped = '2025-01-01T00:00:00Z\n' + prettify('error', 'boom');
      expect(filterLogsBySeverity([timestamped], ['error'])).toEqual([timestamped]);
      expect(filterLogsBySeverity([timestamped], ['info'])).toEqual([]);
    });
  });
});
