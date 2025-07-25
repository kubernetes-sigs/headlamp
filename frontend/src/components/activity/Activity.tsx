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

import { Icon } from '@iconify/react';
import {
  alpha,
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { clamp, throttle } from 'lodash';
import React, {
  createContext,
  ReactNode,
  RefObject,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { Trans, useTranslation } from 'react-i18next';
import { useTypedSelector } from '../../redux/hooks';
import store from '../../redux/stores/store';

const areWindowsEnabled = false;

/** Activity position relative to the main container */
type ActivityLocation = 'full' | 'split-left' | 'split-right' | 'window';

/** Independent screen or a page rendered on top of the app */
export interface Activity {
  /** Unique ID */
  id: string;
  /** Content to display inside the activity */
  content: ReactNode;
  /** Current activity location */
  location: ActivityLocation;
  /** Title to render in the taskbar and in window */
  title?: ReactNode;
  /** Hides title from the window header */
  hideTitleInHeader?: boolean;
  /** Activity icon, optional but highly recommended */
  icon?: ReactNode;
  /** Whether this activity is minimized to the taskbar */
  minimized?: boolean;
  /**
   * Temporary activity will be closed if another activity is opened
   * It will turn into permanent one if user interacts with it
   */
  temporary?: boolean;
  /** Cluster of the launched activity */
  cluster?: string;
}

export interface ActivityState {
  /** History of opened activites, list of IDs */
  history: string[];
  /** Map of all open activities, key is the ID */
  activities: Record<string, Activity>;
}

const initialState: ActivityState = {
  history: [],
  activities: {},
};

export const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    launchActivity(state, action: PayloadAction<Activity>) {
      // Add to history
      if (!action.payload.minimized) {
        state.history = state.history.filter(it => it !== action.payload.id);
        state.history.push(action.payload.id);
      }

      // Close other temporary tabs
      Object.values(state.activities).forEach(activity => {
        if (activity.temporary) {
          delete state.activities[activity.id];
          state.history = state.history.filter(it => it !== activity.id);
        }
      });

      if (!state.activities[action.payload.id]) {
        // New activity, add it to the state
        state.activities[action.payload.id] = action.payload;
      } else {
        // Existing activity, un-minimize it
        state.activities[action.payload.id].minimized = false;
      }

      // Make it fullscreen on small windows
      if (window.innerWidth < 1280) {
        state.activities[action.payload.id] = {
          ...state.activities[action.payload.id],
          location: 'full',
        };
      }

      // Dispatch resize event so the content adjusts
      // 200ms delay for animations
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 200);
    },
    close(state, action: PayloadAction<string>) {
      // Remove the activity from history
      state.history = state.history.filter(it => it !== action.payload);
      // Remove from state
      delete state.activities[action.payload];
    },
    update(state, action: PayloadAction<Partial<Activity> & { id: string }>) {
      // Bump this activity in history
      if (!action.payload.minimized) {
        state.history = state.history.filter(it => it !== action.payload.id);
        state.history.push(action.payload.id);
      }

      // Remove from history it it's minimized
      if (action.payload.minimized) {
        state.history = state.history.filter(it => it !== action.payload.id);
      }

      // Update the state
      state.activities[action.payload.id] = {
        ...state.activities[action.payload.id],
        ...action.payload,
      };

      // Dispatch resize event so the content adjusts
      // 200ms delay for animations
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 200);
    },
    reset() {
      return initialState;
    },
  },
});

export const activityReducer = activitySlice.reducer;

export const Activity = {
  /** Launches new Activity */
  launch(activity: Activity) {
    store.dispatch(activitySlice.actions.launchActivity(activity));
  },
  /** Closes activity */
  close(id: string) {
    store.dispatch(activitySlice.actions.close(id));
  },
  /** Update existing activity with a partial changes */
  update(id: string, diff: Partial<Activity>) {
    store.dispatch(activitySlice.actions.update({ ...diff, id }));
  },
  reset() {
    store.dispatch(activitySlice.actions.reset());
  },
};

/** Context for the currently viewed activity */
const ActivityContext = createContext<Activity>({} as Activity);

/** Control activity from within, requires to be used within an existing Activity */
export const useActivity = () => {
  const activity = useContext(ActivityContext);
  const update = useCallback(
    (changes: Partial<Activity>) => Activity.update(activity.id, changes),
    [activity.id]
  );

  return [activity, update] as const;
};

/** Renders a single activity */
export function SingleActivityRenderer({
  activity,
  zIndex,
  index,
  isOverview,
  onClick,
}: {
  activity: Activity;
  zIndex: number;
  /** Index of this activity within a list of all activities */
  index: number;
  /** Render in a small window for the overview state */
  isOverview: boolean;
  /** Click event callback */
  onClick: React.PointerEventHandler<HTMLDivElement>;
}) {
  const { id, minimized, location, content, title, hideTitleInHeader, icon, cluster } = activity;
  const { t } = useTranslation();
  const activityElementRef = useRef<HTMLDivElement>(null);
  const containerElementRef = useRef(document.getElementById('main'));
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  useEffect(() => {
    containerElementRef.current = document.getElementById('main');
  }, []);

  // Styles of different activity locations
  const locationStyles = {
    full: {
      borderColor: 'transparent',
      boxShadow: 'none',
      borderRadius: 0,
      position: 'absolute',
      left: 0,
      width: '100%',
      height: '100%',
    },
    'split-right': {
      position: 'absolute',
      transform: 'translateX(100%)',
      width: '50%',
      height: '100%',
      gridColumn: '2 / 4',
    },
    'split-left': {
      position: 'absolute',
      width: '50%',
      height: '100%',
      gridColumn: '2 / 4',
    },
    window: {
      position: 'absolute',
      width: '50%',
      height: '70%',
      gridColumn: '2 / 4',
      border: '1px solid',
      borderTop: '1px solid',
      borderBottom: '1px solid',
      borderRadius: '10px',
    },
  }[location ?? 'full'];

  // Reset styles when switching to window location
  useEffect(() => {
    const container = activityElementRef.current;
    if (!container) return;

    if (location !== 'window') {
      container.style.transform = '';
      container.style.width = '';
      container.style.height = '';
    }
  }, [location]);

  // Toggle overview styles
  useEffect(() => {
    const activity = activityElementRef.current;
    const container = containerElementRef.current;
    if (!activity || !container) return;

    let oldTranslation: string | undefined;
    let oldHeight: any;
    let oldWidth: any;

    if (isOverview) {
      const cols = 3;
      const rows = 5;
      const gapPx = 20;
      const box = container.getBoundingClientRect();
      const x = (box.width / cols) * (index % 3) + gapPx;
      const y = (box.height / rows) * Math.floor(index / 3) + gapPx;
      const width = box.width / cols - gapPx * (cols - 2);
      const height = box.height / rows - gapPx * (rows - 2);

      oldTranslation = activity.style.transform ?? '';
      oldHeight = activity.style.height;
      oldWidth = activity.style.width;

      activity.style.width = width + 'px';
      activity.style.height = height + 'px';
      activity.style.transform = `translate(${x}px, ${y}px)`;
    }

    return () => {
      if (oldTranslation !== undefined) {
        activity.style.transform = oldTranslation;
        activity.style.width = oldWidth;
        activity.style.height = oldHeight;
      }
    };
  }, [isOverview]);

  // Move focus inside the Activity
  useEffect(() => {
    if (!minimized && activityElementRef.current) {
      // Find first focusable element
      const focusableElements = activityElementRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      if (firstElement && 'focus' in firstElement && typeof firstElement.focus === 'function') {
        firstElement.focus();
      }
    }
  }, [minimized]);

  // Save last used location
  const lastNonFullscreenLocation = useRef<ActivityLocation>();
  useEffect(() => {
    return () => {
      if (location !== 'full') {
        lastNonFullscreenLocation.current = location;
      }
    };
  }, [location]);

  return (
    <ActivityContext.Provider value={activity}>
      <Box
        role="complementary"
        sx={{
          display: minimized && !isOverview ? 'none' : undefined,
          gridColumn: '2 / 3',
          gridRow: '1 / 2',
        }}
      >
        <Box
          ref={activityElementRef}
          onPointerDownCapture={e => {
            if (isOverview) {
              e.stopPropagation();
              e.preventDefault();
            }
            Activity.update(id, { temporary: false });
            onClick(e);
          }}
          sx={theme => ({
            display: 'flex',
            opacity: minimized && !isOverview ? 0 : 1,
            flexDirection: 'column',
            background: theme.palette.background.default,
            border: '1px solid',

            borderTop: 'none',
            borderBottom: 'none',
            willChange: 'top, left, width, height',
            zIndex: zIndex ?? 3,
            boxShadow:
              theme.palette.mode === 'light'
                ? '0px 0px 15px rgba(0,0,0,0.15)'
                : '0px 0px 15px rgba(0,0,0,0.7)',

            gridColumn: '2 / 3',
            gridRow: '1 / 2',
            ...locationStyles,

            ...(isOverview
              ? {
                  borderRadius: '20px',
                  cursor: 'pointer',
                  ':hover': {
                    boxShadow:
                      theme.palette.mode === 'light'
                        ? '0px 0px 15px rgba(0,0,0,0.25)'
                        : '0px 0px 15px rgba(0,0,0,0.17)',
                  },
                }
              : {}),

            borderColor: theme.palette.divider,

            transitionDuration: '0.25s',
            transitionProperty: 'width,height,left,top,transform',
          })}
        >
          {isOverview && (
            <Box
              sx={{
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 1,
                gap: 1,
                height: '100%',
              }}
            >
              <Box sx={{ width: '48px', height: '48px', flexShrink: 0 }}>{icon}</Box> {title}
            </Box>
          )}
          <>
            {!minimized && !isOverview && !isSmallScreen && areWindowsEnabled && (
              <ActivityDragger
                activityElementRef={activityElementRef}
                containerElementRef={containerElementRef}
                zIndex={zIndex}
                location={location}
                onLocationChange={location => {
                  Activity.update(id, { location });
                }}
              />
            )}

            <Box
              sx={{
                display: isOverview ? 'none' : 'flex',
                gap: 1,
                alignItems: 'center',
                height: '40px',
                padding: '0 16px',
                flexShrink: 0,
              }}
            >
              {!hideTitleInHeader && (
                <>
                  <Box sx={{ width: '18px', height: '18px' }}>{icon}</Box>
                  <Typography
                    color="textSecondary"
                    fontSize={14}
                    sx={{
                      maxWidth: 'calc(45% - 60px)',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                    title={typeof title === 'string' ? title : undefined}
                  >
                    {title}
                  </Typography>
                </>
              )}
              <Box sx={{ marginRight: 'auto' }} />

              {cluster && (
                <Box
                  sx={theme => ({
                    fontSize: '0.875rem',
                    paddingX: 0.5,
                    color: theme.palette.text.secondary,
                  })}
                >
                  <Icon icon="mdi:hexagon-multiple-outline" />
                  {cluster}
                </Box>
              )}
              {!isOverview && (
                <>
                  <IconButton
                    size="small"
                    title={t('Snap Left')}
                    onClick={() => Activity.update(id, { location: 'split-left' })}
                    disabled={location === 'split-left'}
                  >
                    <Icon icon="mdi:dock-left" />
                  </IconButton>
                  <IconButton
                    size="small"
                    title={t('Snap Right')}
                    onClick={() => Activity.update(id, { location: 'split-right' })}
                    disabled={location === 'split-right'}
                  >
                    <Icon icon="mdi:dock-right" />
                  </IconButton>
                  <IconButton
                    onClick={() => {
                      Activity.update(id, { minimized: true });
                    }}
                    size="small"
                    title={t('Minimize')}
                  >
                    <Icon icon="mdi:minimize" />
                  </IconButton>

                  <>
                    {location === 'full' ? (
                      <IconButton
                        size="small"
                        onClick={() => {
                          Activity.update(id, {
                            location: lastNonFullscreenLocation.current ?? 'split-right',
                          });
                        }}
                        title={t('Window')}
                      >
                        <Icon icon="mdi:dock-window" />
                      </IconButton>
                    ) : (
                      <IconButton
                        size="small"
                        onClick={() => Activity.update(id, { location: 'full' })}
                        title={t('Fullscreen')}
                      >
                        <Icon icon="mdi:fullscreen" />
                      </IconButton>
                    )}
                  </>
                  <IconButton onClick={() => Activity.close(id)} size="small" title={t('Close')}>
                    <Icon icon="mdi:close" />
                  </IconButton>
                </>
              )}
            </Box>
            <Suspense fallback={null}>
              <Box
                sx={{
                  display: isOverview ? 'none' : 'flex',
                  overflowY: 'auto',
                  scrollbarGutter: 'stable',
                  scrollbarWidth: 'thin',
                  flexGrow: 1,
                  flexDirection: 'column',
                }}
              >
                {content}
              </Box>
            </Suspense>
            {location === 'window' && <ActivityResizer activityElementRef={activityElementRef} />}
          </>
        </Box>
      </Box>
    </ActivityContext.Provider>
  );
}

const minHeight = 200;
const minWidth = 400;

/** Corner resize component */
function ActivityResizer({ activityElementRef }: { activityElementRef: RefObject<HTMLElement> }) {
  return (
    <Box
      sx={{
        width: '44px',
        height: '44px',
        position: 'absolute',
        zIndex: 1,
        bottom: '-10px',
        right: '-10px',
        padding: '0 12px 12px 0',
        cursor: 'nwse-resize',
        touchAction: 'none',
      }}
      onPointerDown={e => {
        e.preventDefault();

        const activityElement = activityElementRef.current;
        if (!activityElement) return;

        const onMoveCallback = throttle(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);

        const pointerX = e.clientX;
        const pointerY = e.clientY;

        const startWidth = activityElement.getBoundingClientRect().width;
        const startHeight = activityElement.getBoundingClientRect().height;

        // Disable transition while resizing
        const oldTransitionDuration = activityElement.style.transitionDuration;
        activityElement.style.transitionDuration = '0s';

        const handleMove = (e: PointerEvent) => {
          const dx = e.clientX - pointerX;
          const dy = e.clientY - pointerY;
          const width = Math.max(minWidth, startWidth + dx);
          const height = Math.max(minHeight, startHeight + dy);

          activityElement.style.width = width + 'px';
          activityElement.style.height = height + 'px';

          onMoveCallback();
        };

        document.addEventListener('pointermove', handleMove);

        document.addEventListener(
          'pointerup',
          () => {
            document.removeEventListener('pointermove', handleMove);
            activityElement.style.transitionDuration = oldTransitionDuration;
          },
          { once: true }
        );
      }}
    >
      <Icon
        icon="mdi:resize-bottom-right"
        width="100%"
        height="100%"
        style={{ pointerEvents: 'none', opacity: 0.6 }}
      />
    </Box>
  );
}

/** Component for dragging activity */
function ActivityDragger({
  activityElementRef,
  containerElementRef,
  location,
  onLocationChange,
  zIndex,
}: {
  location: ActivityLocation;
  activityElementRef: RefObject<HTMLElement>;
  containerElementRef: RefObject<HTMLElement>;
  onLocationChange: (location: ActivityLocation) => void;
  zIndex: number;
}) {
  const previewRef = useRef<HTMLElement>(null);

  return (
    <>
      {createPortal(
        <Box
          ref={previewRef}
          sx={theme => ({
            zIndex: zIndex - 1,
            pointerEvents: 'none',
            position: 'fixed',
            top: 0,
            left: 0,
            background: 'rgba(0,0,0,0.7)',
            border: '1px solid',
            borderColor:
              theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)',
            borderRadius: '10px',
            willChange: 'width, height, transform, opacity',
            opacity: 0,
            transition: 'all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)',
          })}
        ></Box>,
        document.body
      )}
      <Box
        sx={theme => ({
          top: '3px',
          cursor: 'grab',
          left: '50%',
          position: 'absolute',
          transform: 'translateX(-50%)',
          zIndex: 1,
          touchAction: 'none',
          background: theme.palette.background.default,
        })}
        // Toggle fullscreen on double-click
        onDoubleClick={() => onLocationChange(location === 'full' ? 'window' : 'full')}
        // Start dragging
        onPointerDown={e => {
          e.preventDefault();

          const container = containerElementRef.current;
          if (!container) return;

          const containerBox = container.getBoundingClientRect();

          const activityElement = activityElementRef.current;
          if (!activityElement) return;

          // Remember start position
          const startX = activityElement.getBoundingClientRect().left - containerBox.left;
          const startY = activityElement.getBoundingClientRect().top - containerBox.top;

          const pointerX = e.clientX;
          const pointerY = e.clientY;

          // Disable transitions during dragging
          const oldTransitionDuration = activityElement.style.transitionDuration;
          activityElement.style.transitionDuration = '0s';

          let newLocation: ActivityLocation | undefined;

          // Update position of the backdrop preview element
          const updatePreview = throttle((newPreview: any) => {
            const preview = previewRef.current;
            if (!preview) return;

            preview.style.transform = `translate(${newPreview.left}px, ${newPreview.top}px)`;
            preview.style.width = newPreview.width + 'px';
            preview.style.height = newPreview.height + 'px';
            preview.style.opacity = String(newPreview.opacity);
          }, 50);

          // Drag the activity on pointer move
          const handleMove = (e: PointerEvent) => {
            // Calculate difference from start
            const dx = e.clientX - pointerX;
            const dy = e.clientY - pointerY;

            // New window position
            const x = startX + dx;
            const y = startY + dy;

            if (e.clientX < containerBox.left + containerBox.width * 0.05) {
              // Snap to left
              newLocation = 'split-left';
              updatePreview({
                location: newLocation,
                top: containerBox.top,
                left: containerBox.left,
                width: containerBox.width / 2,
                height: containerBox.height,
                opacity: 1,
              });
            } else if (e.clientX > containerBox.left + containerBox.width * 0.95) {
              // Snap to right
              newLocation = 'split-right';
              updatePreview({
                location: newLocation,
                top: containerBox.top,
                left: containerBox.left + containerBox.width / 2,
                width: containerBox.width / 2,
                height: containerBox.height,
                opacity: 1,
              });
            } else if (e.clientY < containerBox.top + 10) {
              // Snap fullscreen
              newLocation = 'full';
              updatePreview({
                location: newLocation,
                top: containerBox.top,
                left: containerBox.left,
                width: containerBox.width,
                height: containerBox.height,
                opacity: 1,
              });
            } else {
              // In every other case turn activity into a window
              newLocation = 'window';
              const box = activityElement.getBoundingClientRect();
              updatePreview({
                location: newLocation,
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
                opacity: 0,
              });
            }

            // Apply transform to the Activity window
            activityElement.style.transform = `translate(${x}px, ${clamp(
              y,
              0,
              containerBox.height - 30
            )}px)`;
            activityElement.style.boxShadow = '0px 0px 15px rgba(0,0,0,0.15)';
            activityElement.style.borderRadius = '10px';
          };

          document.addEventListener('pointermove', handleMove);

          document.addEventListener(
            'pointerup',
            () => {
              if (newLocation) {
                // Update location after dragging is finished
                onLocationChange(newLocation);
              }

              // Reset all styles
              if (newLocation !== undefined && newLocation !== 'window') {
                activityElement.style.transform = ``;
              }
              activityElement.style.boxShadow = '';
              activityElement.style.borderRadius = '';
              activityElement.style.transitionDuration = oldTransitionDuration;
              updatePreview({ opacity: 0 });

              // Remove event listener for dragging
              document.removeEventListener('pointermove', handleMove);
            },
            { once: true }
          );
        }}
      >
        <Box
          sx={theme => ({
            pointerEvents: 'none',
            width: '80px',
            height: '10px',
            margin: '10px',
            backgroundImage: `radial-gradient(${alpha(
              theme.palette.text.primary,
              0.35
            )} 1px, transparent 0)`,
            backgroundSize: '6px 6px',
          })}
        />
      </Box>
    </>
  );
}

/** Renders all activities and the taskbar */
export const ActivitiesRenderer = React.memo(function ActivitiesRenderer() {
  const activities = Object.values(
    useTypedSelector(state => state.activity.activities)
  ) as Activity[];
  const history = useTypedSelector(state => state.activity.history) as string[];
  const lastElement = history.at(-1);
  const [isOverview, setIsOverview] = useState(false);
  useEffect(() => {
    if (activities.length === 0 && isOverview) {
      setIsOverview(false);
    }
  }, [activities, isOverview]);

  useHotkeys('Ctrl+ArrowDown', () => {
    setIsOverview(isOverview => !isOverview);
  });

  useHotkeys('Ctrl+ArrowLeft', () => {
    if (lastElement) {
      Activity.update(lastElement, { location: 'split-left' });
    }
  });

  useHotkeys('Ctrl+ArrowRight', () => {
    if (lastElement) {
      Activity.update(lastElement, { location: 'split-right' });
    }
  });

  useHotkeys('Ctrl+ArrowUp', () => {
    if (lastElement) {
      Activity.update(lastElement, { location: 'full' });
    }
  });

  return (
    <>
      <Box
        sx={{
          background: 'rgba(0,0,0,0.1)',
          backdropFilter: 'blur(5px) saturate(1.2)',
          gridColumn: '2/3',
          gridRow: '1/2',
          display: isOverview ? 'block' : 'none',
          zIndex: 1,
        }}
      />
      {activities.map((it, i) => (
        <SingleActivityRenderer
          key={it.id}
          activity={it}
          zIndex={4 + history.indexOf(it.id)}
          index={i}
          isOverview={isOverview}
          onClick={() => {
            if (isOverview) {
              setIsOverview(false);
              Activity.update(it.id, { minimized: false });
            }
          }}
        />
      ))}
      {isOverview && (
        <Box
          sx={{
            zIndex: 1,
            gridColumn: '2/3',
            gridRow: '1/2',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <Button
            size="large"
            variant="contained"
            startIcon={<Icon icon="mdi:close-box-multiple-outline" />}
            onClick={() => {
              Activity.reset();
              setIsOverview(false);
            }}
            sx={{
              margin: 5,
              lineHeight: 1,
            }}
          >
            <Trans>Close All</Trans>
          </Button>
        </Box>
      )}
      <ActivityBar setIsOverview={setIsOverview} />
    </>
  );
});

/** Taskbar with all current activities */
export const ActivityBar = React.memo(function ({
  setIsOverview,
}: {
  setIsOverview: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { t } = useTranslation();
  const activities = Object.values(
    useTypedSelector(state => state.activity.activities)
  ) as Activity[];
  const history = useTypedSelector(state => state.activity.history) as string[];
  const lastElement = history.at(-1);

  if (activities.length === 0) return null;

  return (
    <Box
      sx={theme => ({
        background: theme.palette.background.muted,
        borderTop: '1px solid',
        borderColor: theme.palette.divider,
        gridRow: '2 / 3',
        gridColumn: '2 / 3',
        paddingLeft: 1,
        zIndex: 10,
        position: 'relative',
        alignItems: 'center',
        display: 'flex',
        minHeight: '56px',
        overflowX: 'auto',
        scrollbarWidth: 'thin',
      })}
    >
      {[...activities.reverse()].map(it => (
        <Box
          key={it.id}
          sx={theme => ({
            display: 'flex',
            height: '100%',
            position: 'relative',
            border: '1px solid',
            borderTop: 0,
            borderColor: lastElement === it.id ? theme.palette.divider : 'transparent',
            background: lastElement === it.id ? theme.palette.background.default : 'transparent',
          })}
        >
          <Button
            sx={{
              padding: '0px 5px 0 10px',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              justifyContent: 'start',
            }}
            onClick={() => {
              // Minimize or show Activity, unless it's not active then bring it to front
              Activity.update(it.id, { minimized: it.id !== lastElement ? false : !it.minimized });
            }}
            onMouseDown={e => {
              if (e.button === 1) {
                Activity.close(it.id);
              }
            }}
          >
            <Box sx={{ width: '22px', height: '22px', flexShrink: 0, marginRight: 1 }}>
              {it.icon}
            </Box>
            <Box
              sx={{
                marginRight: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 0.5,
                overflow: 'hidden',
              }}
            >
              {it.cluster && <Box sx={{ opacity: 0.7 }}>{it.cluster}</Box>}{' '}
              <Box
                sx={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontStyle: it.temporary ? 'italic' : undefined,
                }}
              >
                {it.title ?? 'Something'}
              </Box>
            </Box>
          </Button>
          <IconButton
            size="small"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              Activity.close(it.id);
            }}
            sx={{ width: '42px', flexShrink: 0 }}
            aria-label="Close"
          >
            <Icon icon="mdi:close" />
          </IconButton>
        </Box>
      ))}
      <Box
        sx={theme => ({
          marginLeft: 'auto',
          flexShrink: 0,
          position: 'sticky',
          right: 0,
          background: theme.palette.background.muted,
        })}
      >
        <Tooltip title={t('Overview')}>
          <IconButton onClick={() => setIsOverview(it => !it)} aria-label={t('Overview')}>
            <Icon icon="mdi:grid-large" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
});
