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
  StyleSheet,
  RefreshControl,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '@context/AuthContext';
import apiService from '@services/api';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';
import ConfirmModal from '@components/ConfirmModal';

const AdminCategoriesScreen = () => {
  const navigation = useNavigation();
  const {user, logout} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const nameInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formName, setFormName] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({visible: false, type: 'alert', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});

  const loadCategories = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await apiService.fetchCategories();
      setCategories(data);
    } catch (err) {
      console.error('Error loading categories:', err.message);
      setError('No se pudieron cargar las categorías. Intenta de nuevo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, []);

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

  // ── Validation ──────────────────────────────────────────────
  const validateForm = () => {
    const errors = {};
    const trimmedName = formName.trim();
    const trimmedImage = formImage.trim();

    if (!trimmedName) {
      errors.name = 'El nombre es obligatorio';
    } else if (trimmedName.length < 2) {
      errors.name = 'El nombre debe tener al menos 2 caracteres';
    } else if (trimmedName.length > 60) {
      errors.name = 'El nombre no puede exceder 60 caracteres';
    }

    if (trimmedImage && !/^https?:\/\/.+/.test(trimmedImage)) {
      errors.image = 'Ingresa una URL válida (http:// o https://)';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Open / Close modal ──────────────────────────────────────
  const openCreateModal = () => {
    setIsEditing(false);
    setEditingCategory(null);
    setFormName('');
    setFormImage('');
    setFormErrors({});
    setModalVisible(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const openEditModal = (category) => {
    setIsEditing(true);
    setEditingCategory(category);
    setFormName(category.name || '');
    setFormImage(category.image || '');
    setFormErrors({});
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setFormName('');
    setFormImage('');
    setFormErrors({});
    setEditingCategory(null);
    setIsEditing(false);
  };

  // ── Submit (create / update) ────────────────────────────────
  const handleSubmit = async () => {
    if (!validateForm()) return;

    const payload = {
      name: formName.trim(),
      image: formImage.trim() || null,
    };

    try {
      setSubmitting(true);

      if (isEditing && editingCategory) {
        await apiService.updateCategory(editingCategory.id, payload);
        // Update local state immediately for image removal
        setCategories(prev => prev.map(c =>
          c.id === editingCategory.id
            ? {...c, name: payload.name, image: payload.image}
            : c
        ));
      } else {
        await apiService.createCategory(payload);
      }

      closeModal();
      loadCategories(true);
    } catch (err) {
      console.error('Error saving category:', err.message);
      setModal({
        visible: true,
        type: 'alert',
        title: 'Error',
        message: err.message || 'No se pudo guardar la categoría. Intenta de nuevo.',
        confirmText: 'Aceptar',
        onConfirm: null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = (category) => {
    setModal({
      visible: true,
      type: 'danger',
      title: 'Eliminar categoría',
      message: `¿Estás seguro de eliminar "${category.name}"?${
        category._count?.products
          ? `\n\nEsta categoría tiene ${category._count.products} producto(s) asociado(s).`
          : ''
      }`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await apiService.deleteCategory(category.id);
          setModal(prev => ({...prev, visible: false}));
          loadCategories(true);
        } catch (err) {
          console.error('Error deleting category:', err.message);
          setModal({
            visible: true,
            type: 'alert',
            title: 'Error',
            message: err.message || 'No se pudo eliminar la categoría.',
            confirmText: 'Aceptar',
            onConfirm: null,
          });
        }
      },
    });
  };

  // ── Render helpers ──────────────────────────────────────────
  const renderCategoryCard = ({item}) => (
    <View style={styles.card}>
      {/* Image thumbnail or placeholder */}
      <View style={styles.imageContainer}>
        {item.image ? (
          <Image
            source={{uri: item.image}}
            style={styles.categoryImage}
            resizeMode="cover"
            onError={() => {}}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Icon name="folder-outline" size={28} color={theme.colors.textSecondary} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cardSlug} numberOfLines={1}>
          {item.slug || '—'}
        </Text>
        <View style={styles.productCountBadge}>
          <Icon name="pricetag-outline" size={12} color={theme.colors.textSecondary} />
          <Text style={styles.productCountText}>
            {item._count?.products || 0} producto{(item._count?.products || 0) !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => openEditModal(item)}
          activeOpacity={0.7}>
          <Icon name="create-outline" size={20} color="#3498DB" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDelete(item)}
          activeOpacity={0.7}>
          <Icon name="trash-outline" size={20} color={primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="folder-open-outline" size={56} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>Sin categorías</Text>
      <Text style={styles.emptySubtitle}>
        Pulsa el botón + para agregar tu primera categoría
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.emptyContainer}>
      <Icon name="alert-circle-outline" size={56} color={primary} />
      <Text style={styles.emptyTitle}>Error de conexión</Text>
      <Text style={styles.emptySubtitle}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => loadCategories()} activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Form label helper ───────────────────────────────────────
  const renderFieldLabel = (label, fieldName) => (
    <Text style={styles.fieldLabel}>
      {label}
      {formErrors[fieldName] && (
        <Text style={styles.fieldError}> {formErrors[fieldName]}</Text>
      )}
    </Text>
  );

  // ── Main render ─────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Categorías</Text>
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loadingText}>Cargando categorías...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Categorías</Text>
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

      {/* List */}
      {error && !categories.length ? (
        renderError()
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderCategoryCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={!error ? renderEmpty : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadCategories(true)}
              colors={[primary]}
              tintColor={primary}
            />
          }
        />
      )}

      {/* Floating Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openCreateModal}
        activeOpacity={0.85}>
        <Icon name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{isEditing ? 'Editar' : 'Nueva categoría'}</Text>
            <View style={{width: 28}} />
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
            {/* Name field */}
            <View style={styles.fieldGroup}>
              {renderFieldLabel('Nombre', 'name')}
              <TextInput
                ref={nameInputRef}
                style={[styles.textInput, formErrors.name && styles.inputError]}
                value={formName}
                onChangeText={(text) => {
                  setFormName(text);
                  if (formErrors.name) setFormErrors((prev) => ({...prev, name: undefined}));
                }}
                placeholder="Ej. Electrónica"
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={60}
                editable={!submitting}
                returnKeyType="next"
                onSubmitEditing={() => imageInputRef.current?.focus()}
              />
            </View>

            {/* Image URL field */}
            <View style={styles.fieldGroup}>
              {renderFieldLabel('URL de imagen (opcional)', 'image')}
              <TextInput
                ref={imageInputRef}
                style={[styles.textInput, formErrors.image && styles.inputError]}
                value={formImage}
                onChangeText={(text) => {
                  setFormImage(text);
                  if (formErrors.image) setFormErrors((prev) => ({...prev, image: undefined}));
                }}
                placeholder="https://ejemplo.com/imagen.jpg"
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!submitting}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {/* Submit button */}
            <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
              {submitting ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Text style={styles.submitButtonText}>{isEditing ? 'Guardar cambios' : 'Crear'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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

// ── Styles ────────────────────────────────────────────────────
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
  headerLeft: { width: 68 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerRight: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },

  // List
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
  imageContainer: {
    marginRight: theme.spacing.md,
  },
  imagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryImage: {
    width: 50,
    height: 50,
    borderRadius: theme.borderRadius.md,
  },
  cardInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  cardName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  cardSlug: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  productCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  productCountText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginLeft: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty / Error states
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
  retryBtn: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
  },
  retryBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // FAB
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

  // Modal (full-screen)
  modalSafeArea: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
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
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  submitButton: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: theme.spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Form fields
  fieldGroup: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  fieldError: {
    color: primary,
    fontWeight: '400',
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
  inputError: {
    borderColor: primary,
  },
});

export default AdminCategoriesScreen;
