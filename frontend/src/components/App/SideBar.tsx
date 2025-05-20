import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Drawer from '@material-ui/core/Drawer';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import Collapse from '@material-ui/core/Collapse';
import ExpandLess from '@material-ui/icons/ExpandLess';
import ExpandMore from '@material-ui/icons/ExpandMore';
import DashboardIcon from '@material-ui/icons/Dashboard';
import LayersIcon from '@material-ui/icons/Layers';
import StorageIcon from '@material-ui/icons/Storage';
import SettingsIcon from '@material-ui/icons/Settings';
import SecurityIcon from '@material-ui/icons/Security';
import ExtensionIcon from '@material-ui/icons/Extension';
import NetworkCheckIcon from '@material-ui/icons/NetworkCheck';
import { Link, useLocation } from 'react-router-dom';
import { getClusterPrefixedPath } from '../../lib/router';
import { useTypedSelector } from '../../redux/reducers/reducers';
import { getCluster } from '../../lib/util';

const useStyles = makeStyles(theme => ({
  drawer: {
    width: 240,
    flexShrink: 0,
  },
  drawerPaper: {
    width: 240,
  },
  toolbar: theme.mixins.toolbar,
  nested: {
    paddingLeft: theme.spacing(4),
  },
  active: {
    backgroundColor: theme.palette.action.selected,
  },
}));

export default function SideBar() {
  const classes = useStyles();
  const location = useLocation();
  const cluster = getCluster();
  const [open, setOpen] = React.useState({
    workloads: true,
    network: true,
    storage: true,
    config: true,
    security: true,
    gateway: true,
  });

  const handleClick = (section: keyof typeof open) => {
    setOpen({
      ...open,
      [section]: !open[section],
    });
  };

  const isActive = (path: string) => {
    return location.pathname === getClusterPrefixedPath(path);
  };

  return (
    <Drawer
      className={classes.drawer}
      variant="permanent"
      classes={{
        paper: classes.drawerPaper,
      }}
    >
      <div className={classes.toolbar} />
      <List>
        <ListItem
          button
          component={Link}
          to={getClusterPrefixedPath('/')}
          className={isActive('/') ? classes.active : ''}
        >
          <ListItemIcon>
            <DashboardIcon />
          </ListItemIcon>
          <ListItemText primary="Cluster" />
        </ListItem>

        <ListItem button onClick={() => handleClick('workloads')}>
          <ListItemIcon>
            <LayersIcon />
          </ListItemIcon>
          <ListItemText primary="Workloads" />
          {open.workloads ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open.workloads} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/workloads') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/workloads')}
            >
              <ListItemText primary="Overview" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/pods') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/pods')}
            >
              <ListItemText primary="Pods" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/deployments') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/deployments')}
            >
              <ListItemText primary="Deployments" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/daemonsets') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/daemonsets')}
            >
              <ListItemText primary="DaemonSets" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/statefulsets') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/statefulsets')}
            >
              <ListItemText primary="StatefulSets" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/jobs') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/jobs')}
            >
              <ListItemText primary="Jobs" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/cronjobs') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/cronjobs')}
            >
              <ListItemText primary="CronJobs" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/replicasets') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/replicasets')}
            >
              <ListItemText primary="ReplicaSets" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button onClick={() => handleClick('network')}>
          <ListItemIcon>
            <NetworkCheckIcon />
          </ListItemIcon>
          <ListItemText primary="Network" />
          {open.network ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open.network} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/services') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/services')}
            >
              <ListItemText primary="Services" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/ingresses') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/ingresses')}
            >
              <ListItemText primary="Ingresses" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/networkpolicies') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/networkpolicies')}
            >
              <ListItemText primary="Network Policies" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/endpoints') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/endpoints')}
            >
              <ListItemText primary="Endpoints" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button onClick={() => handleClick('gateway')}>
          <ListItemIcon>
            <NetworkCheckIcon />
          </ListItemIcon>
          <ListItemText primary="Gateway API" />
          {open.gateway ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open.gateway} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/servicemesh') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/servicemesh')}
            >
              <ListItemText primary="Service Mesh" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/gateways') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/gateways')}
            >
              <ListItemText primary="Gateways" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/httproutes') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/httproutes')}
            >
              <ListItemText primary="HTTP Routes" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button onClick={() => handleClick('storage')}>
          <ListItemIcon>
            <StorageIcon />
          </ListItemIcon>
          <ListItemText primary="Storage" />
          {open.storage ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open.storage} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/persistentvolumeclaims') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/persistentvolumeclaims')}
            >
              <ListItemText primary="Persistent Volume Claims" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/persistentvolumes') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/persistentvolumes')}
            >
              <ListItemText primary="Persistent Volumes" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/storageclasses') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/storageclasses')}
            >
              <ListItemText primary="Storage Classes" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button onClick={() => handleClick('config')}>
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText primary="Config" />
          {open.config ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open.config} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/configmaps') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/configmaps')}
            >
              <ListItemText primary="Config Maps" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/secrets') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/secrets')}
            >
              <ListItemText primary="Secrets" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/resourcequotas') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/resourcequotas')}
            >
              <ListItemText primary="Resource Quotas" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/horizontalpodautoscalers') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/horizontalpodautoscalers')}
            >
              <ListItemText primary="HPA" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/poddisruptionbudgets') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/poddisruptionbudgets')}
            >
              <ListItemText primary="PDB" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem button onClick={() => handleClick('security')}>
          <ListItemIcon>
            <SecurityIcon />
          </ListItemIcon>
          <ListItemText primary="Security" />
          {open.security ? <ExpandLess /> : <ExpandMore />}
        </ListItem>
        <Collapse in={open.security} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/serviceaccounts') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/serviceaccounts')}
            >
              <ListItemText primary="Service Accounts" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/roles') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/roles')}
            >
              <ListItemText primary="Roles" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/rolebindings') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/rolebindings')}
            >
              <ListItemText primary="Role Bindings" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/clusterroles') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/clusterroles')}
            >
              <ListItemText primary="Cluster Roles" />
            </ListItem>
            <ListItem
              button
              className={`${classes.nested} ${isActive('/clusterrolebindings') ? classes.active : ''}`}
              component={Link}
              to={getClusterPrefixedPath('/clusterrolebindings')}
            >
              <ListItemText primary="Cluster Role Bindings" />
            </ListItem>
          </List>
        </Collapse>

        <ListItem
          button
          component={Link}
          to={getClusterPrefixedPath('/customresources')}
          className={isActive('/customresources') ? classes.active : ''}
        >
          <ListItemIcon>
            <ExtensionIcon />
          </ListItemIcon>
          <ListItemText primary="Custom Resources" />
        </ListItem>
      </List>
    </Drawer>
  );
}