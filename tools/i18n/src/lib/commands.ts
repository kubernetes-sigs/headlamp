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

import * as fs from 'fs';
import * as path from 'path';
import { NAMESPACES, REFERENCE_LANG } from './types';
import { getLanguages, loadTranslationFile, countTranslations } from './translations';
import { getLanguageStats, getProgressBar, getStatusInfo } from './stats';
import { colors, color } from './colors';

export function commandStatus(localesDir: string): void {
  console.log(color('\n📊 Translation Status for All Languages', colors.bright + colors.cyan));
  console.log(color('='.repeat(80), colors.cyan));
  console.log(`\n${color('Source:', colors.bright)} ${localesDir}\n`);

  const languages = getLanguages(localesDir);
  const referenceStats = getLanguageStats(localesDir, REFERENCE_LANG);
  const totalReferenceKeys = referenceStats.total.total;

  console.log(color(
    'Language'.padEnd(12) +
    'Progress'.padEnd(12) +
    'Translated'.padEnd(15) +
    'Missing'.padEnd(12) +
    'Status',
    colors.bright
  ));
  console.log('-'.repeat(80));

  const langStats = languages.map(lang => ({
    lang,
    stats: getLanguageStats(localesDir, lang),
  })).sort((a, b) => b.stats.total.percentage - a.stats.total.percentage);

  for (const { lang, stats } of langStats) {
    const percentage = stats.total.percentage;
    const translated = stats.total.translated;
    const missing = stats.total.empty;
    const bar = getProgressBar(percentage);
    const { color: statusColor, status } = getStatusInfo(percentage);
    const langDisplay = lang === REFERENCE_LANG ? `${lang} (ref)` : lang;

    console.log(
      langDisplay.padEnd(12) +
      `${bar} ${percentage}%`.padEnd(12) +
      `${translated}/${totalReferenceKeys}`.padEnd(15) +
      missing.toString().padEnd(12) +
      color(status, statusColor)
    );
  }

  console.log();
}

export function commandList(localesDir: string, targetLang?: string): void {
  const languages = targetLang ? [targetLang] : getLanguages(localesDir);

  console.log(color('\n📂 Translation Files', colors.bright + colors.cyan));
  console.log(color('='.repeat(80), colors.cyan));
  console.log(`\nSource: ${color(localesDir, colors.cyan)}\n`);

  for (const lang of languages) {
    const langDir = path.join(localesDir, lang);
    const isReference = lang === REFERENCE_LANG;

    console.log(color(`\n${isReference ? '📌' : '🌐'} ${lang.toUpperCase()}${isReference ? ' (reference)' : ''}`, colors.bright + colors.yellow));
    console.log(color('─'.repeat(80), colors.yellow));

    if (!fs.existsSync(langDir)) {
      console.log(color('   ❌ Language directory missing!', colors.red));
      console.log(`   ${color('Expected:', colors.bright)} ${path.relative(process.cwd(), langDir)}\n`);
      continue;
    }

    for (const namespace of NAMESPACES) {
      const filePath = path.join(langDir, `${namespace}.json`);
      const relativePath = path.relative(process.cwd(), filePath);

      if (!fs.existsSync(filePath)) {
        console.log(`   ${color('❌', colors.red)} ${namespace.padEnd(15)} ${color('MISSING', colors.red)}`);
        console.log(`      ${color(relativePath, colors.cyan)}`);
        continue;
      }

      const translations = loadTranslationFile(localesDir, lang, namespace);
      if (!translations) {
        console.log(`   ${color('❌', colors.red)} ${namespace.padEnd(15)} ${color('ERROR reading file', colors.red)}`);
        console.log(`      ${color(relativePath, colors.cyan)}`);
        continue;
      }

      const { total, translated } = countTranslations(translations);
      const percentage = total > 0 ? Math.round((translated / total) * 100) : 0;
      const { color: statusColor, icon } = getStatusInfo(percentage);
      const percentageStr = `${percentage}%`.padStart(4);
      const keysStr = `${translated}/${total}`.padStart(10);

      console.log(`   ${icon} ${namespace.padEnd(15)} ${color(percentageStr, statusColor)} ${keysStr} keys`);
      console.log(`      ${color(relativePath, colors.cyan)}`);
    }
  }

  console.log(color('\n' + '='.repeat(80), colors.cyan));
  console.log(color('\nAvailable commands:', colors.bright));
  console.log(color('   npm run i18n:status', colors.cyan) + '  - Show translation status overview');
  console.log(color('   npm run i18n:list', colors.cyan) + '    - List all translation files (this command)');
  console.log(color('   npm run i18n:list de', colors.cyan) + ' - List files for specific language\n');
}
