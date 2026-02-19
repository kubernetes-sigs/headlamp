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

import { getCluster } from '../cluster';
import { connectStreamWithParams } from './api/v1/streamingApi';
import type Pod from './pod';

export function formatExecStderr(stderr: string): string {
  let out = stderr.trim();
  if (!out) return out;
  // Remove K8s status-like JSON (e.g. {"metadata":{},"status":"Failure",...})
  out = out.replace(/\s*\{[\s\S]*?"status"[\s\S]*?\}\s*$/g, '').trim();
  out = out.replace(/^\s*\{[\s\S]*?"status"[\s\S]*?\}\s*/g, '').trim();
  if (!out) return 'Command failed in container';
  const brace = out.indexOf('{');
  if (brace >= 0) {
    const beforeBrace = out.slice(0, brace).trim();
    if (brace > 0 && beforeBrace.length > 0) {
      return beforeBrace;
    }
    return 'Command failed in container';
  }
  return out;
}
/** Error codes for path-related copy failures (UI can show a short translated message). */
export const PodCopyErrorCode = {
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  DEST_DIR_MUST_EXIST: 'DEST_DIR_MUST_EXIST',
} as const;

function isPathErrorStderr(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('no such file or directory') ||
    lower.includes('not a directory') ||
    lower.includes('cannot open') ||
    lower.includes('cannot stat') ||
    lower.includes('directory nonexistent')
  );
}

function makePathError(code: keyof typeof PodCopyErrorCode): Error {
  const e = new Error('');
  (e as Error & { code?: string }).code = code;
  return e;
}

/** Kubernetes exec WebSocket channel numbers */
const Channel = {
  StdIn: 0,
  StdOut: 1,
  StdErr: 2,
  ServerError: 3,
} as const;

/**
 * Split container path into parent directory and base name for tar -C parent base.
 * Uses absolute path for -C so tar works regardless of container working directory.
 */
function splitPath(containerPath: string): { parent: string; base: string } {
  const normalized = containerPath.replace(/\/+/g, '/').trim() || '.';
  const withLeading = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const withoutLeading = withLeading.replace(/^\//, '') || '.';
  const lastSlash = withoutLeading.lastIndexOf('/');
  if (lastSlash < 0) {
    return { parent: '.', base: withoutLeading };
  }
  const parent = withoutLeading.slice(0, lastSlash) || '.';
  const base = withoutLeading.slice(lastSlash + 1) || '.';
  const absParent = parent === '.' ? '.' : `/${parent}`;
  return { parent: absParent, base };
}

/**
 * Copy a file or directory from a container (like kubectl cp pod:/path ./local).
 * Requires tar in the container image.
 *
 * @param pod - Pod to copy from
 * @param container - Container name
 * @param containerPath - Path inside the container (file or directory)
 * @param suggestedName - Suggested filename for the downloaded archive
 * @returns Promise that resolves with the tar blob, or rejects with an error message
 */
export function copyFromPod(pod: Pod, container: string, containerPath: string): Promise<Blob> {
  const cluster = pod.cluster || getCluster() || '';
  const { parent, base } = splitPath(containerPath);
  // tar cf - -C parent base  (outputs tar to stdout)
  const command = ['tar', 'cf', '-', '-C', parent, base];
  const path = `/api/v1/namespaces/${pod.getNamespace()}/pods/${pod.getName()}/exec`;
  const params = new URLSearchParams({
    container,
    stdin: '0',
    stdout: '1',
    stderr: '1',
    tty: '0',
  });
  command.forEach(c => params.append('command', c));
  const pathWithQuery = `${path}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const stdoutChunks: Uint8Array[] = [];
    let stderrText = '';
    let resolved = false;

    const onFail = () => {
      if (resolved) return;
      if (stdoutChunks.length > 0) return;
      resolved = true;
      const msg = formatExecStderr(stderrText.trim()) || 'Connection closed';
      if (isPathErrorStderr(stderrText.trim())) {
        reject(makePathError('PATH_NOT_FOUND'));
      } else {
        reject(new Error(msg));
      }
    };

    connectStreamWithParams<ArrayBuffer>(
      pathWithQuery,
      (data: ArrayBuffer) => {
        if (resolved) return;
        const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        if (buf.length < 1) return;
        const channel = buf[0];
        const payload = buf.slice(1);
        if (channel === Channel.StdOut) {
          stdoutChunks.push(new Uint8Array(payload));
        } else if (channel === Channel.StdErr || channel === Channel.ServerError) {
          stderrText += new TextDecoder().decode(payload);
        }
      },
      onFail,
      {
        isJson: false,
        cluster,
        additionalProtocols: [
          'v4.channel.k8s.io',
          'v3.channel.k8s.io',
          'v2.channel.k8s.io',
          'channel.k8s.io',
        ],
      }
    )
      .then(({ socket }) => {
        if (!socket) {
          reject(new Error('Failed to open WebSocket'));
          return;
        }

        const checkClosed = () => {
          if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
            return;
          }
          if (resolved) return;
          resolved = true;
          const blob = new Blob(
            stdoutChunks.map(c => new Uint8Array(c).buffer as ArrayBuffer),
            { type: 'application/x-tar' }
          );
          const err = formatExecStderr(stderrText.trim());
          const isPathError = isPathErrorStderr(err || '');
          if (blob.size === 0 || isPathError) {
            if (isPathError) {
              reject(makePathError('PATH_NOT_FOUND'));
            } else {
              reject(new Error(err || 'Download failed: path not found or no data received.'));
            }
          } else {
            resolve(blob);
          }
        };

        socket.addEventListener('close', () => {
          setTimeout(checkClosed, 300);
        });
      })
      .catch(err => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
  });
}

/**
 * Create a minimal tar archive from browser File objects (POSIX ustar).
 * Preserves directory structure when files have webkitRelativePath (e.g. from "Choose folder").
 * Only supports regular files.
 */
function createTarFromFiles(files: File[]): Promise<ArrayBuffer> {
  const BLOCK = 512;
  const parts: ArrayBuffer[] = [];
  const PREFIX_OFFSET = 345;
  const PREFIX_LEN = 155;

  function padToBlock(n: number): number {
    return (n + BLOCK - 1) & ~(BLOCK - 1);
  }

  function writeHeader(pathInTar: string, size: number) {
    const normalized = pathInTar.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');
    const lastSlash = normalized.lastIndexOf('/');
    const name = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
    const prefix = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';

    const header = new ArrayBuffer(BLOCK);
    const arr = new Uint8Array(header);
    const enc = new TextEncoder();
    const writeStr = (s: string, start: number, len: number) => {
      const b = enc.encode(s);
      arr.set(b.length <= len ? b : b.subarray(0, len), start);
    };
    writeStr(name, 0, 100);
    writeStr('0000644', 100, 8);
    writeStr('0000000', 108, 8);
    writeStr('0000000', 116, 8);
    writeStr(size.toString(8).padStart(11, '0') + ' ', 124, 12);
    writeStr(
      Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, '0') + ' ',
      136,
      12
    );
    writeStr('        ', 148, 8);
    arr[156] = 0x30;
    writeStr('ustar', 257, 5);
    arr[263] = 0x30;
    arr[264] = 0x30;
    if (prefix.length > 0) {
      writeStr(prefix, PREFIX_OFFSET, PREFIX_LEN);
    }
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) {
      sum += arr[i];
    }
    writeStr(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    parts.push(header);
  }

  function writeContent(ab: ArrayBuffer) {
    parts.push(ab);
    const padded = padToBlock(ab.byteLength);
    if (padded > ab.byteLength) {
      parts.push(new ArrayBuffer(padded - ab.byteLength));
    }
  }

  return (async () => {
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const pathInTar =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name.replace(/^.*[/\\]/, '') ||
        file.name;
      writeHeader(pathInTar, buf.byteLength);
      writeContent(buf);
    }
    const total = parts.reduce((s, p) => s + p.byteLength, 0);
    const out = new ArrayBuffer(total);
    let at = 0;
    for (const p of parts) {
      new Uint8Array(out).set(new Uint8Array(p), at);
      at += p.byteLength;
    }
    return out;
  })();
}

/** Escape path for use inside a single-quoted sh -c string. */
function escapePathForSh(path: string): string {
  return path.replace(/'/g, "'\\''");
}

/**
 * Upload a single file by streaming raw bytes to cat > path. No tar required.
 */
function uploadSingleFileRaw(
  pod: Pod,
  container: string,
  destPath: string,
  file: File,
  cluster: string
): Promise<void> {
  const path = `/api/v1/namespaces/${pod.getNamespace()}/pods/${pod.getName()}/exec`;
  const escaped = escapePathForSh(destPath);
  const command = ['sh', '-c', `cat > '${escaped}'`];
  const params = new URLSearchParams({
    container,
    stdin: '1',
    stdout: '1',
    stderr: '1',
    tty: '0',
  });
  command.forEach(c => params.append('command', c));
  const pathWithQuery = `${path}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    let stderrText = '';
    let resolved = false;
    let weClosed = false;

    const onFail = () => {
      if (resolved) return;
      if (weClosed) return;
      resolved = true;
      const err = formatExecStderr(stderrText.trim()) || 'Connection closed';
      if (isPathErrorStderr(stderrText.trim())) {
        reject(makePathError('DEST_DIR_MUST_EXIST'));
      } else {
        reject(new Error(err));
      }
    };

    file
      .arrayBuffer()
      .then(fileBuffer => {
        connectStreamWithParams<ArrayBuffer>(
          pathWithQuery,
          (data: ArrayBuffer) => {
            if (resolved) return;
            const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            if (buf.length < 1) return;
            const channel = buf[0];
            const payload = buf.slice(1);
            if (channel === Channel.StdErr || channel === Channel.ServerError) {
              stderrText += new TextDecoder().decode(payload);
            }
          },
          onFail,
          {
            isJson: false,
            cluster,
            additionalProtocols: [
              'v4.channel.k8s.io',
              'v3.channel.k8s.io',
              'v2.channel.k8s.io',
              'channel.k8s.io',
            ],
          }
        ).then(({ socket }) => {
          if (!socket) {
            reject(new Error('Failed to open WebSocket'));
            return;
          }

          const sendChannel0 = (data: Uint8Array) => {
            const frame = new Uint8Array(1 + data.length);
            frame[0] = Channel.StdIn;
            frame.set(data, 1);
            socket.send(frame.buffer);
          };

          const doUpload = () => {
            const CHUNK = 32 * 1024;
            const arr = new Uint8Array(fileBuffer);
            for (let i = 0; i < arr.length; i += CHUNK) {
              sendChannel0(arr.subarray(i, Math.min(i + CHUNK, arr.length)));
            }
            // Delay close so server can run cat and send stderr (e.g. path not found) before we close
            setTimeout(() => {
              weClosed = true;
              socket.close();
            }, 400);
          };

          socket.addEventListener('close', () => {
            if (resolved) return;
            setTimeout(() => {
              if (resolved) return;
              resolved = true;
              const err = formatExecStderr(stderrText.trim());
              if (err) {
                if (isPathErrorStderr(stderrText.trim())) {
                  reject(makePathError('DEST_DIR_MUST_EXIST'));
                } else {
                  reject(new Error(err));
                }
              } else {
                resolve();
              }
            }, 200);
          });

          if (socket.readyState === WebSocket.OPEN) {
            doUpload();
          } else {
            socket.addEventListener('open', () => doUpload());
            socket.addEventListener('error', () => {
              if (!resolved) {
                resolved = true;
                reject(new Error('WebSocket connection failed'));
              }
            });
          }
        });
      })
      .catch(reject);
  });
}

/**
 * Copy files into a container (like kubectl cp ./local pod:/path).
 * Single file: streams raw bytes via cat (no tar). Multiple files: uses tar (requires tar in container).
 *
 * @param pod - Pod to copy to
 * @param container - Container name
 * @param containerPath - Destination path (directory; for single file, file is written as path/filename)
 * @param files - Files to upload
 */
export function copyToPod(
  pod: Pod,
  container: string,
  containerPath: string,
  files: File[]
): Promise<void> {
  const cluster = pod.cluster || getCluster() || '';
  const raw = containerPath.replace(/\/+/g, '/').trim() || '.';
  const destDir = raw.startsWith('/') ? raw : `/${raw}`;

  if (files.length === 1) {
    const fileName = files[0].name.replace(/^.*[/\\]/, '');
    const destPath = destDir.endsWith('/') ? `${destDir}${fileName}` : `${destDir}/${fileName}`;
    return uploadSingleFileRaw(pod, container, destPath, files[0], cluster);
  }

  const command = ['tar', 'xf', '-', '-C', destDir];
  const path = `/api/v1/namespaces/${pod.getNamespace()}/pods/${pod.getName()}/exec`;
  const params = new URLSearchParams({
    container,
    stdin: '1',
    stdout: '1',
    stderr: '1',
    tty: '0',
  });
  command.forEach(c => params.append('command', c));
  const pathWithQuery = `${path}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    let stderrText = '';
    let resolved = false;
    let weClosed = false;

    const onFail = () => {
      if (resolved) return;
      if (weClosed) return;
      resolved = true;
      const msg = formatExecStderr(stderrText.trim()) || 'Connection closed';
      if (isPathErrorStderr(stderrText.trim())) {
        reject(makePathError('DEST_DIR_MUST_EXIST'));
      } else {
        reject(new Error(msg));
      }
    };

    createTarFromFiles(files)
      .then(tarBuffer => {
        connectStreamWithParams<ArrayBuffer>(
          pathWithQuery,
          (data: ArrayBuffer) => {
            if (resolved) return;
            const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            if (buf.length < 1) return;
            const channel = buf[0];
            const payload = buf.slice(1);
            if (channel === Channel.StdErr || channel === Channel.ServerError) {
              stderrText += new TextDecoder().decode(payload);
            }
          },
          onFail,
          {
            isJson: false,
            cluster,
            additionalProtocols: [
              'v4.channel.k8s.io',
              'v3.channel.k8s.io',
              'v2.channel.k8s.io',
              'channel.k8s.io',
            ],
          }
        ).then(({ socket }) => {
          if (!socket) {
            reject(new Error('Failed to open WebSocket'));
            return;
          }

          const sendChannel0 = (data: Uint8Array) => {
            const frame = new Uint8Array(1 + data.length);
            frame[0] = Channel.StdIn;
            frame.set(data, 1);
            socket.send(frame.buffer);
          };

          const doUpload = () => {
            const CHUNK = 32 * 1024;
            const tar = new Uint8Array(tarBuffer);
            for (let i = 0; i < tar.length; i += CHUNK) {
              sendChannel0(tar.subarray(i, Math.min(i + CHUNK, tar.length)));
            }
            // Delay close so server can run tar and send stderr (e.g. dir not found) before we close
            setTimeout(() => {
              weClosed = true;
              socket.close();
            }, 400);
          };

          socket.addEventListener('close', () => {
            if (resolved) return;
            // Defer so any final stderr from tar/cat is processed first
            setTimeout(() => {
              if (resolved) return;
              resolved = true;
              const err = formatExecStderr(stderrText.trim());
              if (err) {
                if (isPathErrorStderr(stderrText.trim())) {
                  reject(makePathError('DEST_DIR_MUST_EXIST'));
                } else {
                  reject(new Error(err));
                }
              } else {
                resolve();
              }
            }, 200);
          });

          if (socket.readyState === WebSocket.OPEN) {
            doUpload();
          } else {
            socket.addEventListener('open', () => doUpload());
            socket.addEventListener('error', () => {
              if (!resolved) {
                resolved = true;
                reject(new Error('WebSocket connection failed'));
              }
            });
          }
        });
      })
      .catch(reject);
  });
}
