import { IpcMainEvent } from 'electron';

export interface SSLConfig {
  caCert?: string;
  insecureSSL?: boolean;
}

export interface ProgressResp {
  type: string;
  message: string;
  data?: Record<string, any>;
}

export interface ToolMetadata {
  name: string;
  version: string;
  platform: string;
  arch: string;
  downloadUrl: string;
  sha256?: string;
  installPath: string;
}

export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ToolExecuteParams {
  name: string;
  args: string[];
}

export interface ToolInstallParams {
  metadata: ToolMetadata;
}

export interface ToolManagerEvents {
  'tools:list': () => Promise<Record<string, any>>;
  'tools:install': (metadata: ToolMetadata) => Promise<void>;
  'tools:uninstall': (name: string) => Promise<void>;
  'tools:execute': (name: string, args: string[]) => Promise<string>;
  'tools:progress': (progress: ProgressResp) => void;
}
