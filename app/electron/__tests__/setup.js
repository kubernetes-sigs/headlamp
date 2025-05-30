// Mock Electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name) => {
      if (name === 'userData') {
        return '/mock/user/data';
      }
      return '/mock/path';
    }),
    getName: jest.fn(() => 'Headlamp'),
    getVersion: jest.fn(() => '1.0.0'),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
}));

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn((command, callback) => callback(null, { stdout: '', stderr: '' })),
}));
