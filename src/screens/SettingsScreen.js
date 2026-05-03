import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

// ─── Tarjetas de gestión (movidas del tab bar a configuración) ──────────────────
const MANAGEMENT_CARDS = [
  {id: 'AdminCategoriesPage', title: 'Categorias', description: 'Administrar categorias del catalogo', icon: 'folder-outline', permission: 'categories'},
  {id: 'AdminStoresPage', title: 'Tiendas', description: 'Administrar tiendas disponibles', icon: 'storefront-outline', permission: 'stores', multiStoreOnly: true},
  {id: 'AdminRolesPage', title: 'Roles', description: 'Roles y permisos del sistema', icon: 'shield-outline', permission: 'roles'},
  {id: 'AdminUsersPage', title: 'Usuarios', description: 'Gestionar usuarios del sistema', icon: 'people-outline', adminOnly: true},
];

// ─── Tarjetas de configuración (como el settings del frontend) ───────────────
const SETTINGS_CARDS = [
  {id: 'appearance', title: 'Apariencia', description: 'Nombre, colores, logo y tema visual', icon: 'color-palette-outline'},
  {id: 'storeMode', title: 'Modo de Tienda', description: 'Multi-tienda o tienda unica', icon: 'business-outline'},
  {id: 'banners', title: 'Banners de Publicidad', description: 'Banners promocionales del inicio', icon: 'images-outline'},
  {id: 'server', title: 'Servidor Backend', description: 'URL del servidor y conexion API', icon: 'server-outline'},
  {id: 'about', title: 'Acerca de', description: 'Version y datos de la aplicacion', icon: 'information-circle-outline', showToAll: true},
];

const SettingsScreen = () => {
  const navigation = useNavigation();
  const {isAdmin, canViewModule, hasRole} = useAuth();
  const {isMultiStore} = useConfig();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  // Filtrar tarjetas de gestión por permisos
  const visibleManagement = MANAGEMENT_CARDS.filter(card => {
    if (card.adminOnly && !hasRole('admin')) return false;
    if (card.multiStoreOnly && !isMultiStore) return false;
    if (card.permission === 'roles') return hasRole('admin') || canViewModule('users');
    if (card.permission) return canViewModule(card.permission) || hasRole('admin');
    return true;
  });

  // Filtrar tarjetas de configuración (admin only excepto "about")
  const visibleSettings = SETTINGS_CARDS.filter(card => card.showToAll || isAdmin);

  const handlePress = card => {
    // Si tiene id de screen directo (gestión) navega al stack screen
    if (card.id.startsWith('Admin')) {
      navigation.navigate(card.id);
    } else {
      // Configuración → navega a SettingsSection
      navigation.navigate('SettingsSection', {section: card.id});
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Configuracion</Text>
          </View>
          <View style={{width: 40}} />
        </View>

        {/* ── Gestión ─────────────────────────────────── */}
        {isAdmin && visibleManagement.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Gestion</Text>
            <View style={styles.grid}>
              {visibleManagement.map(card => (
                <TouchableOpacity
                  key={card.id}
                  style={styles.card}
                  activeOpacity={0.7}
                  onPress={() => handlePress(card)}>
                  <View style={[styles.iconContainer, {backgroundColor: primary + '15'}]}>
                    <Icon name={card.icon} size={24} color={primary} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <Text style={styles.cardDescription} numberOfLines={1}>
                      {card.description}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={theme.colors.textLight} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Configuración del sistema ─────────────────── */}
        {visibleSettings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Sistema</Text>
            <View style={styles.grid}>
              {visibleSettings.map(card => (
                <TouchableOpacity
                  key={card.id}
                  style={styles.card}
                  activeOpacity={0.7}
                  onPress={() => handlePress(card)}>
                  <View style={[styles.iconContainer, {backgroundColor: card.showToAll ? '#56AB2F15' : primary + '15'}]}>
                    <Icon name={card.icon} size={24} color={card.showToAll ? '#56AB2F' : primary} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <Text style={styles.cardDescription} numberOfLines={1}>
                      {card.description}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={theme.colors.textLight} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = primary => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  section: {
    marginTop: theme.spacing.lg,
  },
  sectionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  grid: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  bottomSpacing: {
    height: theme.spacing.xxl,
  },
});

export default SettingsScreen;
