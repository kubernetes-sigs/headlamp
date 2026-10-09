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

import FormControl, { FormControlProps } from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '../config';

const MENU_MAX_HEIGHT = 300;
// Minimum space below to keep the dropdown below the select box (approx. 1 menu item).
const MENU_MIN_HEIGHT = 56;
// Extra margin beyond MUI Popover's marginThreshold (16px) to prevent overlap.
const POPOVER_MARGIN = 20;
// Minimum width so the select box matches menu width across language lengths.
const SELECT_MIN_WIDTH = 120;

export interface MenuPlacement {
  above: boolean;
  maxHeight: number;
  isAnchorVisible: boolean;
}

/**
 * Computes dropdown placement: maxHeight, orientation, and whether the anchor
 * is in view. Capping height keeps the menu from overlapping the select box;
 * when the select box is outside the viewport, isAnchorVisible is false.
 */
export function computeMenuPlacement(
  viewportHeight: number,
  rect: { top: number; bottom: number }
): MenuPlacement {
  if (rect.top >= viewportHeight || rect.bottom <= 0) {
    return { above: false, maxHeight: 0, isAnchorVisible: false };
  }

  const cap = (space: number) => Math.max(0, Math.min(MENU_MAX_HEIGHT, space - POPOVER_MARGIN));
  const maxHeightBelow = cap(viewportHeight - rect.bottom);
  if (maxHeightBelow >= MENU_MIN_HEIGHT) {
    return { above: false, maxHeight: maxHeightBelow, isAnchorVisible: true };
  }

  // Not enough space below: open above if that side has more space.
  const maxHeightAbove = cap(rect.top);
  if (maxHeightAbove > maxHeightBelow) {
    return { above: true, maxHeight: maxHeightAbove, isAnchorVisible: true };
  }

  return { above: false, maxHeight: maxHeightBelow, isAnchorVisible: true };
}

export interface LocaleSelectProps {
  /** Whether to show the title label above the select dropdown. */
  showTitle?: boolean;
  /** Whether to display full names of languages instead of their language codes. */
  showFullNames?: boolean;
  /** Additional props to pass to the underlying Material-UI `FormControl` component. */
  formControlProps?: FormControlProps;
}

/**
 * A UI for selecting the locale with i18next
 */
export default function LocaleSelect(props: LocaleSelectProps) {
  const { formControlProps, showFullNames } = props;
  const { t, i18n } = useTranslation();
  /**
   * Returns a memoized mapping of language codes to their full names if showFullNames is true.
   *
   * @returns An object where keys are language codes and values are full names, or an empty object if showFullNames is false.
   */
  const fullNames = React.useMemo(() => {
    if (!showFullNames) {
      return {};
    }

    return getFullNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFullNames]);

  /**
   * Handles the change in language selection.
   *
   * @param event - The event triggered by selecting a new language from the dropdown.
   */
  const changeLng = (event: SelectChangeEvent<string>) => {
    const lng = event.target.value as string;

    i18n.changeLanguage(lng);
  };

  const [menuPlacement, setMenuPlacement] = React.useState<MenuPlacement>({
    above: false,
    maxHeight: MENU_MAX_HEIGHT,
    isAnchorVisible: true,
  });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuAnchorRef = React.useRef<HTMLElement | null>(null);

  const handleOpen = (event: React.SyntheticEvent) => {
    menuAnchorRef.current = event.currentTarget as HTMLElement;
    const rect = menuAnchorRef.current.getBoundingClientRect();
    const placement = computeMenuPlacement(window.innerHeight, rect);
    setMenuPlacement(placement);
    setMenuOpen(placement.isAnchorVisible);
  };

  const handleClose = () => setMenuOpen(false);

  // Update placement on resize, and dismiss if the select box leaves the viewport.
  React.useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const updatePlacement = () => {
      const anchor = menuAnchorRef.current;
      if (!anchor) {
        return;
      }
      const placement = computeMenuPlacement(window.innerHeight, anchor.getBoundingClientRect());
      if (!placement.isAnchorVisible) {
        setMenuOpen(false);
        return;
      }
      setMenuPlacement(placement);
    };
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [menuOpen]);

  /**
   * Retrieves full language names for supported languages from the i18next configuration.
   *
   * @returns An object mapping language codes to their full names.
   */
  function getFullNames() {
    if (!i18n?.options?.supportedLngs) {
      return {};
    }

    const fullNames: { [langCore: string]: string } = {};
    i18n?.options?.supportedLngs.forEach((lng: string) => {
      if (!lng) {
        return;
      }

      fullNames[lng] = supportedLanguages[lng]?.label || lng;
    });

    return fullNames;
  }

  // Select has a problem with aria-controls not being stable under test.
  const extraInputProps = import.meta.env.UNDER_TEST ? { 'aria-controls': 'under-test' } : {};

  return (
    <FormControl {...formControlProps}>
      {props.showTitle && <FormLabel component="legend">{t('Select locale')}</FormLabel>}
      <Select
        open={menuOpen}
        value={i18n.resolvedLanguage || i18n.language || 'en'}
        onChange={changeLng}
        onOpen={handleOpen}
        onClose={handleClose}
        size="small"
        variant="outlined"
        SelectDisplayProps={extraInputProps}
        inputProps={{ 'aria-label': t('Select locale'), ...extraInputProps }}
        MenuProps={{
          anchorOrigin: {
            vertical: menuPlacement.above ? 'top' : 'bottom',
            horizontal: 'left',
          },
          transformOrigin: {
            vertical: menuPlacement.above ? 'bottom' : 'top',
            horizontal: 'left',
          },
          PaperProps: {
            style: {
              maxHeight: menuPlacement.maxHeight,
              display: menuPlacement.isAnchorVisible ? undefined : 'none',
            },
          },
        }}
        sx={{ minWidth: SELECT_MIN_WIDTH }}
      >
        {(i18n?.options?.supportedLngs || [])
          .filter(lng => lng !== 'cimode')
          .map(lng => (
            <MenuItem value={lng} key={lng}>
              {showFullNames ? fullNames[lng] : lng}
            </MenuItem>
          ))}
      </Select>
    </FormControl>
  );
}
