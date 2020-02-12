import { setSidebarItem } from '../redux/actions/actions';
import store from '../redux/stores/store';

export default class Registry {
  registerSidebarItem(parentName, itemName, itemLabel, url) {
    store.dispatch(setSidebarItem({
      name: itemName,
      label: itemLabel,
      url,
      parent: parentName
    }));
  }
}
