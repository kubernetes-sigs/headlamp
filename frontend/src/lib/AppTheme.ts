/**
 * Headlamp App Theme definition
 */
export interface AppTheme {
  name: string;
  /** Base theme to extend */
  base?: 'light' | 'dark';
  /** Primary theme color */
  primary?: string;
  /** Secondary theme color */
  secondary?: string;
  text?: {
    /** Primary text color */
    primary?: string;
  };
  link?: {
    /** Link text color */
    color?: string;
  };
  background?: {
    /** Background color of the page */
    default?: string;
    /** Background color of popups and menus */
    surface?: string;
    /** Shaded background color */
    muted?: string;
  };
  sidebar?: {
    /** Background color of the sidebar */
    background?: string;
    /** Text and icon color of the sidebar */
    color?: string;
    /** Background color for the selected item */
    selectedBackground?: string;
    /** Text color for the selected item */
    selectedColor?: string;
    /** Background color of sidebar action button */
    actionBackground?: string;
  };
  navbar?: {
    /** Background color of the navbar */
    background?: string;
    /** Text and icon color of the navbar */
    color?: string;
  };
  /** General shape radius (things like buttons, popups, etc) */
  radius?: number;
  /** Text style in buttons */
  buttonTextTransform?: 'uppercase' | 'none';
}
