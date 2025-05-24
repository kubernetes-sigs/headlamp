import { fetchAndExecutePlugins } from './index';
import { eventAction, HeadlampEventType } from '../redux/headlampEventSlice';
import { themeSlice } from '../components/App/themeSlice';

// Mock dependencies
jest.mock('../helpers/getAppUrl', () => ({
  getAppUrl: jest.fn().mockReturnValue('http://localhost:3000/')
}));

jest.mock('../helpers/isElectron', () => ({
  isElectron: jest.fn().mockReturnValue(true)
}));

jest.mock('../redux/stores/store', () => ({
  dispatch: jest.fn()
}));

jest.mock('semver', () => ({
  satisfies: jest.fn().mockReturnValue(true),
  coerce: jest.fn().mockReturnValue('1.0.0')
}));

// Mock fetch
global.fetch = jest.fn();

describe('Plugin loading mechanism', () => {
  let mockFetch: jest.Mock;
  let mockStore: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock fetch responses
    mockFetch = global.fetch as jest.Mock;
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('plugins')) {
        return Promise.resolve({
          json: () => Promise.resolve(['plugin1', 'plugin2'])
        });
      } else if (url.includes('main.js')) {
        return Promise.resolve({
          text: () => Promise.resolve('console.log("plugin loaded");')
        });
      } else if (url.includes('package.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            name: url.includes('plugin1') ? 'plugin1' : 'plugin2',
            version: '1.0.0',
            description: 'Test plugin',
            devDependencies: {
              '@kinvolk/headlamp-plugin': '0.8.0'
            }
          })
        });
      }
      return Promise.reject(new Error('Not found'));
    });
    
    // Mock store
    mockStore = require('../redux/stores/store');
    
    // Mock window.plugins
    window.plugins = {};
    
    // Mock eval
    global.eval = jest.fn();
  });
  
  test('clears existing plugins before reloading', async () => {
    // Add a plugin to window.plugins
    window.plugins = {
      oldPlugin: { initialize: jest.fn() }
    };
    
    const onSettingsChange = jest.fn();
    const onIncompatible = jest.fn();
    
    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);
    
    // Should have cleared window.plugins before loading new ones
    expect(Object.keys(window.plugins).includes('oldPlugin')).toBeFalsy();
  });
  
  test('loads and initializes plugins correctly', async () => {
    const onSettingsChange = jest.fn();
    const onIncompatible = jest.fn();
    
    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);
    
    // Should have made the correct fetch calls
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/plugins');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/plugin1/main.js');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/plugin2/main.js');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/plugin1/package.json');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/plugin2/package.json');
    
    // Should have evaluated the plugin code
    expect(global.eval).toHaveBeenCalledTimes(2);
    
    // Should have dispatched the PLUGINS_LOADED event
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      eventAction({
        type: HeadlampEventType.PLUGINS_LOADED,
        data: expect.any(Object)
      })
    );
    
    // Should have called ensureValidThemeName
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      themeSlice.actions.ensureValidThemeName()
    );
  });
  
  test('handles plugin loading errors gracefully', async () => {
    // Make eval throw an error for the first plugin
    (global.eval as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Plugin error');
    });
    
    const onSettingsChange = jest.fn();
    const onIncompatible = jest.fn();
    
    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);
    
    // Should have dispatched the PLUGIN_LOADING_ERROR event
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      eventAction({
        type: HeadlampEventType.PLUGIN_LOADING_ERROR,
        data: expect.any(Object)
      })
    );
    
    // Should still continue loading the second plugin
    expect(global.eval).toHaveBeenCalledTimes(2);
  });
  
  test('updates settings when plugins change', async () => {
    const onSettingsChange = jest.fn();
    const onIncompatible = jest.fn();
    
    await fetchAndExecutePlugins([], onSettingsChange, onIncompatible);
    
    // Should have called onSettingsChange
    expect(onSettingsChange).toHaveBeenCalled();
  });
});