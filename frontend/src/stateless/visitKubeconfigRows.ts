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

/** Visits rows synchronously and resolves only after the transaction commits. */
export function visitKubeconfigRows<T>(
  mode: IDBTransactionMode,
  visit: (cursor: IDBCursorWithValue | null) => { value: T } | undefined
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('kubeconfigs', 1);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains('kubeconfigStore')) {
        db.createObjectStore('kubeconfigStore', { keyPath: 'id', autoIncrement: true });
      }
    };
    opening.onerror = () => {
      console.error(opening.error);
      reject(opening.error);
    };
    opening.onsuccess = () => {
      const db = opening.result;
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(['kubeconfigStore'], mode);
      } catch (error) {
        db.close();
        console.error(error);
        reject(error);
        return;
      }
      let result: { value: T } | undefined;
      let failure: unknown;
      transaction.oncomplete = () => {
        db.close();
        if (result) {
          resolve(result.value);
        } else {
          const error = new Error('Kubeconfig transaction completed without a result');
          console.error(error);
          reject(error);
        }
      };
      transaction.onabort = () => {
        db.close();
        const error = failure ?? transaction.error ?? new Error('Kubeconfig transaction aborted');
        console.error(error);
        reject(error);
      };
      const fail = (error: unknown) => {
        failure = error;
        transaction.abort();
      };
      try {
        const cursorRequest = transaction.objectStore('kubeconfigStore').openCursor();
        cursorRequest.onsuccess = () => {
          try {
            const cursor = cursorRequest.result;
            result = visit(cursor);
            if (!result && cursor) {
              cursor.continue();
            }
          } catch (error) {
            fail(error);
          }
        };
      } catch (error) {
        fail(error);
      }
    };
  });
}
