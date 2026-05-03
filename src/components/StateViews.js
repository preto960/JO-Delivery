import React, {useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

const EmptyState = ({
  icon = 'basket-outline',
  title = 'Nada por aquí',
  message = 'Parece que no hay nada que mostrar aún.',
  actionLabel,
  onAction,
  loading = false,
}) => {
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={primary} />
      ) : (
        <>
          <View style={styles.iconContainer}>
            <Icon name={icon} size={56} color={theme.colors.textLight} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {actionLabel && onAction && (
            <TouchableOpacity
              onPress={onAction}
              style={styles.actionButton}
              activeOpacity={0.8}>
              <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
};

const ErrorState = ({message = 'Ocurrió un error inesperado', onRetry}) => {
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon name="alert-circle-outline" size={56} color={primary} />
      </View>
      <Text style={styles.title}>Error</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.actionButton}
          activeOpacity={0.8}>
          <Icon name="refresh" size={18} color={theme.colors.white} />
          <Text style={[styles.actionText, {marginLeft: 8}]}>Reintentar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const LoadingState = () => {
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={primary} />
      <Text style={styles.loadingText}>Cargando...</Text>
    </View>
  );
};

const createStyles = (primary) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.background,
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  actionText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
});

export {EmptyState, ErrorState, LoadingState};
