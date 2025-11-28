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

import { LanguageStats, NAMESPACES } from './types';
import { loadTranslationFile, countTranslations } from './translations';

export function getLanguageStats(localesDir: string, lang: string): LanguageStats {
  const stats: Partial<LanguageStats> = {};
  let totalKeys = 0;
  let totalTranslated = 0;

  for (const namespace of NAMESPACES) {
    const translations = loadTranslationFile(localesDir, lang, namespace);
    const counts = countTranslations(translations);
    stats[namespace] = counts;
    totalKeys += counts.total;
    totalTranslated += counts.translated;
  }

  stats.total = {
    total: totalKeys,
    translated: totalTranslated,
    empty: totalKeys - totalTranslated,
    percentage: totalKeys > 0 ? Math.round((totalTranslated / totalKeys) * 100) : 0,
  };

  return stats as LanguageStats;
}

export function getCompletionPercentage(translated: number, total: number): number {
  return total > 0 ? Math.round((translated / total) * 100) : 0;
}

export function getProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.max(0, Math.min(length, Math.round((percentage / 100) * length)));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export function getStatusInfo(percentage: number): { color: string; status: string; icon: string } {
  if (percentage === 100) {
    return { color: '\x1b[32m', status: '✅ Complete', icon: '✅' };
  } else if (percentage >= 90) {
    return { color: '\x1b[33m', status: '⚠️  Almost done', icon: '⚠️' };
  } else if (percentage >= 50) {
    return { color: '\x1b[33m', status: '🔨 In progress', icon: '🔨' };
  }
  return { color: '\x1b[31m', status: '❌ Needs work', icon: '❌' };
}
