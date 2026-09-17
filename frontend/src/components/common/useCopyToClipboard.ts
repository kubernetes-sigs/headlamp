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

import { useEffect, useRef, useState } from 'react';

/**
 * Copy-to-clipboard behavior shared by CopyButton and menu-style call sites
 * (e.g. the mobile cluster menu in TopBar, which must render a single
 * MenuItem rather than nesting one component inside another).
 *
 * This lives in its own module, outside the components/common/Resource barrel,
 * so it is NOT part of window.pluginLib: it is an internal sharing point, not
 * a supported plugin API. Import it directly from here.
 */
export function useCopyToClipboard(
  text: string | (() => Promise<string | null | undefined>) | undefined,
  callbacks?: { onCopied?: () => void; onError?: (err: unknown) => void }
): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(resetTimeoutRef.current);
  }, []);

  async function copy() {
    clearTimeout(resetTimeoutRef.current);

    try {
      const copyText = typeof text === 'function' ? await text() : text;
      if (!copyText) {
        return;
      }
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      callbacks?.onCopied?.();
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setCopied(false);
      console.error('Failed to copy to clipboard:', err);
      callbacks?.onError?.(err);
    }
  }

  return { copied, copy };
}
