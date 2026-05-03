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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '@context/AuthContext';
import apiService from '@services/api';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';
import ConfirmModal from '@components/ConfirmModal';

const AdminBatchesScreen = () => {
  const navigation = useNavigation();
  const {user, logout, hasPermission} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const nameInputRef = useRef(null);
  const discountInputRef = useRef(null);

  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDiscount, setFormDiscount] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);

  // Confirm modal
  const [modal, setModal] = useState({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
    confirmText: 'Aceptar',
    onConfirm: null,
  });

  const loadBatches = useCallback(
    async isRefresh => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const data = await apiService.fetchBatches({page: 1, limit: 100});
        setBatches(Array.isArray(data) ? data : data?.data || []);
      } catch (err) {
        console.error('Error loading batches:', err.message);
        setError('No se pudieron cargar los lotes. Intenta de nuevo.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const loadProducts = useCallback(async () => {
    try {
      const data = await apiService.fetchProducts({page: 1, limit: 500});
      setProducts(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      console.error('Error loading products:', err.message);
    }
  }, []);

  useEffect(() => {
    loadBatches();
    loadProducts();
  }, []);

  const handleLogout = () => {
    setModal({
      visible: true,
      type: 'danger',
      title: 'Cerrar sesion',
      message: `Cerrar sesion de ${user?.name || 'la cuenta'}?`,
      confirmText: 'Cerrar sesion',
      onConfirm: () => logout(),
    });
  };

  // ── Validation ──────────────────────────────────────
  const validateForm = () => {
    const errors = {};
    const trimmedName = formName.trim();

    if (!trimmedName) {
      errors.name = 'El nombre es obligatorio';
    } else if (trimmedName.length < 2) {
      errors.name = 'Minimo 2 caracteres';
    }

    const discount = parseFloat(formDiscount);
    if (formDiscount && (isNaN(discount) || discount < 0 || discount > 100)) {
      errors.discount = 'Descuento debe ser entre 0 y 100';
    }

    if (selectedProductIds.length === 0) {
      errors.products = 'Selecciona al menos un producto';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Open / Close modal ──────────────────────────────
  const openCreateModal = () => {
    setIsEditing(false);
    setEditingBatch(null);
    setFormName('');
    setFormDescription('');
    setFormDiscount('');
    setSelectedProductIds([]);
    setProductSearch('');
    setFormErrors({});
    setModalVisible(true);
    setTimeout(() => nameInputRef.current?.focus(), 100);
  };

  const openEditModal = batch => {
    setIsEditing(true);
    setEditingBatch(batch);
    setFormName(batch.name || '');
    setFormDescription(batch.description || '');
    setFormDiscount(String(batch.discountPercent || batch.discount_percent || ''));
    const currentIds = (batch.items || []).map(
      i => i.productId || i.product?.id,
    );
    setSelectedProductIds(currentIds.filter(Boolean));
    setProductSearch('');
    setFormErrors({});
    setExpandedBatch(null);
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setFormName('');
    setFormDescription('');
    setFormDiscount('');
    setSelectedProductIds([]);
    setProductSearch('');
    setFormErrors({});
    setEditingBatch(null);
    setIsEditing(false);
  };

  // ── Product selection ───────────────────────────────
  const toggleProduct = productId => {
    setSelectedProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId],
    );
  };

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      p => (p.name || '').toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  const selectedProducts = useMemo(() => {
    return products.filter(p => selectedProductIds.includes(p.id));
  }, [products, selectedProductIds]);

  // ── Submit (create / update) ────────────────────────
  const handleSubmit = async () => {
    if (!validateForm()) return;

    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      discountPercent: formDiscount ? parseFloat(formDiscount) : 0,
      productIds: selectedProductIds,
    };

    try {
      setSubmitting(true);
      if (isEditing && editingBatch) {
        await apiService.updateBatch(editingBatch.id, payload);
      } else {
        await apiService.createBatch(payload);
      }
      closeModal();
      loadBatches(true);
      loadProducts();
    } catch (err) {
      console.error('Error saving batch:', err.message);
      setModal({
        visible: true,
        type: 'alert',
        title: 'Error',
        message: err.message || 'No se pudo guardar el lote.',
        confirmText: 'Aceptar',
        onConfirm: null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────
  const handleDelete = batch => {
    const itemCount = batch.items?.length || batch.productCount || 0;
    setModal({
      visible: true,
      type: 'danger',
      title: 'Eliminar lote',
      message: `Eliminar "${batch.name}"?\n\nEl descuento se eliminara de ${itemCount} producto(s) (se reseteara a 0%).`,
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          await apiService.deleteBatch(batch.id);
          setModal(prev => ({...prev, visible: false}));
          loadBatches(true);
          loadProducts();
        } catch (err) {
          console.error('Error deleting batch:', err.message);
          setModal({
            visible: true,
            type: 'alert',
            title: 'Error',
            message: err.message || 'No se pudo eliminar el lote.',
            confirmText: 'Aceptar',
            onConfirm: null,
          });
        }
      },
    });
  };

  // ── Render helpers ──────────────────────────────────
  const formatPrice = price => {
    const num = typeof price === 'number' ? price : parseFloat(price);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  };

  const renderBatchCard = ({item}) => {
    const isExpanded = expandedBatch?.id === item.id;
    const discount = item.discountPercent || item.discount_percent || 0;
    const itemCount = item.items?.length || item.productCount || 0;
    const isActive = item.status === 'active';

    return (
      <View>
        <TouchableOpacity
          style={[styles.card, !isActive && styles.cardInactive]}
          onPress={() =>
            setExpandedBatch(isExpanded ? null : item)
          }
          activeOpacity={0.7}>
          {/* Left: icon */}
          <View style={[styles.batchIcon, {backgroundColor: discount > 0 ? '#E8FBF5' : '#F0F2F5'}]}>
            <Icon
              name="layers-outline"
              size={22}
              color={discount > 0 ? '#00B894' : theme.colors.textSecondary}
            />
          </View>

          {/* Center: info */}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={styles.cardDesc} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.cardBadges}>
              <View style={[styles.badge, {backgroundColor: discount > 0 ? '#E8FBF5' : '#F0F2F5'}]}>
                <Text style={[styles.badgeText, {color: discount > 0 ? '#00B894' : theme.colors.textSecondary}]}>
                  {discount > 0 ? `${discount}% dto.` : '0% dto.'}
                </Text>
              </View>
              <View style={[styles.badge, {backgroundColor: '#E8F1FF'}]}>
                <Text style={[styles.badgeText, {color: '#54A0FF'}]}>
                  {itemCount} producto{itemCount !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Right: actions */}
          <View style={styles.cardActions}>
            {isActive && hasPermission('batches.edit') && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openEditModal(item)}
                activeOpacity={0.7}>
                <Icon name="create-outline" size={20} color="#3498DB" />
              </TouchableOpacity>
            )}
            {isActive && hasPermission('batches.delete') && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDelete(item)}
                activeOpacity={0.7}>
                <Icon name="trash-outline" size={20} color="#FF6B6B" />
              </TouchableOpacity>
            )}
            <Icon
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.colors.textSecondary}
              style={{marginLeft: 4}}
            />
          </View>
        </TouchableOpacity>

        {/* Expanded: show products in batch */}
        {isExpanded && item.items && item.items.length > 0 && (
          <View style={styles.expandedContainer}>
            <Text style={styles.expandedTitle}>
              Productos en lote ({item.items.length})
            </Text>
            {item.items.map((batchItem, idx) => {
              const prod = batchItem.product;
              if (!prod) return null;
              return (
                <View key={batchItem.productId || idx} style={styles.expandedProduct}>
                  <View style={styles.expandedProductInfo}>
                    <Text style={styles.expandedProductName} numberOfLines={1}>
                      {prod.name}
                    </Text>
                    <Text style={styles.expandedProductPrice}>
                      {formatPrice(prod.price)}
                      {(prod.discountPercent || prod.discount_percent) > 0 && (
                        <Text style={{color: '#00B894'}}>
                          {' '}
                          -{prod.discountPercent || prod.discount_percent}%
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="layers-outline" size={56} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>Sin lotes</Text>
      <Text style={styles.emptySubtitle}>
        Pulsa el boton + para crear tu primer lote de descuento
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.emptyContainer}>
      <Icon name="alert-circle-outline" size={56} color={primary} />
      <Text style={styles.emptyTitle}>Error de conexion</Text>
      <Text style={styles.emptySubtitle}>{error}</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => loadBatches()}
        activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFieldLabel = (label, fieldName) => (
    <Text style={styles.fieldLabel}>
      {label}
      {formErrors[fieldName] && (
        <Text style={styles.fieldError}> {formErrors[fieldName]}</Text>
      )}
    </Text>
  );

  // ── Main render ─────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Lotes</Text>
          </View>
          <View style={styles.headerRight}>
            {!user?.roles?.some(r => r.name === 'editor') && (
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon name="settings-outline" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleLogout}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="log-out-outline" size={22} color={primary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loadingText}>Cargando lotes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canCreate = hasPermission('batches.create');

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Lotes</Text>
        </View>
        <View style={styles.headerRight}>
          {!user?.roles?.some(r => r.name === 'editor') && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="settings-outline" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleLogout}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="log-out-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      {error && !batches.length ? (
        renderError()
      ) : (
        <FlatList
          data={batches}
          keyExtractor={item => item.id.toString()}
          renderItem={renderBatchCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={!error ? renderEmpty : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadBatches(true)}
              colors={[primary]}
              tintColor={primary}
            />
          }
        />
      )}

      {/* Floating Add Button */}
      {canCreate && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openCreateModal}
          activeOpacity={0.85}>
          <Icon name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Create / Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}>
        <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeModal}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Editar lote' : 'Nuevo lote de descuento'}
            </Text>
            <View style={{width: 28}} />
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets>
            {/* Name field */}
            <View style={styles.fieldGroup}>
              {renderFieldLabel('Nombre del lote *', 'name')}
              <TextInput
                ref={nameInputRef}
                style={[styles.textInput, formErrors.name && styles.inputError]}
                value={formName}
                onChangeText={text => {
                  setFormName(text);
                  if (formErrors.name) setFormErrors(prev => ({...prev, name: undefined}));
                }}
                placeholder="Ej: Promo Navidad"
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={200}
                editable={!submitting}
                returnKeyType="next"
                onSubmitEditing={() => discountInputRef.current?.focus()}
              />
            </View>

            {/* Description field */}
            <View style={styles.fieldGroup}>
              {renderFieldLabel('Descripcion (opcional)', 'description')}
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Descripcion del lote..."
                placeholderTextColor={theme.colors.textSecondary}
                maxLength={500}
                editable={!submitting}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Discount field */}
            <View style={styles.fieldGroup}>
              {renderFieldLabel('Descuento (%) *', 'discount')}
              <View style={styles.discountInputContainer}>
                <Icon name="options-outline" size={18} color={theme.colors.textSecondary} />
                <TextInput
                  ref={discountInputRef}
                  style={styles.discountInput}
                  value={formDiscount}
                  onChangeText={text => {
                    setFormDiscount(text);
                    if (formErrors.discount) setFormErrors(prev => ({...prev, discount: undefined}));
                  }}
                  placeholder="Ej: 15 para 15% de descuento"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="decimal-pad"
                  editable={!submitting}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Selected products summary */}
            {selectedProductIds.length > 0 && (
              <View style={styles.selectedSummary}>
                <View style={styles.selectedSummaryHeader}>
                  <Text style={styles.selectedSummaryTitle}>
                    {selectedProductIds.length} producto{selectedProductIds.length !== 1 ? 's' : ''} seleccionado{selectedProductIds.length !== 1 ? 's' : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSelectedProductIds([])}
                    hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}>
                    <Text style={styles.clearBtn}>Limpiar</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.selectedChipsContainer}>
                  {selectedProducts.map(p => (
                    <View key={p.id} style={styles.chip}>
                      <Text style={styles.chipText} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => toggleProduct(p.id)}
                        hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}>
                        <Icon name="close" size={14} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Products error */}
            {formErrors.products && (
              <Text style={styles.productsError}>{formErrors.products}</Text>
            )}

            {/* Product search & selection */}
            <View style={styles.productSection}>
              <Text style={styles.productSectionTitle}>Seleccionar productos</Text>
              <View style={styles.searchContainer}>
                <Icon name="search" size={16} color={theme.colors.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder="Buscar producto..."
                  placeholderTextColor={theme.colors.textSecondary}
                  editable={!submitting}
                />
              </View>

              <ScrollView style={styles.productList} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                {filteredProducts.length === 0 ? (
                  <Text style={styles.noProducts}>No se encontraron productos</Text>
                ) : (
                  filteredProducts.map(product => {
                    const isSelected = selectedProductIds.includes(product.id);
                    return (
                      <TouchableOpacity
                        key={product.id}
                        style={[styles.productRow, isSelected && styles.productRowSelected]}
                        onPress={() => toggleProduct(product.id)}
                        activeOpacity={0.7}>
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && <Icon name="checkmark" size={16} color="#FFF" />}
                        </View>
                        <View style={styles.productInfo}>
                          <Text style={styles.productName} numberOfLines={1}>
                            {product.name}
                          </Text>
                          <Text style={styles.productPrice}>
                            {formatPrice(product.price)}
                          </Text>
                        </View>
                        {isSelected && (
                          <View style={styles.selectedDot} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                submitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}>
              {submitting ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isEditing
                    ? `Actualizar lote (${selectedProductIds.length} productos)`
                    : `Crear lote (${selectedProductIds.length} productos)`}
                </Text>
              )}
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

// ── Styles ────────────────────────────────────────────
const createStyles = primary =>
  StyleSheet.create({
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
    headerLeft: {width: 68},
    headerCenter: {flex: 1, alignItems: 'center'},
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
    cardInactive: {
      opacity: 0.6,
    },
    batchIcon: {
      width: 46,
      height: 46,
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing.md,
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
    cardDesc: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    cardBadges: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 6,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
    },
    cardActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.md,
      backgroundColor: '#F0F2F5',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Expanded
    expandedContainer: {
      backgroundColor: '#F8F9FA',
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      borderTopWidth: 0,
    },
    expandedTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 10,
    },
    expandedProduct: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    expandedProductInfo: {
      flex: 1,
    },
    expandedProductName: {
      fontSize: theme.fontSize.sm,
      fontWeight: '500',
      color: theme.colors.text,
    },
    expandedProductPrice: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },

    // Empty / Error
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

    // Modal
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
    modalBody: {flex: 1},
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
    textArea: {
      minHeight: 60,
      textAlignVertical: 'top',
    },
    inputError: {
      borderColor: primary,
    },
    discountInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.inputBg || '#F0F2F5',
      paddingHorizontal: theme.spacing.md,
      height: 48,
    },
    discountInput: {
      flex: 1,
      fontSize: theme.fontSize.md,
      color: theme.colors.text,
      marginLeft: 8,
      padding: 0,
    },
    productsError: {
      fontSize: theme.fontSize.sm,
      color: '#FF6B6B',
      marginTop: -4,
      marginBottom: theme.spacing.sm,
    },

    // Selected products summary
    selectedSummary: {
      backgroundColor: '#E8FBF5',
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    selectedSummaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    selectedSummaryTitle: {
      fontSize: theme.fontSize.sm,
      fontWeight: '700',
      color: '#00B894',
    },
    clearBtn: {
      fontSize: theme.fontSize.xs,
      fontWeight: '600',
      color: '#FF6B6B',
    },
    selectedChipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#00B894',
      gap: 4,
    },
    chipText: {
      fontSize: theme.fontSize.xs,
      fontWeight: '500',
      color: theme.colors.text,
      maxWidth: 150,
    },

    // Product section
    productSection: {
      marginTop: theme.spacing.sm,
    },
    productSectionTitle: {
      fontSize: theme.fontSize.base,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: theme.spacing.sm,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.inputBg || '#F0F2F5',
      paddingHorizontal: theme.spacing.md,
      height: 42,
      marginBottom: theme.spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
      marginLeft: 8,
      padding: 0,
    },
    productList: {
      maxHeight: 280,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      overflow: 'hidden',
    },
    noProducts: {
      textAlign: 'center',
      padding: 24,
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
    },
    productRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    productRowSelected: {
      backgroundColor: 'rgba(108, 92, 231, 0.06)',
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    checkboxSelected: {
      backgroundColor: primary,
      borderColor: primary,
    },
    productInfo: {
      flex: 1,
    },
    productName: {
      fontSize: theme.fontSize.sm,
      fontWeight: '500',
      color: theme.colors.text,
    },
    productPrice: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    selectedDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: primary,
    },
  });

export default AdminBatchesScreen;
