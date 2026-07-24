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

import { configureStore } from '@reduxjs/toolkit';
import notificationsReducer, {
  defaultMaxNotificationsStored,
  loadNotifications,
  Notification,
  setNotifications,
  storeNotifications,
  updateNotifications,
} from './notificationsSlice';

describe('loadNotifications', () => {
  it('should return an empty array when localStorage.getItem returns null', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = vi.fn(() => null);
    try {
      const result = loadNotifications();
      expect(result).toEqual([]);
    } finally {
      Storage.prototype.getItem = orig;
    }
  });

  it('should return an empty array (not throw) when stored JSON is corrupt', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('notifications', '{corrupt json');
    try {
      expect(loadNotifications()).toEqual([]);
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to parse notifications from localStorage, returning empty array:',
        expect.any(SyntaxError)
      );
    } finally {
      localStorage.removeItem('notifications');
      spyWarn.mockRestore();
    }
  });

  it('should return an empty array when stored JSON is not an array', () => {
    localStorage.setItem('notifications', '{"not":"an array"}');
    try {
      expect(loadNotifications()).toEqual([]);
    } finally {
      localStorage.removeItem('notifications');
    }
  });

  it('should return an empty array when stored JSON array contains null entries', () => {
    localStorage.setItem('notifications', '[null]');
    try {
      expect(loadNotifications()).toEqual([]);
    } finally {
      localStorage.removeItem('notifications');
    }
  });

  it('should return an empty array when stored JSON array contains nested arrays', () => {
    localStorage.setItem('notifications', '[[]]');
    try {
      expect(loadNotifications()).toEqual([]);
    } finally {
      localStorage.removeItem('notifications');
    }
  });

  it('should skip entries whose message is not a string', () => {
    localStorage.setItem(
      'notifications',
      JSON.stringify([{ id: 'x', message: { length: 300 } }, { id: 'y' }])
    );
    try {
      const result = loadNotifications();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({ id: 'y' }));
    } finally {
      localStorage.removeItem('notifications');
    }
  });

  it('should return an empty array and log a warning when localStorage.getItem throws', () => {
    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spyGetItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });

    try {
      expect(loadNotifications()).toEqual([]);
      expect(spyWarn).toHaveBeenCalledWith(
        'Failed to read notifications from localStorage, returning empty array:',
        expect.any(Error)
      );
    } finally {
      spyGetItem.mockRestore();
      spyWarn.mockRestore();
    }
  });
});

describe('notifications', () => {
  it('should limit message length', () => {
    const notification = new Notification({
      message: 'm'.repeat(251),
    });

    expect(notification.message.length).toBe(250);
  });

  it('should limit the number of notifications stored to defaultMaxNotificationsStored', () => {
    const oneMoreThanMax = defaultMaxNotificationsStored + 1;
    const notifications: Notification[] = [...Array(oneMoreThanMax)].map(
      (_, i) => new Notification({ message: `notification ${i}` })
    );

    storeNotifications(notifications);

    const notificationsFromStorage = JSON.parse(localStorage.getItem('notifications') || '[]');
    expect(notificationsFromStorage.length).toBe(defaultMaxNotificationsStored);
  });

  it('should add new notifications with deprecated message, date constructor', () => {
    const dateNum = 1234;
    const newNotification = new Notification('New message', dateNum);
    expect(newNotification.message).toEqual('New message');
    expect(newNotification.date).toEqual(dateNum);
    expect(newNotification.id).toBeDefined();
  });
});
describe('notificationsSlice', () => {
  let store = configureStore({
    reducer: {
      notifications: notificationsReducer,
    },
  });

  beforeEach(() => {
    const mockLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      clear: vi.fn(),
    };
    localStorage = mockLocalStorage as any;

    store = configureStore({
      reducer: {
        notifications: notificationsReducer,
      },
    });
  });

  describe('setNotifications', () => {
    it('should overwrite current notifications', () => {
      const initialNotifications = [
        new Notification({
          message: 'Initial message',
          cluster: 'minikube',
          date: new Date(),
        }).toJSON(),
      ];
      store.dispatch(setNotifications(initialNotifications));
      const addedNotifications = [new Notification({ message: 'New message' }).toJSON()];
      store.dispatch(setNotifications(addedNotifications));

      expect(store.getState().notifications.notifications).toContainEqual(
        expect.objectContaining({ message: 'New message' })
      );
    });

    it('should handle empty notifications array', () => {
      store.dispatch(setNotifications([]));
      expect(store.getState().notifications.notifications).toEqual([]);
    });

    it('should deduplicate notifications', () => {
      const duplicateNotification = new Notification({ message: 'Duplicate message' });
      const uniqueNotification = new Notification({ message: 'Unique message' });
      store.dispatch(
        setNotifications(
          [duplicateNotification, duplicateNotification, uniqueNotification].map(n => n.toJSON())
        )
      );

      expect(store.getState().notifications.notifications).toContainEqual(
        expect.objectContaining({ message: 'Unique message' })
      );
      expect(store.getState().notifications.notifications).toContainEqual(
        expect.objectContaining({ message: 'Duplicate message' })
      );
    });
  });

  describe('updateNotifications', () => {
    it('should update existing notifications', () => {
      const initialNotification = new Notification({ message: 'Initial message' });
      store.dispatch(setNotifications([initialNotification.toJSON()]));
      initialNotification.message = 'Updated message';
      store.dispatch(updateNotifications([initialNotification.toJSON()]));

      expect(store.getState().notifications.notifications[0]).toEqual(
        expect.objectContaining({ message: 'Updated message' })
      );
    });

    it('should add new notifications', () => {
      const initialNotification = new Notification({ message: 'Initial message' });
      store.dispatch(setNotifications([initialNotification.toJSON()]));
      const newNotification = new Notification({ message: 'New message' });
      store.dispatch(updateNotifications([newNotification.toJSON()]));

      expect(store.getState().notifications.notifications).toContainEqual(
        expect.objectContaining({ message: 'Initial message' })
      );
      expect(store.getState().notifications.notifications).toContainEqual(
        expect.objectContaining({ message: 'New message' })
      );
    });
  });
});
