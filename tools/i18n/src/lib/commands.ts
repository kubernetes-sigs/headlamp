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
import { NAMESPACES, REFERENCE_LANG, CopyOptions, Translations } from './types';
import { getLanguages, loadTranslationFile, countTranslations, saveTranslationFile, extractEmptyTranslations, copyTranslations } from './translations';
import { getLanguageStats, getProgressBar, getStatusInfo } from './stats';
import { colors, color } from './colors';
import { resolveFilePath } from './paths';

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

export function commandExtract(projectRoot: string, translationsFile: string, outputFile?: string): void {
  const absoluteTranslationsFile = resolveFilePath(projectRoot, translationsFile);

  if (!fs.existsSync(absoluteTranslationsFile)) {
    console.error(color(`\n❌ Error: File not found: ${translationsFile}`, colors.red));
    process.exit(1);
  }

  try {
    const translations = JSON.parse(fs.readFileSync(absoluteTranslationsFile, 'utf8')) as Translations;
    const emptyTranslations = extractEmptyTranslations(translations);
    const emptyKeys = Object.keys(emptyTranslations);

    if (emptyKeys.length === 0) {
      console.log(color('\n✅ No missing translations found.', colors.green));
      process.exit(0);
    }

    const outputFileName = outputFile
      ? resolveFilePath(projectRoot, outputFile)
      : absoluteTranslationsFile.slice(0, absoluteTranslationsFile.lastIndexOf('.')) + '_empty.json';

    saveTranslationFile(outputFileName, emptyTranslations);

    console.log(color('\n✅ Success!', colors.green));
    console.log(`\nExtracted ${color(emptyKeys.length, colors.bright)} empty translations to:`);
    console.log(color(`   ${path.relative(projectRoot, outputFileName)}`, colors.cyan));
    console.log(`\n${color('Next steps:', colors.bright)}`);
    console.log('   1. Translate the empty values in the output file');
    console.log('   2. Use the copy command to merge them back:');
    console.log(color(`      npm run i18n:copy -- ${path.relative(projectRoot, outputFileName)} ${path.relative(projectRoot, absoluteTranslationsFile)}`, colors.cyan));
    console.log();
  } catch (error) {
    console.error(color(`\n❌ Error: Failed to process file: ${(error as Error).message}`, colors.red));
    process.exit(1);
  }
}

export function commandCopy(projectRoot: string, srcFile: string, destFile: string, options: CopyOptions = {}): void {
  const absoluteSrcFile = resolveFilePath(projectRoot, srcFile);
  const absoluteDestFile = resolveFilePath(projectRoot, destFile);

  if (!fs.existsSync(absoluteSrcFile)) {
    console.error(color(`\n❌ Error: Source file not found: ${srcFile}`, colors.red));
    process.exit(1);
  }

  if (!fs.existsSync(absoluteDestFile)) {
    console.error(color(`\n❌ Error: Destination file not found: ${destFile}`, colors.red));
    process.exit(1);
  }

  try {
    const srcData = JSON.parse(fs.readFileSync(absoluteSrcFile, 'utf8')) as Translations;
    const destData = JSON.parse(fs.readFileSync(absoluteDestFile, 'utf8')) as Translations;

    const { copiedCount, skippedCount, updatedTranslations } = copyTranslations(srcData, destData, options);

    if (copiedCount === 0) {
      console.log(color('\n⚠️  No translations copied.', colors.yellow));
      if (skippedCount > 0) {
        console.log(`\n${skippedCount} translations were skipped (already exist and not empty).`);
        console.log(`Use ${color('--force', colors.cyan)} to overwrite existing translations.`);
      }
      console.log();
      process.exit(0);
    }

    saveTranslationFile(absoluteDestFile, updatedTranslations);

    console.log(color('\n✅ Success!', colors.green));
    console.log(`\nCopied ${color(copiedCount, colors.bright)} translations from:`);
    console.log(color(`   ${path.relative(projectRoot, absoluteSrcFile)}`, colors.cyan));
    console.log('to:');
    console.log(color(`   ${path.relative(projectRoot, absoluteDestFile)}`, colors.cyan));

    if (skippedCount > 0) {
      console.log(`\nSkipped ${color(skippedCount, colors.yellow)} translations (already exist and not empty).`);
      console.log(`Use ${color('--force', colors.cyan)} to overwrite existing translations.`);
    }
    console.log();
  } catch (error) {
    console.error(color(`\n❌ Error: Failed to process files: ${(error as Error).message}`, colors.red));
    process.exit(1);
  }
}
