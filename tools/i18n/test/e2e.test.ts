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

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const CLI_PATH = path.join(__dirname, '../src/index.ts');
const TEST_DIR = path.join(__dirname, 'fixtures');
const TEMP_DIR = path.join(__dirname, 'temp');

function runCLI(args: string): { stdout: string; stderr: string; exitCode: number; output: string } {
  try {
    const stdout = execSync(`ts-node ${CLI_PATH} ${args}`, {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return { stdout, stderr: '', exitCode: 0, output: stdout };
  } catch (error: any) {
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';
    const output = stdout + stderr;
    return {
      stdout,
      stderr,
      exitCode: error.status || 1,
      output,
    };
  }
}

function createTestFile(filePath: string, content: object): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
}

function readTestFile(filePath: string): object {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('i18n CLI Tool E2E Tests', () => {
  beforeEach(() => {
    // Clean up temp directory before each test
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory after each test
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  describe('status command', () => {
    it('should show translation status for all languages', () => {
      const result = runCLI('status');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Translation Status for All Languages');
      expect(result.stdout).toContain('Language');
      expect(result.stdout).toContain('Progress');
      expect(result.stdout).toContain('Translated');
      expect(result.stdout).toContain('Missing');
      expect(result.stdout).toContain('Status');
      // Check for reference language
      expect(result.stdout).toContain('en (ref)');
    });

    it('should display progress bars', () => {
      const result = runCLI('status');
      
      expect(result.exitCode).toBe(0);
      // Progress bars use block characters
      expect(result.stdout).toMatch(/[█░]/);
    });

    it('should show completion percentages', () => {
      const result = runCLI('status');
      
      expect(result.exitCode).toBe(0);
      // Should have percentage indicators
      expect(result.stdout).toMatch(/\d+%/);
    });
  });

  describe('list command', () => {
    it('should list all translation files', () => {
      const result = runCLI('list');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Translation Files');
      expect(result.stdout).toContain('EN (reference)');
      // Should show namespaces
      expect(result.stdout).toContain('translation');
      expect(result.stdout).toContain('glossary');
      expect(result.stdout).toContain('app');
    });

    it('should list files for specific language', () => {
      const result = runCLI('list en');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('EN (reference)');
      expect(result.stdout).toContain('translation');
      // Should not show other languages
      const lines = result.stdout.split('\n');
      const languageHeaders = lines.filter(line => /^🌐/.test(line.trim()));
      expect(languageHeaders.length).toBe(0); // Only reference (📌) should show
    });

    it('should show completion percentages for files', () => {
      const result = runCLI('list en');
      
      expect(result.exitCode).toBe(0);
      // Should show percentage and key counts
      expect(result.stdout).toMatch(/\d+%/);
      expect(result.stdout).toMatch(/\d+\/\d+ keys/);
    });

    it('should show available commands', () => {
      const result = runCLI('list');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Available commands:');
      expect(result.stdout).toContain('npm run i18n:status');
      expect(result.stdout).toContain('npm run i18n:list');
    });
  });

  describe('extract command', () => {
    it('should extract empty translations to a file', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const outputFile = path.join(TEMP_DIR, 'output.json');

      createTestFile(sourceFile, {
        'key1': 'translated',
        'key2': '',
        'key3': 'another translation',
        'key4': '',
        'key5': '',
      });

      const result = runCLI(`extract ${sourceFile} ${outputFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Success!');
      expect(result.output).toMatch(/Extracted.*3.*empty.*translation/i);
      
      // Check output file was created
      expect(fs.existsSync(outputFile)).toBe(true);
      
      const output = readTestFile(outputFile) as any;
      expect(Object.keys(output)).toEqual(['key2', 'key4', 'key5']);
      expect(output.key2).toBe('');
      expect(output.key4).toBe('');
      expect(output.key5).toBe('');
    });

    it('should use default output filename if not specified', () => {
      const sourceFile = path.join(TEMP_DIR, 'translations.json');
      const expectedOutput = path.join(TEMP_DIR, 'translations_empty.json');

      createTestFile(sourceFile, {
        'key1': '',
        'key2': 'translated',
      });

      const result = runCLI(`extract ${sourceFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(expectedOutput)).toBe(true);
      
      const output = readTestFile(expectedOutput) as any;
      expect(Object.keys(output)).toEqual(['key1']);
    });

    it('should handle file with no empty translations', () => {
      const sourceFile = path.join(TEMP_DIR, 'complete.json');

      createTestFile(sourceFile, {
        'key1': 'translated',
        'key2': 'another translation',
      });

      const result = runCLI(`extract ${sourceFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No missing translations found');
    });

    it('should show error for non-existent file', () => {
      const result = runCLI('extract /nonexistent/file.json');
      
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Error: File not found');
    });

    it('should provide next steps after extraction', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');

      createTestFile(sourceFile, {
        'key1': '',
      });

      const result = runCLI(`extract ${sourceFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Next steps:');
      expect(result.stdout).toContain('Translate the empty values');
      expect(result.stdout).toContain('npm run i18n:copy');
    });
  });

  describe('copy command', () => {
    it('should copy missing translations from source to destination', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, {
        'key1': 'source translation 1',
        'key2': 'source translation 2',
        'key3': 'source translation 3',
      });

      createTestFile(destFile, {
        'key1': '',
        'key2': 'existing translation',
        'key3': '',
      });

      const result = runCLI(`copy ${sourceFile} ${destFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Success!');
      expect(result.output).toMatch(/Copied.*2.*translation/i);
      
      const dest = readTestFile(destFile) as any;
      expect(dest.key1).toBe('source translation 1');
      expect(dest.key2).toBe('existing translation'); // Not overwritten
      expect(dest.key3).toBe('source translation 3');
    });

    it('should not overwrite non-empty translations by default', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, {
        'key1': 'new translation',
      });

      createTestFile(destFile, {
        'key1': 'existing translation',
      });

      const result = runCLI(`copy ${sourceFile} ${destFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No translations copied');
      expect(result.stdout).toContain('skipped');
      
      const dest = readTestFile(destFile) as any;
      expect(dest.key1).toBe('existing translation');
    });

    it('should overwrite translations with --force flag', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, {
        'key1': 'new translation',
        'key2': 'another new translation',
      });

      createTestFile(destFile, {
        'key1': 'existing translation',
        'key2': 'existing translation 2',
      });

      const result = runCLI(`copy ${sourceFile} ${destFile} --force`);
      
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/Copied.*2.*translation/i);
      
      const dest = readTestFile(destFile) as any;
      expect(dest.key1).toBe('new translation');
      expect(dest.key2).toBe('another new translation');
    });

    it('should copy new keys with --all flag', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, {
        'key1': 'translation 1',
        'key2': 'translation 2',
        'key3': 'translation 3',
      });

      createTestFile(destFile, {
        'key1': '',
      });

      const result = runCLI(`copy ${sourceFile} ${destFile} --all`);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      
      const dest = readTestFile(destFile) as any;
      expect(dest.key1).toBe('translation 1');
      expect(dest.key2).toBe('translation 2');
      expect(dest.key3).toBe('translation 3');
    });

    it('should handle source file not found', () => {
      const destFile = path.join(TEMP_DIR, 'dest.json');
      createTestFile(destFile, { 'key1': '' });

      const result = runCLI(`copy /nonexistent/source.json ${destFile}`);
      
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Error: Source file not found');
    });

    it('should handle destination file not found', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      createTestFile(sourceFile, { 'key1': 'value' });

      const result = runCLI(`copy ${sourceFile} /nonexistent/dest.json`);
      
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Error: Destination file not found');
    });

    it('should show skipped count when applicable', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, {
        'key1': 'new value',
        'key2': 'another new value',
        'key3': 'yet another',
      });

      createTestFile(destFile, {
        'key1': 'existing',
        'key2': 'existing 2',
        'key3': '',
      });

      const result = runCLI(`copy ${sourceFile} ${destFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatch(/Copied.*1.*translation/i);
      expect(result.output).toMatch(/Skipped.*2.*translation/i);
      expect(result.output).toMatch(/Use.*--force.*to overwrite/i);
    });
  });

  describe('help and usage', () => {
    it('should show help with --help flag', () => {
      const result = runCLI('--help');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('i18n <command> [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('extract');
      expect(result.stdout).toContain('copy');
    });

    it('should show help with -h flag', () => {
      const result = runCLI('-h');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Commands:');
    });

    it('should show error when no command specified', () => {
      const result = runCLI('');
      
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Please specify a command');
    });

    it('should show examples in help', () => {
      const result = runCLI('--help');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Examples:');
      expect(result.stdout).toContain('i18n status');
      expect(result.stdout).toContain('i18n list');
      expect(result.stdout).toContain('i18n extract');
      expect(result.stdout).toContain('i18n copy');
    });

    it('should show documentation link', () => {
      const result = runCLI('--help');
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('headlamp.dev/docs');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed JSON in extract', () => {
      const sourceFile = path.join(TEMP_DIR, 'malformed.json');
      fs.writeFileSync(sourceFile, '{ invalid json }');

      const result = runCLI(`extract ${sourceFile}`);
      
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Error: Failed to process file');
    });

    it('should handle malformed JSON in copy', () => {
      const sourceFile = path.join(TEMP_DIR, 'malformed.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');
      
      fs.writeFileSync(sourceFile, '{ invalid json }');
      createTestFile(destFile, { 'key': 'value' });

      const result = runCLI(`copy ${sourceFile} ${destFile}`);
      
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Error: Failed to process files');
    });

    it('should handle empty source file in copy', () => {
      const sourceFile = path.join(TEMP_DIR, 'empty.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, {});
      createTestFile(destFile, { 'key1': '' });

      const result = runCLI(`copy ${sourceFile} ${destFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No translations copied');
    });

    it('should handle empty destination file in copy', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'empty.json');

      createTestFile(sourceFile, { 'key1': 'value' });
      createTestFile(destFile, {});

      const result = runCLI(`copy ${sourceFile} ${destFile}`);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No translations copied');
    });

    it('should preserve JSON formatting in output files', () => {
      const sourceFile = path.join(TEMP_DIR, 'source.json');
      const destFile = path.join(TEMP_DIR, 'dest.json');

      createTestFile(sourceFile, { 'key1': 'value1' });
      createTestFile(destFile, { 'key1': '' });

      runCLI(`copy ${sourceFile} ${destFile}`);
      
      const content = fs.readFileSync(destFile, 'utf8');
      // Should be prettified with 2 spaces
      expect(content).toContain('  "key1"');
      // Should end with newline
      expect(content.endsWith('\n')).toBe(true);
    });
  });
});
