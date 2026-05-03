import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Switch,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import ConfirmModal from '@components/ConfirmModal';
import {useAuth} from '@context/AuthContext';
import Toast from '@components/Toast';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import apiService from '@services/api';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

const AdminRolesScreen = () => {
  const navigation = useNavigation();
  const {user, logout} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const nameInputRef = useRef(null);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // ─── Data state ─────────────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Toast state ───────────────────────────────────────────────
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = useCallback((message, type = 'success') => {
    setToast({visible: true, message, type});
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({...prev, visible: false}));
  }, []);

  // ─── Confirm modal state ───────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    type: 'confirm',
    title: '',
    message: '',
    confirmText: 'Aceptar',
    onConfirm: null,
  });

  // ─── Modals state ──────────────────────────────────────────────
  const [roleDetailVisible, setRoleDetailVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [createRoleVisible, setCreateRoleVisible] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ─── Load data ─────────────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [rolesRes, permsRes] = await Promise.all([
        apiService.fetchRoles(),
        apiService.fetchPermissions(),
      ]);

      setRoles(Array.isArray(rolesRes) ? rolesRes : []);
      const perms = Array.isArray(permsRes?.permissions)
        ? permsRes.permissions
        : [];
      setAllPermissions(perms);
    } catch (err) {
      console.error('Error loading roles data:', err.message);
      showToast('No se pudieron cargar los roles', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Group permissions by module ───────────────────────────────
  const getGroupedPermissions = useCallback(() => {
    const grouped = {};
    for (const perm of allPermissions) {
      if (!grouped[perm.module]) {
        grouped[perm.module] = [];
      }
      grouped[perm.module].push(perm);
    }
    return grouped;
  }, [allPermissions]);

  const moduleLabels = {
    products: 'Productos',
    categories: 'Categorías',
    orders: 'Pedidos',
    delivery: 'Delivery',
    stores: 'Tiendas',
    users: 'Usuarios',
    dashboard: 'Dashboard',
  };

  // ─── Role Detail ───────────────────────────────────────────────
  const openRoleDetail = useCallback((role) => {
    setSelectedRole(role);
    setRoleDetailVisible(true);
  }, []);

  const closeRoleDetail = useCallback(() => {
    setRoleDetailVisible(false);
    setSelectedRole(null);
  }, []);

  const togglePermission = useCallback(
    async (permissionId) => {
      if (!selectedRole) return;

      try {
        const currentIds = selectedRole.permissions.map(
          rp => rp.permissionId,
        );
        const newIds = currentIds.includes(permissionId)
          ? currentIds.filter(id => id !== permissionId)
          : [...currentIds, permissionId];

        await apiService.updateRole(selectedRole.id, {permissionIds: newIds});

        const updated = roles.map(r =>
          r.id === selectedRole.id
            ? {
                ...r,
                permissions: r.permissions.filter(
                  rp => rp.permissionId !== permissionId,
                ),
                ...(newIds.includes(permissionId)
                  ? {
                      permissions: [
                        ...r.permissions.filter(
                          rp => rp.permissionId !== permissionId,
                        ),
                        {
                          permissionId,
                          permission: allPermissions.find(
                            p => p.id === permissionId,
                          ),
                        },
                      ],
                    }
                  : {}),
              }
            : r,
        );
        setRoles(updated);
        setSelectedRole(updated.find(r => r.id === selectedRole.id));
      } catch (err) {
        showToast(err.message || 'No se pudo actualizar el permiso', 'error');
      }
    },
    [selectedRole, roles, allPermissions, showToast],
  );

  // ─── Delete Role ───────────────────────────────────────────────
  const handleDeleteRole = useCallback(
    (role) => {
      const hasUsers = (role._count?.users || 0) > 0;

      setConfirmModal({
        visible: true,
        type: 'danger',
        title: 'Eliminar rol',
        message: `¿Estás seguro de eliminar "${role.name}"?${
          hasUsers
            ? `\n\nEste rol tiene ${role._count.users} usuario(s) asignado(s). Los usuarios perderán este rol.`
            : ''
        }`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
          try {
            await apiService.deleteRole(role.id);
            setConfirmModal(prev => ({...prev, visible: false}));
            showToast('Rol eliminado correctamente', 'success');
            loadData(true);
          } catch (err) {
            showToast(
              err.message || 'No se pudo eliminar el rol',
              'error',
            );
          }
        },
      });
    },
    [loadData, showToast],
  );

  // ─── Create Role ───────────────────────────────────────────────
  const openCreateRole = useCallback(() => {
    setNewRoleName('');
    setNewRoleDesc('');
    setCreateRoleVisible(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  const closeCreateRole = useCallback(() => {
    if (submitting) return;
    setCreateRoleVisible(false);
    setNewRoleName('');
    setNewRoleDesc('');
  }, [submitting]);

  const handleCreateRole = useCallback(async () => {
    if (!newRoleName.trim()) {
      showToast('El nombre del rol es requerido', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      await apiService.createRole({
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || null,
      });
      setCreateRoleVisible(false);
      setNewRoleName('');
      setNewRoleDesc('');
      showToast('Rol creado correctamente', 'success');
      loadData(true);
    } catch (err) {
      showToast(err.message || 'No se pudo crear el rol', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [newRoleName, newRoleDesc, loadData, showToast]);

  // ─── Render: Role card ─────────────────────────────────────────
  const renderRoleCard = useCallback(
    ({item}) => (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={() => openRoleDetail(item)}
          activeOpacity={0.7}>
          <View style={styles.cardInfo}>
            <View style={styles.roleHeader}>
              <View style={styles.roleIconWrap}>
                <Icon name="shield-outline" size={20} color={primary} />
              </View>
              <Text style={styles.roleName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            {item.description ? (
              <Text style={styles.roleDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.roleMeta}>
              <View
                style={[
                  styles.userCount,
                  (item._count?.users || 0) > 0 && styles.userCountActive,
                ]}>
                <Icon name="people" size={12} color={theme.colors.white} />
                <Text style={styles.userCountText}>
                  {item._count?.users || 0}
                </Text>
              </View>
              <Text style={styles.permCount}>
                {item.permissions?.length || 0} permiso(s)
              </Text>
            </View>
          </View>
          <Icon
            name="chevron-forward"
            size={20}
            color={theme.colors.textLight}
          />
        </TouchableOpacity>

        {/* Delete action */}
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => handleDeleteRole(item)}
          activeOpacity={0.7}>
          <Icon name="trash-outline" size={18} color={primary} />
        </TouchableOpacity>
      </View>
    ),
    [openRoleDetail, handleDeleteRole],
  );

  // ─── Render: Empty state ───────────────────────────────────────
  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Icon
          name="shield-checkmark-outline"
          size={56}
          color={theme.colors.textSecondary}
        />
        <Text style={styles.emptyTitle}>Sin roles</Text>
        <Text style={styles.emptySubtitle}>
          Pulsa el botón + para crear tu primer rol
        </Text>
      </View>
    ),
    [],
  );

  // ─── Loading screen ────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Roles y Permisos</Text>
          </View>
          <View style={styles.headerRight}>
            {!user?.roles?.some(r => r.name === 'editor') && (
              <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon name="settings-outline" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="log-out-outline" size={22} color={primary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loadingText}>Cargando roles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const groupedPermissions = getGroupedPermissions();

  // ─── Main render ───────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Roles y Permisos</Text>
        </View>
        <View style={styles.headerRight}>
          {!user?.roles?.some(r => r.name === 'editor') && (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="settings-outline" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogout} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="log-out-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Roles List */}
      <FlatList
        data={roles}
        keyExtractor={item => String(item.id)}
        renderItem={renderRoleCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[primary]}
            tintColor={primary}
          />
        }
      />

      {/* FAB — Create Role */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openCreateRole}
        activeOpacity={0.85}>
        <Icon name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ─── Role Detail Modal (full-screen, permissions toggle) ── */}
      <Modal
        visible={roleDetailVisible}
        animationType="slide"
        onRequestClose={closeRoleDetail}>
        <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeRoleDetail}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedRole?.name || 'Rol'}</Text>
            <View style={{width: 28}} />
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}>
            {selectedRole?.description ? (
              <Text style={styles.modalDesc}>{selectedRole.description}</Text>
            ) : null}

            {Object.entries(groupedPermissions).map(([module, perms]) => (
              <View key={module} style={styles.moduleSection}>
                <Text style={styles.moduleTitle}>
                  {moduleLabels[module] || module}
                </Text>
                {perms.map(perm => {
                  const isAssigned = selectedRole?.permissions?.some(
                    rp => rp.permissionId === perm.id,
                  );
                  return (
                    <View key={perm.id} style={styles.permRow}>
                      <View style={styles.permInfo}>
                        <Text style={styles.permName}>{perm.name}</Text>
                        <Text style={styles.permCode}>{perm.code}</Text>
                      </View>
                      <Switch
                        value={isAssigned}
                        onValueChange={() => togglePermission(perm.id)}
                        trackColor={{
                          false: theme.colors.border,
                          true: primary,
                        }}
                        thumbColor={theme.colors.white}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ─── Create Role Modal (full-screen) ────────────────────── */}
      <Modal
        visible={createRoleVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCreateRole}>
        <SafeAreaView style={styles.createModalSafeArea} edges={['top']}>
          <View style={styles.createModalHeader}>
            <TouchableOpacity
              onPress={closeCreateRole}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              disabled={submitting}>
              <Icon name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.createModalTitle}>Crear Rol</Text>
            <View style={{width: 28}} />
          </View>

          <ScrollView
            style={styles.createModalScroll}
            contentContainerStyle={styles.createModalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre del rol *</Text>
              <TextInput
                ref={nameInputRef}
                style={styles.textInput}
                value={newRoleName}
                onChangeText={setNewRoleName}
                placeholder="Ej: supervisor"
                placeholderTextColor={theme.colors.textLight}
                autoCapitalize="none"
                editable={!submitting}
                returnKeyType="next"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Descripción</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={newRoleDesc}
                onChangeText={setNewRoleDesc}
                placeholder="Descripción del rol..."
                placeholderTextColor={theme.colors.textLight}
                multiline
                numberOfLines={3}
                editable={!submitting}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
              onPress={handleCreateRole}
              disabled={submitting}>
              {submitting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitBtnText}>Crear Rol</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        visible={confirmModal.visible}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        onClose={() =>
          setConfirmModal(prev => ({...prev, visible: false}))
        }
        onConfirm={() => {
          if (confirmModal.onConfirm) confirmModal.onConfirm();
          else setConfirmModal(prev => ({...prev, visible: false}));
        }}
      />

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────
const createStyles = (primary) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  headerLeft: {
    width: 68,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerRight: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },

  // ── List ───────────────────────────────────────────────────────
  listContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl + 70,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  roleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.inputBg || '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  roleDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  roleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 6,
  },
  userCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.textLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  userCountActive: {
    backgroundColor: primary,
  },
  userCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.white,
  },
  permCount: {
    fontSize: theme.fontSize.xs,
    color: primary,
    fontWeight: '500',
  },
  deleteAction: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing.sm,
  },

  // ── Empty state ────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
  },
  emptySubtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    lineHeight: 22,
  },

  // ── FAB ────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },

  // ── Role Detail Modal ──────────────────────────────────────────
  modalSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    ...theme.shadows.sm,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  modalDesc: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  modalContent: {
    paddingBottom: theme.spacing.xxl,
  },
  moduleSection: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    overflow: 'hidden',
  },
  moduleTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: primary,
    textTransform: 'uppercase',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.inputBg || '#F0F2F5',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  permInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  permName: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    fontWeight: '500',
  },
  permCode: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: 2,
  },

  // ── Create Role Modal (full-screen) ────────────────────────────
  createModalSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  createModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    ...theme.shadows.sm,
  },
  createModalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  createModalScroll: {
    flex: 1,
  },
  createModalContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  formGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.inputBg || '#F0F2F5',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.white,
  },
});

export default AdminRolesScreen;
