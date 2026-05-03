import {useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';

/**
 * Hook that returns the dynamic theme colors from the admin config.
 * Falls back to neutral gray when no config is available yet.
 *
 * - primary: The main brand color (configurable via admin settings)
 *   -> defaults to theme.colors.accent (neutral gray) when not set
 * - accent: The secondary brand color (configurable via admin settings)
 *   -> defaults to theme.colors.accentLight (neutral gray) when not set
 */
const useThemeColors = () => {
  const {config} = useConfig();

  return {
    primary: config.primary_color || theme.colors.accent,
    accent: config.accent_color || theme.colors.accentLight,
  };
};

export default useThemeColors;
