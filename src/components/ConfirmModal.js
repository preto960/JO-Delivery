import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

/**
 * ConfirmModal - Modal de confirmación personalizado (reemplaza Alert.alert nativo)
 *
 * Tipos: 'confirm' (2 botones), 'alert' (1 botón), 'danger' (confirmación destructiva)
 */
const ConfirmModal = ({
  visible,
  onClose,
  onConfirm,
  title = '',
  message = '',
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  type = 'confirm', // 'confirm' | 'alert' | 'danger'
  icon,
  loading = false,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const {primary} = useThemeColors();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  const handleConfirm = () => {
    if (!loading && onConfirm) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (!loading && onClose) {
      onClose();
    }
  };

  const getIconName = () => {
    if (icon) return icon;
    switch (type) {
      case 'danger':
        return 'warning';
      case 'alert':
        return 'information-circle';
      default:
        return 'help-circle';
    }
  };

  const getIconColor = () => {
    switch (type) {
      case 'danger':
        return primary;
      case 'alert':
        return '#3498DB';
      default:
        return primary;
    }
  };

  const getConfirmColor = () => {
    switch (type) {
      case 'danger':
        return primary;
      default:
        return primary;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleCancel}>
      <SafeAreaView style={styles.overlay} edges={[]}>
        <Animated.View style={[styles.backdrop, {opacity: fadeAnim}]}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            activeOpacity={1}
            onPress={handleCancel}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{scale: scaleAnim}],
            },
          ]}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, {backgroundColor: getIconColor() + '15'}]}>
              <Icon name={getIconName()} size={36} color={getIconColor()} />
            </View>
          </View>

          {/* Title */}
          {title ? (
            <Text style={styles.title}>{title}</Text>
          ) : null}

          {/* Message */}
          {message ? (
            <Text style={styles.message}>{message}</Text>
          ) : null}

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            {type !== 'alert' && (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={handleCancel}
                activeOpacity={0.7}
                disabled={loading}>
                <Text style={styles.cancelButtonText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                {backgroundColor: getConfirmColor()},
                loading && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={loading}>
              {loading ? (
                <Text style={styles.confirmButtonText}>
                  Procesando...
                </Text>
              ) : (
                <Text style={styles.confirmButtonText}>{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropTouchable: {
    flex: 1,
  },
  container: {
    width: '85%',
    maxWidth: 380,
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.inputBg,
  },
  cancelButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  confirmButton: {
    ...theme.shadows.sm,
  },
  confirmButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default ConfirmModal;
