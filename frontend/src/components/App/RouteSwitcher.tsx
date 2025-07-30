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

import { useQuery } from '@tanstack/react-query';
import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Redirect, Route, RouteProps, Switch, useHistory } from 'react-router-dom';
import { getCluster, getSelectedClusters } from '../../lib/cluster';
import { useCluster, useClustersConf } from '../../lib/k8s';
import { testAuth } from '../../lib/k8s/apiProxy';
import {
  createRouteURL,
  getDefaultRoutes,
  getRoutePath,
  getRouteUseClusterURL,
  NotFoundRoute,
  Route as RouteType,
} from '../../lib/router';
import { useTypedSelector } from '../../redux/hooks';
import { uiSlice } from '../../redux/uiSlice';
import ErrorBoundary from '../common/ErrorBoundary';
import ErrorComponent from '../common/ErrorPage';
import { useSidebarItem } from '../Sidebar';

export default function RouteSwitcher(props: { requiresToken: () => boolean }) {
  // The NotFoundRoute always has to be evaluated in the last place.
  const routes = useTypedSelector(state => state.routes.routes);
  const routeFilters = useTypedSelector(state => state.routes.routeFilters);
  const defaultRoutes = Object.values(getDefaultRoutes()).concat(NotFoundRoute);
  const clusters = useClustersConf();
  const filteredRoutes = Object.values(routes)
    .concat(defaultRoutes)
    .filter(
      route =>
        !(
          routeFilters.length > 0 &&
          routeFilters.filter(f => f(route)).length !== routeFilters.length
        ) && !route.disabled
    );

  return (
    <Suspense fallback={null}>
      <Switch>
        {filteredRoutes.map((route, index) =>
          route.name === 'OidcAuth' ? (
            <Route
              path={route.path}
              component={() => <RouteComponent route={route} />}
              key={index}
            />
          ) : (
            <AuthRoute
              path={getRoutePath(route)}
              sidebar={route.sidebar}
              requiresAuth={!route.noAuthRequired}
              requiresCluster={getRouteUseClusterURL(route)}
              exact={!!route.exact}
              clusters={clusters}
              requiresToken={props.requiresToken}
              children={<RouteComponent route={route} key={getCluster()} />}
              key={`${getCluster()}`}
            />
          )
        )}
      </Switch>
    </Suspense>
  );
}

function RouteErrorBoundary(props: { error: Error; route: RouteType }) {
  const { error, route } = props;
  const { t } = useTranslation();
  return (
    <ErrorComponent
      title={t('Uh-oh! Something went wrong.')}
      error={error}
      message={t('translation|Error loading {{ routeName }}', { routeName: route.name })}
    />
  );
}

function RouteComponent({ route }: { route: RouteType }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  React.useEffect(() => {
    dispatch(uiSlice.actions.setHideAppBar(route.hideAppBar));
  }, [route.hideAppBar]);

  React.useEffect(() => {
    dispatch(uiSlice.actions.setIsFullWidth(route.isFullWidth));
  }, [route.isFullWidth]);

  return (
    <PageTitle
      title={t(
        route.name
          ? route.name
          : typeof route.sidebar === 'string'
          ? route.sidebar
          : route.sidebar?.item || ''
      )}
    >
      <ErrorBoundary
        fallback={(props: { error: Error }) => (
          <RouteErrorBoundary error={props.error} route={route} />
        )}
      >
        <route.component />
      </ErrorBoundary>
    </PageTitle>
  );
}

function PageTitle({
  title,
  children,
}: {
  title: string | null | undefined;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    document.title = title || '';
  }, [title]);

  return <>{children}</>;
}

interface AuthRouteProps {
  children: React.ReactNode;
  sidebar: RouteType['sidebar'];
  requiresAuth: boolean;
  requiresCluster: boolean;
  requiresToken: () => boolean;
  [otherProps: string]: any;
}

function AuthRoute(props: AuthRouteProps) {
  const { children, sidebar, requiresAuth = true, requiresCluster = true, ...other } = props;

  const redirectRoute = getCluster() ? 'login' : 'chooser';
  useSidebarItem(sidebar);
  const cluster = useCluster();
  const query = useQuery({
    queryKey: ['auth', cluster],
    queryFn: () => testAuth(cluster!),
    enabled: !!cluster && requiresAuth,
    retry: 0,
  });

  function getRenderer({ location }: RouteProps) {
    if (!requiresAuth) {
      return children;
    }

    if (requiresCluster) {
      if (getSelectedClusters().length > 1) {
        // In multi-cluster mode, we do not know if one of them requires a token.
        return children;
      }
    }

    if (query.isSuccess) {
      return children;
    }

    if (query.isError) {
      return (
        <Redirect
          to={{
            pathname: createRouteURL(redirectRoute),
            state: { from: location },
          }}
        />
      );
    }

    return null;
  }

  // If no auth is required for the view, or the token is set up, then
  // render the assigned component. Otherwise redirect to the login route.
  return <Route {...other} render={getRenderer} />;
}

const PreviousRouteContext = React.createContext<number>(0);

export function PreviousRouteProvider({ children }: React.PropsWithChildren<{}>) {
  const history = useHistory();
  const [locationInfo, setLocationInfo] = React.useState<number>(0);

  React.useEffect(() => {
    history.listen((location, action) => {
      if (action === 'PUSH') {
        setLocationInfo(levels => levels + 1);
      } else if (action === 'POP') {
        setLocationInfo(levels => levels - 1);
      }
    });
  }, []);

  return (
    <PreviousRouteContext.Provider value={locationInfo}>{children}</PreviousRouteContext.Provider>
  );
}

export function useHasPreviousRoute() {
  const routeLevels = React.useContext(PreviousRouteContext);
  return routeLevels >= 1;
}
