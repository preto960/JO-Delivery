import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

/**
 * Toast - Notificación temporal (reemplaza Alert.alert para mensajes de éxito/error)
 *
 * Uso:
 *   const [toast, setToast] = useState({visible: false, message: '', type: 'success'});
 *   setToast({visible: true, message: 'Producto creado', type: 'success'});
 */

let toastTimeout = null;

const Toast = ({visible, message, type = 'success', duration = 3000, onHide}) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const {primary} = useThemeColors();

  useEffect(() => {
    if (visible) {
      // Clear any existing timeout
      if (toastTimeout) clearTimeout(toastTimeout);

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      toastTimeout = setTimeout(() => {
        handleHide();
      }, duration);
    } else {
      slideAnim.setValue(-100);
      opacityAnim.setValue(0);
    }

    return () => {
      if (toastTimeout) clearTimeout(toastTimeout);
    };
  }, [visible, message, duration]);

  const handleHide = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onHide) onHide();
    });
  };

  if (!visible && !message) return null;

  const getIconName = () => {
    switch (type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'alert-circle';
      case 'warning':
        return 'warning';
      case 'info':
        return 'information-circle';
      default:
        return 'checkmark-circle';
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return theme.colors.success;
      case 'error':
        return primary;
      case 'warning':
        return theme.colors.warning;
      case 'info':
        return '#3498DB';
      default:
        return theme.colors.success;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{translateY: slideAnim}],
          opacity: opacityAnim,
        },
      ]}>
      <TouchableOpacity activeOpacity={1} onPress={handleHide}>
        <View style={[styles.toast, {backgroundColor: getBackgroundColor()}]}>
          <Icon name={getIconName()} size={20} color={theme.colors.white} />
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
          <TouchableOpacity onPress={handleHide} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="close" size={18} color={theme.colors.white} style={{opacity: 0.8}} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
    ...theme.shadows.md,
  },
  message: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
    color: theme.colors.white,
    lineHeight: 20,
  },
});

export default Toast;
