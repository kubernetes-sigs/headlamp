import * as K8s from '../types/lib/k8s';
import * as ApiProxy from '../types/lib/k8s/apiProxy';
import * as Notification from '../types/lib/notification';
import * as Router from '../types/lib/router';
import * as Utils from '../types/lib/util';
import { Headlamp, Plugin } from '../types/plugin/lib';
import Registry, {
  AppLogoProps,
  ClusterChooserProps,
  DefaultSidebars,
  DetailsViewDefaultHeaderActions,
  DetailsViewSectionProps,
  registerAppBarAction,
  registerAppLogo,
  registerClusterChooser,
  registerDetailsViewHeaderAction,
  registerDetailsViewHeaderActionsProcessor,
  registerDetailsViewSection,
  registerGetTokenFunction,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '../types/plugin/registry';
import * as CommonComponents from './CommonComponents';

// We export k8s (lowercase) since someone may use it as we do in the Headlamp source code.
export {
  ApiProxy,
  K8s,
  K8s as k8s,
  CommonComponents,
  Utils,
  Router,
  Plugin,
  Registry,
  Headlamp,
  Notification,
  AppLogoProps,
  ClusterChooserProps,
  DetailsViewSectionProps,

  DetailsViewDefaultHeaderActions,


  DefaultSidebars,
  registerAppLogo,
  registerAppBarAction,
  registerClusterChooser,
  registerDetailsViewHeaderAction,
  registerDetailsViewSection,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
  registerDetailsViewHeaderActionsProcessor,
  registerGetTokenFunction,
};

