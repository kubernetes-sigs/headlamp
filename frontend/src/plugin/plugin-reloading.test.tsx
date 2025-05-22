import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import configureStore from 'redux-mock-store';
import Plugins from './Plugins';
import * as pluginIndex from './index';

// Mock the plugin index functions
jest.mock('./index', () => ({
  fetchAndExecutePlugins: jest.fn().mockResolvedValue(['test-plugin']),
  initializePlugins: jest.fn().mockResolvedValue(undefined),
}));

// Mock isElectron
jest.mock('../helpers/isElectron', () => ({
  isElectron: jest.fn().mockReturnValue(true),
}));

// Create mock store
const mockStore = configureStore([]);

describe('Plugins component', () => {
  let store: any;
  let mockDesktopApi: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock store
    store = mockStore({
      plugins: {
        pluginSettings: [
          { name: 'test-plugin', version: '1.0.0', isEnabled: true }
        ]
      }
    });
    
    // Mock window.desktopApi
    mockDesktopApi = {
      send: jest.fn(),
      receive: jest.fn(),
      removeListener: jest.fn()
    };
    window.desktopApi = mockDesktopApi;
  });
  
  afterEach(() => {
    delete window.desktopApi;
  });

  test('loads plugins on initial render', async () => {
    await act(async () => {
      render(
        <Provider store={store}>
          <SnackbarProvider>
            <MemoryRouter>
              <Plugins />
            </MemoryRouter>
          </SnackbarProvider>
        </Provider>
      );
    });
    
    expect(pluginIndex.fetchAndExecutePlugins).toHaveBeenCalledTimes(1);
    expect(mockDesktopApi.send).toHaveBeenCalledWith('pluginsLoaded');
    expect(mockDesktopApi.receive).toHaveBeenCalledWith('plugin-changed', expect.any(Function));
    expect(mockDesktopApi.send).toHaveBeenCalledWith('watch-plugins');
  });

  test('sets up plugin change listener only once', async () => {
    await act(async () => {
      const { rerender } = render(
        <Provider store={store}>
          <SnackbarProvider>
            <MemoryRouter>
              <Plugins />
            </MemoryRouter>
          </SnackbarProvider>
        </Provider>
      );
      
      // Rerender to simulate component update
      rerender(
        <Provider store={store}>
          <SnackbarProvider>
            <MemoryRouter>
              <Plugins />
            </MemoryRouter>
          </SnackbarProvider>
        </Provider>
      );
    });
    
    // Should only set up the listener once despite multiple renders
    expect(mockDesktopApi.receive).toHaveBeenCalledTimes(1);
    expect(mockDesktopApi.send).toHaveBeenCalledWith('watch-plugins');
  });

  test('reloads plugins when plugin-changed event is triggered', async () => {
    await act(async () => {
      render(
        <Provider store={store}>
          <SnackbarProvider>
            <MemoryRouter>
              <Plugins />
            </MemoryRouter>
          </SnackbarProvider>
        </Provider>
      );
    });
    
    // Get the callback function that was registered
    const pluginChangedCallback = mockDesktopApi.receive.mock.calls[0][1];
    
    // Reset the fetchAndExecutePlugins mock to track new calls
    (pluginIndex.fetchAndExecutePlugins as jest.Mock).mockClear();
    
    // Simulate plugin-changed event
    await act(async () => {
      pluginChangedCallback({ event: 'change', path: 'test/path' });
    });
    
    // Should reload plugins
    expect(pluginIndex.fetchAndExecutePlugins).toHaveBeenCalledTimes(1);
  });

  test('works on non-cluster pages like settings', async () => {
    await act(async () => {
      render(
        <Provider store={store}>
          <SnackbarProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <Route path="/settings">
                <div data-testid="settings-page">Settings Page</div>
                <Plugins />
              </Route>
            </MemoryRouter>
          </SnackbarProvider>
        </Provider>
      );
    });
    
    // Verify we're on the settings page
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    
    // Get the callback function that was registered
    const pluginChangedCallback = mockDesktopApi.receive.mock.calls[0][1];
    
    // Reset the fetchAndExecutePlugins mock to track new calls
    (pluginIndex.fetchAndExecutePlugins as jest.Mock).mockClear();
    
    // Simulate plugin-changed event on settings page
    await act(async () => {
      pluginChangedCallback({ event: 'change', path: 'test/path' });
    });
    
    // Should reload plugins even on settings page
    expect(pluginIndex.fetchAndExecutePlugins).toHaveBeenCalledTimes(1);
  });

  test('cleans up listeners on unmount', async () => {
    let unmount: () => void;
    
    await act(async () => {
      const result = render(
        <Provider store={store}>
          <SnackbarProvider>
            <MemoryRouter>
              <Plugins />
            </MemoryRouter>
          </SnackbarProvider>
        </Provider>
      );
      unmount = result.unmount;
    });
    
    // Get the callback function that was registered
    const pluginChangedCallback = mockDesktopApi.receive.mock.calls[0][1];
    
    // Unmount the component
    unmount();
    
    // Should remove the listener
    expect(mockDesktopApi.removeListener).toHaveBeenCalledWith('plugin-changed', pluginChangedCallback);
  });
});