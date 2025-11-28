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
import { loadTranslationFile, saveTranslationFile, extractEmptyTranslations, copyTranslations } from '../src/lib/translations';
import { Translations } from '../src/lib/types';

const TEST_DIR = path.join(__dirname, '../temp-translations');

describe('translations module integration tests', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'en'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'fr'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('saveTranslationFile and loadTranslationFile', () => {
    it('should save and load translation files', () => {
      const translations: Translations = {
        'hello': 'Hello',
        'world': 'World',
        'missing': '',
      };
      
      const filePath = path.join(TEST_DIR, 'test.json');
      saveTranslationFile(filePath, translations);
      
      expect(fs.existsSync(filePath)).toBe(true);
      
      const loaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(loaded).toEqual(translations);
    });

    it('should load translation file by namespace', () => {
      const translations: Translations = {
        'key1': 'value1',
        'key2': '',
      };
      
      const filePath = path.join(TEST_DIR, 'en', 'translation.json');
      saveTranslationFile(filePath, translations);
      
      const loaded = loadTranslationFile(TEST_DIR, 'en', 'translation');
      expect(loaded).toEqual(translations);
    });

    it('should return null for non-existent files', () => {
      const loaded = loadTranslationFile(TEST_DIR, 'de', 'translation');
      expect(loaded).toBeNull();
    });
  });

  describe('extractEmptyTranslations', () => {
    it('should extract empty translations to new file', () => {
      const translations: Translations = {
        'key1': 'translated',
        'key2': '',
        'key3': 'translated too',
        'key4': '',
      };
      
      const empty = extractEmptyTranslations(translations);
      
      expect(empty).toEqual({
        'key2': '',
        'key4': '',
      });
      expect(Object.keys(empty).length).toBe(2);
    });
  });

  describe('copyTranslations', () => {
    it('should copy missing translations between files', () => {
      const source: Translations = {
        'key1': 'source1',
        'key2': 'source2',
        'key3': 'source3',
      };
      const dest: Translations = {
        'key1': 'existing',
        'key2': '',
        'key3': '',
      };
      
      const result = copyTranslations(source, dest);
      
      expect(result.copiedCount).toBe(2);
      expect(result.updatedTranslations['key1']).toBe('existing');
      expect(result.updatedTranslations['key2']).toBe('source2');
      expect(result.updatedTranslations['key3']).toBe('source3');
    });

    it('should overwrite with force option', () => {
      const source: Translations = {
        'key1': 'new value',
      };
      const dest: Translations = {
        'key1': 'old value',
      };
      
      const result = copyTranslations(source, dest, { force: true });
      
      expect(result.copiedCount).toBe(1);
      expect(result.updatedTranslations['key1']).toBe('new value');
    });

    it('should add new keys with all option', () => {
      const source: Translations = {
        'key1': 'value1',
        'key2': 'value2',
      };
      const dest: Translations = {
        'key1': 'existing',
      };
      
      const result = copyTranslations(source, dest, { all: true });
      
      expect(result.copiedCount).toBe(1);
      expect(result.updatedTranslations['key2']).toBe('value2');
    });
  });
});
