const path = require('path');
const fs = require('fs');
const PluginWatcher = require('./plugin-watcher');

// Mock dependencies
jest.mock('fs');
jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn().mockImplementation(function(event, callback) {
      this.callback = callback;
      return this;
    }),
    close: jest.fn()
  })
}));

describe('PluginWatcher', () => {
  let pluginWatcher;
  let mockApp;
  let mockWindow;
  let mockWatcher;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock app
    mockApp = {
      getPath: jest.fn().mockImplementation(path => {
        if (path === 'userData') return '/user/data';
        return '';
      })
    };
    
    // Mock window
    mockWindow = {
      webContents: {
        send: jest.fn()
      },
      isDestroyed: jest.fn().mockReturnValue(false)
    };
    
    // Create plugin watcher
    pluginWatcher = new PluginWatcher(mockApp);
    pluginWatcher.setMainWindow(mockWindow);
    
    // Get mock watcher
    mockWatcher = require('chokidar').watch();
  });
  
  test('initializes with correct paths', () => {
    expect(pluginWatcher.pluginsDir).toBe(path.join('/user/data', 'plugins'));
    expect(pluginWatcher.pluginCacheDir).toBe(path.join('/user/data', '.config', 'Headlamp', 'plugins'));
  });
  
  test('starts watching plugin directory', () => {
    // Mock fs.existsSync to return false
    fs.existsSync.mockReturnValue(false);
    
    pluginWatcher.startWatching();
    
    // Should create plugins directory if it doesn't exist
    expect(fs.mkdirSync).toHaveBeenCalledWith(pluginWatcher.pluginsDir, { recursive: true });
    
    // Should set up watcher
    expect(require('chokidar').watch).toHaveBeenCalledWith(
      pluginWatcher.pluginsDir,
      expect.objectContaining({
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        depth: 3
      })
    );
    
    // Should set up event listener
    expect(mockWatcher.on).toHaveBeenCalledWith('all', expect.any(Function));
  });
  
  test('notifies renderer when plugin changes detected', () => {
    // Mock fs.existsSync to return false
    fs.existsSync.mockReturnValue(false);
    
    pluginWatcher.startWatching();
    
    // Simulate plugin change event
    mockWatcher.callback('change', '/user/data/plugins/test-plugin/main.js');
    
    // Should notify renderer
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'plugin-changed',
      {
        event: 'change',
        path: '/user/data/plugins/test-plugin/main.js'
      }
    );
  });
  
  test('clears plugin cache when changes detected', () => {
    // Mock fs.existsSync to return true for cache dir
    fs.existsSync.mockReturnValue(true);
    
    // Mock fs.readdirSync to return some files
    fs.readdirSync.mockReturnValue(['plugin1', 'plugin2']);
    
    // Mock fs.lstatSync to return directory for first file and file for second
    fs.lstatSync.mockImplementation(path => ({
      isDirectory: () => path.includes('plugin1')
    }));
    
    pluginWatcher.clearPluginCache();
    
    // Should check if cache directory exists
    expect(fs.existsSync).toHaveBeenCalledWith(pluginWatcher.pluginCacheDir);
    
    // Should read directory contents
    expect(fs.readdirSync).toHaveBeenCalledWith(pluginWatcher.pluginCacheDir);
    
    // Should remove directories recursively
    expect(fs.rmdirSync).toHaveBeenCalledWith(
      path.join(pluginWatcher.pluginCacheDir, 'plugin1'),
      { recursive: true }
    );
    
    // Should unlink files
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      path.join(pluginWatcher.pluginCacheDir, 'plugin2')
    );
  });
  
  test('stops watching when requested', () => {
    // Mock fs.existsSync to return false
    fs.existsSync.mockReturnValue(false);
    
    pluginWatcher.startWatching();
    pluginWatcher.stopWatching();
    
    // Should close watcher
    expect(mockWatcher.close).toHaveBeenCalled();
    expect(pluginWatcher.watcher).toBeNull();
  });
});