import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
  Switch,
  StyleSheet,
  RefreshControl,
  Platform,
  Image,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '@context/AuthContext';
import apiService from '@services/api';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';
import ConfirmModal from '@components/ConfirmModal';
import {launchImageLibrary} from 'react-native-image-picker';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_LIMIT = 20;

const INITIAL_FORM = {
  name: '',
  description: '',
  phone: '',
  address: '',
  logo: '',
  active: true,
};

const EMPTY_FORM_ERRORS = {};

// ─── Component ────────────────────────────────────────────────────────────────
const AdminStoresScreen = () => {
  const navigation = useNavigation();
  const {user, logout} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  // Data state
  const [stores, setStores] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState(EMPTY_FORM_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Confirm modal
  const [modal, setModal] = useState({visible: false, type: 'alert', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  const nameInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const logoInputRef = useRef(null);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadStores = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (pageNum === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);

        const res = await apiService.fetchAdminStores({
          page: pageNum,
          limit: PAGE_LIMIT,
        });

        const items = Array.isArray(res) ? res : res.data || [];
        const paginationData = res.pagination || null;

        if (pageNum === 1) {
          setStores(items);
        } else {
          setStores(prev => [...prev, ...items]);
        }

        setPagination(paginationData);
        setHasMore(
          paginationData
            ? pageNum < paginationData.totalPages
            : items.length >= PAGE_LIMIT,
        );
        setPage(pageNum);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadStores(1);
  }, [loadStores]);

  const handleRefresh = useCallback(() => {
    loadStores(1, true);
  }, [loadStores]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !refreshing && hasMore) {
      loadStores(page + 1);
    }
  }, [loadingMore, refreshing, hasMore, page, loadStores]);

  // ─── Form Helpers ─────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setFormErrors(EMPTY_FORM_ERRORS);
    setEditingStore(null);
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setModalVisible(true);
    setTimeout(() => nameInputRef.current?.focus(), 300);
  }, [resetForm]);

  const openEditModal = useCallback(store => {
    setEditingStore(store);
    setForm({
      name: store.name || '',
      description: store.description || '',
      phone: store.phone || '',
      address: store.address || '',
      logo: store.logo || '',
      active: store.active !== false,
    });
    setFormErrors(EMPTY_FORM_ERRORS);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    resetForm();
  }, [resetForm]);

  const updateField = useCallback((field, value) => {
    setForm(prev => ({...prev, [field]: value}));
    setFormErrors(prev => ({...prev, [field]: undefined}));
  }, []);

  // ─── Validation ───────────────────────────────────────────────────────────

  const validateForm = useCallback(() => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'El nombre es obligatorio';
    } else if (form.name.trim().length < 2) {
      errors.name = 'Mínimo 2 caracteres';
    }

    if (form.logo.trim() && !isValidUrl(form.logo.trim())) {
      errors.logo = 'URL inválida';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form]);

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        logo: form.logo.trim() || null,
        active: form.active,
      };

      if (editingStore) {
        await apiService.updateStore(editingStore.id, payload);
      } else {
        await apiService.createStore(payload);
      }

      closeModal();
      loadStores(1, true);
    } catch (err) {
      setModal({visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo guardar la tienda', confirmText: 'Aceptar', onConfirm: null});
    } finally {
      setSubmitting(false);
    }
  }, [form, editingStore, validateForm, closeModal, loadStores]);

  // ─── Logo Upload ───────────────────────────────────────────────────────

  const handleLogoPick = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });
      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
        Alert.alert('Error', 'La imagen no debe superar 2MB');
        return;
      }
      setLogoUploading(true);
      try {
        const api = await apiService.createApiClient();
        const formData = new FormData();
        const fileUri = asset.uri;
        const filename = asset.fileName || fileUri.split('/').pop() || 'logo.png';
        formData.append('file', {
          uri: fileUri,
          name: filename,
          type: asset.type || 'image/jpeg',
        });
        const res = await api.post('/stores/upload-logo', formData, {
          headers: {'Content-Type': 'multipart/form-data'},
          transformRequest: data => data,
        });
        const url = res?.url || res?.data?.url;
        if (url) {
          updateField('logo', url);
        }
      } catch {
        Alert.alert('Error', 'No se pudo subir el logo.');
      } finally {
        setLogoUploading(false);
      }
    } catch {
      // Picker error
    }
  }, [updateField]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    store => {
      setModal({
        visible: true,
        type: 'danger',
        title: 'Eliminar tienda',
        message: `¿Estás seguro de que deseas eliminar "${store.name}"? Esta acción no se puede deshacer si tiene productos asociados.`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
          try {
            await apiService.deleteStore(store.id);
            setStores(prev => prev.filter(s => s.id !== store.id));
          } catch (err) {
            setModal({visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo eliminar la tienda', confirmText: 'Aceptar', onConfirm: null});
          }
        },
      });
    },
    [],
  );

  // ─── Toggle Active ────────────────────────────────────────────────────────

  const handleToggleActive = useCallback(
    store => {
      const newStatus = !store.active;
      const label = newStatus ? 'activar' : 'desactivar';

      setModal({
        visible: true,
        type: 'confirm',
        title: `${newStatus ? 'Activar' : 'Desactivar'} tienda`,
        message: `¿Deseas ${label} "${store.name}"?`,
        confirmText: newStatus ? 'Activar' : 'Desactivar',
        onConfirm: async () => {
          try {
            await apiService.updateStore(store.id, {active: newStatus});
            setStores(prev =>
              prev.map(s =>
                s.id === store.id ? {...s, active: newStatus} : s,
              ),
            );
          } catch (err) {
            setModal({visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo actualizar la tienda', confirmText: 'Aceptar', onConfirm: null});
          }
        },
      });
    },
    [],
  );

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const renderEmpty = useCallback(() => {
    if (loading) return null;

    if (error && stores.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="alert-circle-outline" size={56} color={primary} />
          <Text style={styles.emptyTitle}>Error al cargar</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadStores(1)}
            activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="storefront-outline" size={56} color={theme.colors.textLight} />
        <Text style={styles.emptyTitle}>Sin tiendas</Text>
        <Text style={styles.emptyText}>
          Crea tu primera tienda tocando el botón +
        </Text>
      </View>
    );
  }, [loading, error, stores.length, loadStores]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={primary} />
        <Text style={styles.footerText}>Cargando más...</Text>
      </View>
    );
  }, [loadingMore]);

  const renderStoreCard = useCallback(
    ({item}) => {
      const isActive = item.active !== false;
      const initial = (item.name || 'T').charAt(0).toUpperCase();

      return (
        <View style={styles.card}>
          {/* Avatar */}
          <View style={[styles.cardAvatar, !isActive && styles.cardAvatarInactive]}>
            {item.logo ? (
              <Image source={{uri: item.logo}} style={{width: '100%', height: '100%'}} resizeMode="cover" />
            ) : (
              <Text style={[styles.cardAvatarText, !isActive && styles.cardAvatarTextInactive]}>
                {initial}
              </Text>
            )}
          </View>

          {/* Store info */}
          <TouchableOpacity
            style={styles.cardBody}
            onPress={() => openEditModal(item)}
            activeOpacity={0.7}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.cardSubInfo}>
              {item.owner && (
                <Text style={styles.cardOwner} numberOfLines={1}>
                  {item.owner.name}
                </Text>
              )}
              {item._count?.products !== undefined && (
                <Text style={styles.cardProducts}>
                  {item._count.products} prod.
                </Text>
              )}
            </View>
            <Text style={styles.cardAddress} numberOfLines={1}>
              {item.address || 'Sin dirección'}
            </Text>
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => handleToggleActive(item)}
              hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}
              style={styles.toggleBtn}>
              <Icon
                name={isActive ? 'toggle' : 'toggle-outline'}
                size={28}
                color={isActive ? theme.colors.success : theme.colors.border}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => openEditModal(item)}
              activeOpacity={0.7}>
              <Icon name="create-outline" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={() => handleDelete(item)}
              activeOpacity={0.7}>
              <Icon name="trash-outline" size={20} color={primary} />
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [handleToggleActive, openEditModal, handleDelete],
  );

  // ─── Render Form Modal ────────────────────────────────────────────────────

  const renderFormModal = useCallback(() => {
    const isEditing = !!editingStore;

    return (
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}>
        <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeModal}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Editar Tienda' : 'Nueva Tienda'}
            </Text>
            <View style={{width: 28}} />
          </View>

          {/* Modal body */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets>

            {/* Name */}
            <Text style={styles.label}>
              Nombre <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              ref={nameInputRef}
              style={[styles.input, formErrors.name && styles.inputError]}
              value={form.name}
              onChangeText={val => updateField('name', val)}
              placeholder="Nombre de la tienda"
              placeholderTextColor={theme.colors.textLight}
              returnKeyType="next"
              onSubmitEditing={() => descriptionInputRef.current?.focus()}
              maxLength={200}
            />
            {formErrors.name && (
              <Text style={styles.errorText}>{formErrors.name}</Text>
            )}

            {/* Description */}
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              ref={descriptionInputRef}
              style={[styles.input, styles.inputMultiline]}
              value={form.description}
              onChangeText={val => updateField('description', val)}
              placeholder="Descripción de la tienda"
              placeholderTextColor={theme.colors.textLight}
              returnKeyType="next"
              onSubmitEditing={() => phoneInputRef.current?.focus()}
              maxLength={500}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Phone & Address row */}
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  ref={phoneInputRef}
                  style={styles.input}
                  value={form.phone}
                  onChangeText={val => updateField('phone', val)}
                  placeholder="+52 55 1234"
                  placeholderTextColor={theme.colors.textLight}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => addressInputRef.current?.focus()}
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Dirección</Text>
                <TextInput
                  ref={addressInputRef}
                  style={styles.input}
                  value={form.address}
                  onChangeText={val => updateField('address', val)}
                  placeholder="Dirección"
                  placeholderTextColor={theme.colors.textLight}
                  returnKeyType="next"
                  onSubmitEditing={() => logoInputRef.current?.focus()}
                />
              </View>
            </View>

            {/* Logo upload */}
            <Text style={styles.label}>Logo de la tienda</Text>
            <View style={styles.logoRow}>
              <TouchableOpacity
                onPress={handleLogoPick}
                disabled={logoUploading}
                activeOpacity={0.8}
                style={styles.logoPreview}>
                {logoUploading ? (
                  <ActivityIndicator size="small" color={primary} />
                ) : form.logo ? (
                  <Image source={{uri: form.logo}} style={styles.logoPreviewImg} resizeMode="cover" />
                ) : (
                  <Icon name="camera-outline" size={24} color={theme.colors.textLight} />
                )}
              </TouchableOpacity>
              <View style={styles.logoActions}>
                <TouchableOpacity onPress={handleLogoPick} disabled={logoUploading} activeOpacity={0.7} style={styles.logoBtn}>
                  <Icon name="cloud-upload-outline" size={16} color={primary} />
                  <Text style={styles.logoBtnText}>{form.logo ? 'Cambiar logo' : 'Subir logo'}</Text>
                </TouchableOpacity>
                {form.logo ? (
                  <TouchableOpacity onPress={() => updateField('logo', '')} activeOpacity={0.7} style={[styles.logoBtn, {borderColor: '#EF4444'}]}>
                    <Icon name="trash-outline" size={16} color="#EF4444" />
                    <Text style={[styles.logoBtnText, {color: '#EF4444'}]}>Eliminar</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={styles.logoHint}>Max 2MB. JPG, PNG, WebP</Text>

            {/* Active toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Tienda activa</Text>
                <Text style={styles.toggleDescription}>
                  Las tiendas inactivas no se muestran en la app
                </Text>
              </View>
              <Switch
                value={form.active}
                onValueChange={val => updateField('active', val)}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.success,
                }}
                thumbColor={theme.colors.white}
              />
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}>
              {submitting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isEditing ? 'Guardar Cambios' : 'Crear Tienda'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }, [
    modalVisible,
    editingStore,
    form,
    formErrors,
    submitting,
    logoUploading,
    closeModal,
    updateField,
    handleSubmit,
    handleLogoPick,
  ]);

  // ─── Main Render ──────────────────────────────────────────────────────────

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Tiendas</Text>
            <Text style={styles.headerSubtitle}>
              Gestionar tiendas
            </Text>
          </View>
        </View>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loaderText}>Cargando tiendas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogout = () => {
    setModal({
      visible: true,
      type: 'danger',
      title: 'Cerrar sesión',
      message: `¿Cerrar sesión de ${user?.name || 'la cuenta'}?`,
      confirmText: 'Cerrar sesión',
      onConfirm: () => logout(),
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Tiendas</Text>
          <Text style={styles.headerSubtitle}>
            {stores.length} tienda{stores.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {!user?.roles?.some(r => r.name === 'editor') && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
              <Icon name="settings-outline" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleLogout}
            hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
            <Icon name="log-out-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Store list */}
      <FlatList
        data={stores}
        keyExtractor={item => String(item.id)}
        renderItem={renderStoreCard}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={
          stores.length === 0 ? styles.emptyList : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[primary]}
            tintColor={primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openCreateModal}
        activeOpacity={0.85}
        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
        <Icon name="add" size={28} color={theme.colors.white} />
      </TouchableOpacity>

      {/* Form modal */}
      {renderFormModal()}

      <ConfirmModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText}
        onClose={() => setModal(prev => ({...prev, visible: false}))}
        onConfirm={() => {
          if (modal.onConfirm) modal.onConfirm();
          else setModal(prev => ({...prev, visible: false}));
        }}
      />
    </SafeAreaView>
  );
};

// ─── Simple URL validator ─────────────────────────────────────────────────────
function isValidUrl(string) {
  if (!string || typeof string !== 'string') return false;
  const pattern = /^https?:\/\/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/;
  return pattern.test(string.trim());
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const createStyles = (primary) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Header
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
  headerSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  headerRight: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },

  // Loading
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  loaderText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },

  // List
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 100,
    paddingTop: theme.spacing.sm,
  },
  emptyList: {
    flexGrow: 1,
    backgroundColor: theme.colors.background,
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  footerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },

  // Empty states
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  retryButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },

  // Store card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardAvatarInactive: {
    opacity: 0.5,
  },
  cardAvatarText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: primary,
  },
  cardAvatarTextInactive: {
    color: theme.colors.textLight,
  },
  cardBody: {
    flex: 1,
    marginLeft: theme.spacing.md,
    justifyContent: 'center',
  },
  cardName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  cardSubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  cardOwner: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  cardProducts: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  cardAddress: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  toggleBtn: {
    padding: theme.spacing.xs,
  },
  iconActionBtn: {
    padding: theme.spacing.xs,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    elevation: 6,
  },

  // Modal
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
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },

  // Form
  label: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  required: {
    color: primary,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: primary,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: primary,
    marginTop: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
  },
  toggleInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  toggleLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  toggleDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  // Logo upload
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  logoPreview: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPreviewImg: {
    width: '100%',
    height: '100%',
  },
  logoActions: {
    flex: 1,
    gap: 8,
  },
  logoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  logoBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: primary,
  },
  logoHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginBottom: 16,
  },
});

export default AdminStoresScreen;
