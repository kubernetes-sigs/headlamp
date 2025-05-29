import { IpcMainEvent } from 'electron';

export interface ToolMetadata {
  name: string;
  version: string;
  platform: string;
  arch: string;
  downloadUrl: string;
  sha256?: string;
  installPath: string;
}

export interface ProgressResp {
  type: string;
  message: string;
  data?: Record<string, any>;
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
  'tools:list': () => Promise<IpcResponse<ToolMetadata[]>>;
  'tools:install': (event: IpcMainEvent, params: ToolInstallParams) => Promise<IpcResponse<void>>;
  'tools:uninstall': (event: IpcMainEvent, name: string) => Promise<IpcResponse<void>>;
  'tools:execute': (event: IpcMainEvent, params: ToolExecuteParams) => Promise<IpcResponse<{ stdout: string; stderr: string }>>;
}
