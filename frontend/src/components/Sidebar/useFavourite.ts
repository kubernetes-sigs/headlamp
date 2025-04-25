import { useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '../../redux/reducers/reducers';
import { setFavourites } from './sidebarSlice';

const FavouriteKey = 'favourite';

export interface FavouriteItem {
  name: string;
  label: string;
}

export function setInitialFavourites() {
  let favouriteMenus: FavouriteItem[] = [];
  try {
    favouriteMenus = JSON.parse(localStorage.getItem(FavouriteKey) ?? '[]');
  } catch (e) {
    favouriteMenus = [];
  }
  return {
    favourites: favouriteMenus,
  };
}

export function useFavourite() {
  const dispatch = useDispatch();
  const favouriteList = useTypedSelector(state => state.sidebar.favourites);

  const addFavourite = useCallback(
    (newFavourite: FavouriteItem) => {
      const idx = favouriteList.findIndex(favItem => favItem.name === newFavourite.name);
      if (idx !== -1) {
        // already exist, do nothing
        return;
      }
      dispatch(setFavourites([...favouriteList, newFavourite]));
    },
    [favouriteList]
  );

  const removeFavourite = useCallback(
    (favourite: FavouriteItem) => {
      const idx = favouriteList.findIndex(favItem => favItem.name === favourite.name);
      if (idx === -1) {
        // not exist, do nothing
        return;
      }
      dispatch(setFavourites([...favouriteList.slice(0, idx), ...favouriteList.slice(idx + 1)]));
    },
    [favouriteList]
  );

  const toggleFavourite = useCallback(
    (favourite: FavouriteItem) => {
      const idx = favouriteList.findIndex(favItem => favItem.name === favourite.name);
      if (idx === -1) {
        // not exist, add it
        dispatch(setFavourites([...favouriteList, favourite]));
      } else {
        // already exist, delete it
        dispatch(setFavourites([...favouriteList.slice(0, idx), ...favouriteList.slice(idx + 1)]));
      }
    },
    [favouriteList, removeFavourite, addFavourite]
  );

  useEffect(() => {
    localStorage.setItem(FavouriteKey, JSON.stringify(favouriteList));
  }, [favouriteList]);

  function checkMenuSelected(favourite: FavouriteItem) {
    const idx = favouriteList.findIndex(favItem => favItem.name === favourite.name);
    return idx !== -1;
  }

  return {
    favouriteList: favouriteList ?? [],
    addFavourite,
    removeFavourite,
    toggleFavourite,
    checkMenuSelected,
  };
}
