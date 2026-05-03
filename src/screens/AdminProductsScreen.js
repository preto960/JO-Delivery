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
  Image,
  Platform,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchImageLibrary} from 'react-native-image-picker';
import {useNavigation} from '@react-navigation/native';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import apiService from '@services/api';
import {formatPrice} from '@utils/helpers';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';
import ConfirmModal from '@components/ConfirmModal';

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_LIMIT = 20;

const INITIAL_FORM = {
  name: '',
  description: '',
  price: '',
  image: '',
  thumbnail: '',
  stock: '',
  categoryId: '',
  active: true,
  selectedStoreIds: [],
  images: [],
};

const EMPTY_FORM_ERRORS = {};

// ─── Component ────────────────────────────────────────────────────────────────
const AdminProductsScreen = () => {
  const navigation = useNavigation();
  const {user, logout} = useAuth();
  const {isMultiStore} = useConfig();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  // Data state
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
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
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState(EMPTY_FORM_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  // Confirm modal
  const [modal, setModal] = useState({visible: false, type: 'alert', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});

  // Category picker
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-store filters
  const [stores, setStores] = useState([]);
  const [selectedStoreFilter, setSelectedStoreFilter] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(null);
  const [showStoreFilter, setShowStoreFilter] = useState(false);

  // Scroll arrow states for category chips
  const categoryListRef = useRef(null);
  const categoryWrapperLayout = useRef(null);
  const [catCanScrollLeft, setCatCanScrollLeft] = useState(false);
  const [catCanScrollRight, setCatCanScrollRight] = useState(false);

  // Scroll arrow states for store chips
  const storeListRef = useRef(null);
  const storeWrapperLayout = useRef(null);
  const [storeCanScrollLeft, setStoreCanScrollLeft] = useState(false);
  const [storeCanScrollRight, setStoreCanScrollRight] = useState(false);

  const SCROLL_ARROW_AMOUNT = 150;

  const nameInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const priceInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const stockInputRef = useRef(null);
  const imageUrlInputRef = useRef(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiService.fetchCategories();
      const list = Array.isArray(res) ? res : res.data || res.categories || [];
      setCategories(list);
    } catch (err) {
      console.warn('Failed to load categories:', err.message);
    }
  }, []);

  const loadProducts = useCallback(
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

        const params = {
          page: pageNum,
          limit: PAGE_LIMIT,
          search: searchQuery || undefined,
        };
        if (isMultiStore && selectedStoreFilter) {
          params.store = selectedStoreFilter;
        }
        if (selectedCategoryFilter) {
          params.category = selectedCategoryFilter;
        }
        const res = await apiService.fetchProducts(params);

        const items = Array.isArray(res) ? res : res.data || [];
        const paginationData = res.pagination || null;

        if (pageNum === 1) {
          setProducts(items);
        } else {
          setProducts(prev => [...prev, ...items]);
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
    [searchQuery, selectedStoreFilter, selectedCategoryFilter, isMultiStore],
  );

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load stores for filters when multi-store is ON
  useEffect(() => {
    if (isMultiStore) {
      const loadStores = async () => {
        try {
          const res = await apiService.fetchStoresAdmin().catch(() => []);
          const list = Array.isArray(res)
            ? res
            : res.data || res.stores || [];
          setStores(list);
        } catch (err) {
          console.warn('Failed to load stores:', err.message);
        }
      };
      loadStores();
    } else {
      setStores([]);
      setSelectedStoreFilter(null);
      setSelectedCategoryFilter(null);
    }
  }, [isMultiStore]);

  useEffect(() => {
    loadProducts(1);
  }, [searchQuery, selectedStoreFilter, selectedCategoryFilter, loadProducts]);

  const handleRefresh = useCallback(() => {
    loadProducts(1, true);
  }, [loadProducts]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && !refreshing && hasMore) {
      loadProducts(page + 1);
    }
  }, [loadingMore, refreshing, hasMore, page, loadProducts]);

  // ─── Filter Handlers (same as HomeScreen) ─────────────────────────────────

  const handleCategorySelect = useCallback(categoryId => {
    setSelectedCategoryFilter(prev => (prev === categoryId ? null : categoryId));
  }, []);

  const handleStoreSelect = useCallback(storeId => {
    setSelectedStoreFilter(prev => (prev === storeId ? null : storeId));
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCategoryFilter(null);
    setSelectedStoreFilter(null);
    setSearchQuery('');
  }, []);

  const hasActiveFilters = selectedCategoryFilter || selectedStoreFilter || searchQuery;

  const scrollCategoryBy = useCallback((direction) => {
    if (!categoryListRef.current) return;
    categoryListRef.current.scrollToOffset({
      offset: (direction === 'left' ? -SCROLL_ARROW_AMOUNT : SCROLL_ARROW_AMOUNT),
      animated: true,
    });
  }, []);

  const scrollStoreBy = useCallback((direction) => {
    if (!storeListRef.current) return;
    storeListRef.current.scrollToOffset({
      offset: (direction === 'left' ? -SCROLL_ARROW_AMOUNT : SCROLL_ARROW_AMOUNT),
      animated: true,
    });
  }, []);

  const handleCategoryScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setCatCanScrollLeft(contentOffset.x > 5);
    setCatCanScrollRight(contentOffset.x + layoutMeasurement.width < contentSize.width - 5);
  }, []);

  const handleCategoryContentResize = useCallback((contentWidth) => {
    if (categoryWrapperLayout.current && contentWidth > categoryWrapperLayout.current.width) {
      setCatCanScrollRight(true);
    }
  }, []);

  const handleCategoryLayout = useCallback((event) => {
    categoryWrapperLayout.current = event.nativeEvent.layout;
  }, []);

  const handleStoreScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setStoreCanScrollLeft(contentOffset.x > 5);
    setStoreCanScrollRight(contentOffset.x + layoutMeasurement.width < contentSize.width - 5);
  }, []);

  const handleStoreContentResize = useCallback((contentWidth) => {
    if (storeWrapperLayout.current && contentWidth > storeWrapperLayout.current.width) {
      setStoreCanScrollRight(true);
    }
  }, []);

  const handleStoreLayout = useCallback((event) => {
    storeWrapperLayout.current = event.nativeEvent.layout;
  }, []);

  // ─── Image Helpers ─────────────────────────────────────────────────────

  const parseProductImages = useCallback(product => {
    const images = [];
    if (product.image) {
      images.push(product.image);
    }
    let gallery = [];
    if (product.images) {
      if (Array.isArray(product.images)) {
        gallery = product.images;
      } else if (typeof product.images === 'string') {
        try {
          const parsed = JSON.parse(product.images);
          if (Array.isArray(parsed)) gallery = parsed;
        } catch {
          gallery = [product.images];
        }
      }
    }
    for (const url of gallery) {
      if (url && typeof url === 'string' && !images.includes(url)) {
        images.push(url);
      }
    }
    return images;
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 5,
      });
      if (result.didCancel || !result.assets?.length) return;

      setUploadingImage(true);
      const formData = new FormData();
      result.assets.forEach(asset => {
        formData.append('images', {
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          name: asset.fileName || `image_${Date.now()}.jpg`,
        });
      });

      const res = await apiService.uploadProductImages(formData);
      const urls = Array.isArray(res) ? res : res.urls || res.data || [];

      if (urls.length > 0) {
        setForm(prev => {
          const existing = prev.images || [];
          const merged = [...existing];
          for (const url of urls) {
            if (!merged.includes(url)) merged.push(url);
          }
          const newImage = merged[0] || prev.image;
          return {...prev, images: merged, image: newImage};
        });
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudieron subir las imágenes');
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const handleAddImageUrl = useCallback(() => {
    const url = imageUrlInput.trim();
    if (!url) return;
    if (!isValidUrl(url)) {
      Alert.alert('URL inválida', 'Ingresa una URL válida (https://...)');
      return;
    }
    setForm(prev => {
      const existing = prev.images || [];
      if (existing.includes(url)) return prev;
      const merged = [...existing, url];
      const newImage = merged[0] || prev.image;
      return {...prev, images: merged, image: newImage};
    });
    setImageUrlInput('');
  }, [imageUrlInput]);

  const handleRemoveImage = useCallback((urlToRemove) => {
    setForm(prev => {
      const filtered = (prev.images || []).filter(u => u !== urlToRemove);
      const newImage = filtered[0] || '';
      return {...prev, images: filtered, image: newImage};
    });
  }, []);

  const handleSetPrimary = useCallback((url) => {
    setForm(prev => {
      const images = [...(prev.images || [])];
      const idx = images.indexOf(url);
      if (idx > 0) {
        images.splice(idx, 1);
        images.unshift(url);
      }
      return {...prev, images, image: images[0] || prev.image};
    });
  }, []);

  const handleDeleteServerImage = useCallback(async (url) => {
    try {
      await apiService.deleteProductImage(url);
      handleRemoveImage(url);
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo eliminar la imagen');
    }
  }, [handleRemoveImage]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setFormErrors(EMPTY_FORM_ERRORS);
    setEditingProduct(null);
    setImageUrlInput('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setModalVisible(true);
    setTimeout(() => nameInputRef.current?.focus(), 300);
  }, [resetForm]);

  const openEditModal = useCallback(product => {
    setEditingProduct(product);
    const parsedImages = parseProductImages(product);
    setForm({
      name: product.name || '',
      description: product.description || '',
      price: product.price != null ? String(product.price) : '',
      image: product.image || '',
      thumbnail: product.thumbnail || '',
      stock: product.stock != null ? String(product.stock) : '',
      categoryId: product.categoryId || product.category?.id || '',
      active: product.active !== false,
      selectedStoreIds: product.storeIds || [],
      images: parsedImages,
    });
    setFormErrors(EMPTY_FORM_ERRORS);
    setImageUrlInput('');
    setModalVisible(true);
  }, [parseProductImages]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    resetForm();
  }, [resetForm]);

  const updateField = useCallback((field, value) => {
    setForm(prev => ({...prev, [field]: value}));
    setFormErrors(prev => ({...prev, [field]: undefined}));
  }, []);

  const getCategoryName = useCallback(
    categoryId => {
      if (!categoryId) return null;
      const cat = categories.find(c => c.id === categoryId);
      return cat ? cat.name : null;
    },
    [categories],
  );

  // ─── Validation ───────────────────────────────────────────────────────────

  const validateForm = useCallback(() => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'El nombre es obligatorio';
    }

    if (!form.price.trim()) {
      errors.price = 'El precio es obligatorio';
    } else if (isNaN(Number(form.price)) || Number(form.price) < 0) {
      errors.price = 'Precio inválido';
    }

    if (
      form.stock.trim() &&
      (isNaN(Number(form.stock)) || Number(form.stock) < 0)
    ) {
      errors.stock = 'Stock inválido';
    }

    if (form.image.trim() && !isValidUrl(form.image.trim())) {
      errors.image = 'URL inválida';
    }

    if (form.thumbnail.trim() && !isValidUrl(form.thumbnail.trim())) {
      errors.thumbnail = 'URL inválida';
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
        description: form.description.trim(),
        price: parseFloat(Number(form.price)),
        image: (form.images && form.images[0]) || form.image.trim() || null,
        thumbnail: form.thumbnail.trim() || null,
        stock: parseInt(Number(form.stock), 10) || 0,
        categoryId: form.categoryId || null,
        active: form.active,
      };

      if (form.images && form.images.length > 0) {
        payload.images = JSON.stringify(form.images);
      }

      if (form.selectedStoreIds && form.selectedStoreIds.length > 0) {
        payload.storeIds = form.selectedStoreIds;
      }

      if (editingProduct) {
        await apiService.updateProduct(editingProduct.id, payload);
      } else {
        await apiService.createProduct(payload);
      }

      closeModal();
      loadProducts(1, true);
    } catch (err) {
      setModal({visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo guardar el producto', confirmText: 'Aceptar', onConfirm: null});
    } finally {
      setSubmitting(false);
    }
  }, [form, editingProduct, validateForm, closeModal, loadProducts]);

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    product => {
      setModal({
        visible: true,
        type: 'danger',
        title: 'Eliminar producto',
        message: `¿Estás seguro de que deseas eliminar "${product.name}"? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
          try {
            await apiService.deleteProduct(product.id);
            setProducts(prev => prev.filter(p => p.id !== product.id));
          } catch (err) {
            setModal({visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo eliminar el producto', confirmText: 'Aceptar', onConfirm: null});
          }
        },
      });
    },
    [],
  );

  // ─── Toggle Active ────────────────────────────────────────────────────────

  const handleToggleActive = useCallback(
    product => {
      const newStatus = !product.active;
      const label = newStatus ? 'activar' : 'desactivar';

      setModal({
        visible: true,
        type: 'confirm',
        title: `${newStatus ? 'Activar' : 'Desactivar'} producto`,
        message: `¿Deseas ${label} "${product.name}"?`,
        confirmText: newStatus ? 'Activar' : 'Desactivar',
        onConfirm: async () => {
          try {
            await apiService.updateProduct(product.id, {active: newStatus});
            setProducts(prev =>
              prev.map(p =>
                p.id === product.id ? {...p, active: newStatus} : p,
              ),
            );
          } catch (err) {
            setModal({visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo actualizar el producto', confirmText: 'Aceptar', onConfirm: null});
          }
        },
      });
    },
    [],
  );

  // ─── Render Helpers ───────────────────────────────────────────────────────

  const renderEmpty = useCallback(() => {
    if (loading) return null;

    if (error && products.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="alert-circle-outline" size={56} color={primary} />
          <Text style={styles.emptyTitle}>Error al cargar</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadProducts(1)}
            activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (searchQuery) {
      return (
        <View style={styles.emptyContainer}>
          <Icon name="search-outline" size={56} color={theme.colors.textLight} />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyText}>
            No se encontraron productos para "{searchQuery}"
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Icon name="pricetag-outline" size={56} color={theme.colors.textLight} />
        <Text style={styles.emptyTitle}>Sin productos</Text>
        <Text style={styles.emptyText}>
          Agrega tu primer producto tocando el botón +
        </Text>
      </View>
    );
  }, [loading, error, products.length, searchQuery, loadProducts]);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={primary} />
        <Text style={styles.footerText}>Cargando más...</Text>
      </View>
    );
  }, [loadingMore]);

  const renderProductCard = useCallback(
    ({item}) => {
      const categoryName = getCategoryName(item.categoryId || item.category?.id);
      const isActive = item.active !== false;

      return (
        <View style={styles.card}>
          {/* Avatar thumbnail */}
          <View style={styles.cardAvatar}>
            {item.thumbnail || item.image ? (
              <Image
                source={{uri: item.thumbnail || item.image}}
                style={styles.cardAvatarImg}
                resizeMode="cover"
                onError={() => {}}
              />
            ) : (
              <View style={styles.cardAvatarPlaceholder}>
                <Icon
                  name="image-outline"
                  size={20}
                  color={theme.colors.textLight}
                />
              </View>
            )}
          </View>

          {/* Product info */}
          <View style={styles.cardBody}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.cardSubInfo}>
              {categoryName ? (
                <Text style={styles.cardCategory} numberOfLines={1}>
                  {categoryName}
                </Text>
              ) : null}
              <Text style={styles.cardDot}>{categoryName ? ' · ' : ''}</Text>
              <Text
                style={[
                  styles.cardStock,
                  item.stock === 0 && styles.cardStockDanger,
                ]}>
                {item.stock === 0 ? 'Agotado' : `Stock: ${item.stock}`}
              </Text>
            </View>
            <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
          </View>

          {/* Active toggle + actions */}
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
    [getCategoryName, handleToggleActive, openEditModal, handleDelete],
  );

  // ─── Render Category Picker ───────────────────────────────────────────────

  const renderCategoryPicker = useCallback(() => {
    const selectedName = getCategoryName(form.categoryId);

    return (
      <View style={styles.pickerWrapper}>
        <Text style={styles.label}>Categoría</Text>
        <TouchableOpacity
          style={[
            styles.pickerTrigger,
            formErrors.categoryId && styles.inputError,
          ]}
          onPress={() => setCategoryPickerVisible(true)}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.pickerText,
              !selectedName && styles.pickerPlaceholder,
            ]}
            numberOfLines={1}>
            {selectedName || 'Seleccionar categoría (opcional)'}
          </Text>
          <Icon
            name="chevron-down"
            size={18}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
        {formErrors.categoryId && (
          <Text style={styles.errorText}>{formErrors.categoryId}</Text>
        )}

        <Modal
          visible={categoryPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerVisible(false)}>
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setCategoryPickerVisible(false)}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Seleccionar Categoría</Text>
                <TouchableOpacity
                  onPress={() => setCategoryPickerVisible(false)}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Icon
                    name="close"
                    size={24}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {/* None option */}
              <TouchableOpacity
                style={[
                  styles.pickerOption,
                  !form.categoryId && styles.pickerOptionSelected,
                ]}
                onPress={() => {
                  updateField('categoryId', '');
                  setCategoryPickerVisible(false);
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.pickerOptionText,
                    !form.categoryId && styles.pickerOptionTextSelected,
                  ]}>
                  Sin categoría
                </Text>
                {!form.categoryId && (
                  <Icon
                    name="checkmark"
                    size={20}
                    color={primary}
                  />
                )}
              </TouchableOpacity>

              <ScrollView
                style={styles.pickerList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.pickerOption,
                      form.categoryId === cat.id &&
                        styles.pickerOptionSelected,
                    ]}
                    onPress={() => {
                      updateField('categoryId', cat.id);
                      setCategoryPickerVisible(false);
                    }}
                    activeOpacity={0.7}>
                    <Text
                      style={[
                        styles.pickerOptionText,
                        form.categoryId === cat.id &&
                          styles.pickerOptionTextSelected,
                      ]}>
                      {cat.name}
                    </Text>
                    {form.categoryId === cat.id && (
                      <Icon
                        name="checkmark"
                        size={20}
                        color={primary}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }, [
    categoryPickerVisible,
    categories,
    form.categoryId,
    formErrors.categoryId,
    getCategoryName,
    updateField,
  ]);

  // ─── Render Form Modal ────────────────────────────────────────────────────

  const renderFormModal = useCallback(() => {
    const isEditing = !!editingProduct;

    return (
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {}}>
        <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={closeModal}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
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
              placeholder="Nombre del producto"
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
              placeholder="Descripción del producto"
              placeholderTextColor={theme.colors.textLight}
              returnKeyType="next"
              onSubmitEditing={() => priceInputRef.current?.focus()}
              maxLength={1000}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Price & Stock row */}
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>
                  Precio <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  ref={priceInputRef}
                  style={[
                    styles.input,
                    formErrors.price && styles.inputError,
                  ]}
                  value={form.price}
                  onChangeText={val => updateField('price', val)}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textLight}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => stockInputRef.current?.focus()}
                />
                {formErrors.price && (
                  <Text style={styles.errorText}>{formErrors.price}</Text>
                )}
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Stock</Text>
                <TextInput
                  ref={stockInputRef}
                  style={[
                    styles.input,
                    formErrors.stock && styles.inputError,
                  ]}
                  value={form.stock}
                  onChangeText={val => updateField('stock', val)}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textLight}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => imageInputRef.current?.focus()}
                />
                {formErrors.stock && (
                  <Text style={styles.errorText}>{formErrors.stock}</Text>
                )}
              </View>
            </View>

            {/* Image URL */}
            <Text style={styles.label}>URL de Imagen</Text>
            <TextInput
              ref={imageInputRef}
              style={[styles.input, formErrors.image && styles.inputError]}
              value={form.image}
              onChangeText={val => updateField('image', val)}
              placeholder="https://ejemplo.com/imagen.jpg"
              placeholderTextColor={theme.colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="next"
              onSubmitEditing={() => thumbnailInputRef.current?.focus()}
            />
            {formErrors.image && (
              <Text style={styles.errorText}>{formErrors.image}</Text>
            )}

            {/* Thumbnail URL */}
            <Text style={styles.label}>URL de Miniatura</Text>
            <TextInput
              ref={thumbnailInputRef}
              style={[styles.input, formErrors.thumbnail && styles.inputError]}
              value={form.thumbnail}
              onChangeText={val => updateField('thumbnail', val)}
              placeholder="https://ejemplo.com/miniatura.jpg"
              placeholderTextColor={theme.colors.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            {formErrors.thumbnail && (
              <Text style={styles.errorText}>{formErrors.thumbnail}</Text>
            )}

            {/* ─── Multi-image gallery section ─── */}
            <View style={styles.imagesSection}>
              <Text style={styles.sectionTitle}>
                <Icon name="images-outline" size={18} color={primary} />{' '}
                Imágenes del producto
              </Text>

              {/* Upload from gallery button */}
              <TouchableOpacity
                style={[styles.uploadBtn, uploadingImage && styles.uploadBtnDisabled]}
                onPress={handlePickImage}
                disabled={uploadingImage}
                activeOpacity={0.7}>
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <>
                    <Icon name="camera-outline" size={18} color={theme.colors.white} />
                    <Text style={styles.uploadBtnText}>Elegir de galería</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Add URL input */}
              <View style={styles.addUrlRow}>
                <TextInput
                  ref={imageUrlInputRef}
                  style={styles.addUrlInput}
                  value={imageUrlInput}
                  onChangeText={setImageUrlInput}
                  placeholder="Agregar URL"
                  placeholderTextColor={theme.colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={handleAddImageUrl}
                />
                <TouchableOpacity
                  style={styles.addUrlButton}
                  onPress={handleAddImageUrl}
                  activeOpacity={0.7}>
                  <Icon name="add" size={20} color={theme.colors.white} />
                </TouchableOpacity>
              </View>

              {/* Image gallery preview */}
              {(form.images || []).length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.imageGalleryScroll}
                  contentContainerStyle={styles.imageGalleryContent}>
                  {(form.images || []).map((url, idx) => {
                    const isPrimary = idx === 0;
                    return (
                      <TouchableOpacity
                        key={url}
                        activeOpacity={0.7}
                        onLongPress={() => {
                          Alert.alert(
                            'Eliminar imagen',
                            '¿Deseas eliminar esta imagen del servidor?',
                            [
                              {text: 'Cancelar', style: 'cancel'},
                              {text: 'Eliminar', style: 'destructive', onPress: () => handleDeleteServerImage(url)},
                            ],
                          );
                        }}
                        onPress={() => handleSetPrimary(url)}>
                        <View style={[
                          styles.galleryThumbWrap,
                          isPrimary && styles.galleryThumbPrimary,
                        ]}>
                          <Image
                            source={{uri: url}}
                            style={styles.galleryThumb}
                            resizeMode="cover"
                          />
                          {isPrimary && (
                            <View style={styles.primaryBadge}>
                              <Text style={styles.primaryBadgeText}>Principal</Text>
                            </View>
                          )}
                          <TouchableOpacity
                            style={styles.galleryThumbRemove}
                            onPress={() => handleRemoveImage(url)}>
                            <Icon name="close" size={14} color={theme.colors.white} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              <Text style={styles.imagesHint}>
                {(form.images || []).length === 0
                  ? 'Sin imágenes. Agrega una URL o elige de la galería.'
                  : `${(form.images || []).length} imagen(es). La primera es la principal. Toca para cambiar, mantén presionado para eliminar del servidor.`}
              </Text>
            </View>

            {/* Category picker */}
            {renderCategoryPicker()}

            {/* Active toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Producto activo</Text>
                <Text style={styles.toggleDescription}>
                  Los productos inactivos no se muestran en la tienda
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

            {/* Store selection (multi-store only) */}
            {isMultiStore && stores.length > 0 && (
              <View style={styles.createSection}>
                <Text style={styles.sectionTitle}>
                  Tiendas
                </Text>
                <Text style={styles.sectionDescription}>
                  Selecciona las tiendas donde estará disponible el producto
                </Text>
                <View style={styles.roleCheckWrap}>
                  {stores.map(store => {
                    const isSelected = (form.selectedStoreIds || []).includes(store.id);
                    return (
                      <TouchableOpacity
                        key={store.id}
                        style={[
                          styles.roleCheck,
                          isSelected && styles.roleCheckSelected,
                        ]}
                        onPress={() => {
                          const currentIds = form.selectedStoreIds || [];
                          const newIds = isSelected
                            ? currentIds.filter(id => id !== store.id)
                            : [...currentIds, store.id];
                          updateField('selectedStoreIds', newIds);
                        }}
                        activeOpacity={0.7}>
                        <Icon
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={isSelected ? theme.colors.white : theme.colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.roleCheckText,
                            isSelected && styles.roleCheckTextSelected,
                          ]}>
                          {store.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

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
                  {isEditing ? 'Guardar Cambios' : 'Crear Producto'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }, [
    modalVisible,
    editingProduct,
    form,
    formErrors,
    submitting,
    closeModal,
    updateField,
    handleSubmit,
    renderCategoryPicker,
    isMultiStore,
    stores,
    handlePickImage,
    handleAddImageUrl,
    handleRemoveImage,
    handleSetPrimary,
    uploadingImage,
    imageUrlInput,
  ]);

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

  // ─── Main Render ──────────────────────────────────────────────────────────

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Productos</Text>
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
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loaderText}>Cargando productos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Productos</Text>
          <Text style={styles.headerSubtitle}>
            {products.length} producto{products.length !== 1 ? 's' : ''}
          </Text>
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

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Icon
            name="search"
            size={18}
            color={theme.colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar productos..."
            placeholderTextColor={theme.colors.textLight}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon
                name="close-circle"
                size={18}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category filters */}
      {categories.length > 0 && (
        <View style={styles.filterRow}>
          <View style={styles.chipScrollWrapper} onLayout={handleCategoryLayout}>
            {catCanScrollLeft && (
              <TouchableOpacity
                style={styles.scrollArrowLeft}
                onPress={() => scrollCategoryBy('left')}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <Icon name="chevron-back" size={20} color={primary} />
              </TouchableOpacity>
            )}
            <FlatList
              ref={categoryListRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={handleCategoryScroll}
              scrollEventThrottle={16}
              data={[{id: null, name: 'Todos'}, ...categories]}
              keyExtractor={item => `cat-${item.id?.toString() || 'all'}`}
              renderItem={({item}) => (
                <TouchableOpacity
                  onPress={() => handleCategorySelect(item.id)}
                  style={[
                    styles.filterChip,
                    selectedCategoryFilter === item.id && styles.filterChipActive,
                  ]}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedCategoryFilter === item.id && styles.filterChipTextActive,
                    ]}>
                    {item.name || 'Todos'}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.filterList}
              onContentSizeChange={(w) => handleCategoryContentResize(w)}
            />
            {catCanScrollRight && (
              <TouchableOpacity
                style={styles.scrollArrowRight}
                onPress={() => scrollCategoryBy('right')}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <Icon name="chevron-forward" size={20} color={primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Store filter toggle */}
      {isMultiStore && stores.length > 0 && (
        <View style={styles.storeFilterRow}>
          <TouchableOpacity
            style={styles.storeFilterToggle}
            onPress={() => setShowStoreFilter(prev => !prev)}>
            <Icon
              name="storefront-outline"
              size={16}
              color={selectedStoreFilter ? primary : theme.colors.textSecondary}
            />
            <Text style={[
              styles.storeFilterLabel,
              selectedStoreFilter && styles.storeFilterLabelActive,
            ]}>
              {selectedStoreFilter
                ? stores.find(s => s.id === selectedStoreFilter)?.name || 'Tienda'
                : 'Filtrar por tienda'}
            </Text>
            <Icon
              name={showStoreFilter ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.clearFiltersBtn}
              onPress={clearFilters}>
              <Icon name="close-circle" size={16} color={primary} />
              <Text style={styles.clearFiltersText}>Limpiar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Store filter chips dropdown */}
      {isMultiStore && showStoreFilter && stores.length > 0 && (
        <View style={styles.storeFilterContainer}>
          <View style={styles.chipScrollWrapper} onLayout={handleStoreLayout}>
            {storeCanScrollLeft && (
              <TouchableOpacity
                style={styles.scrollArrowLeft}
                onPress={() => scrollStoreBy('left')}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <Icon name="chevron-back" size={20} color={primary} />
              </TouchableOpacity>
            )}
            <FlatList
              ref={storeListRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={handleStoreScroll}
              scrollEventThrottle={16}
              data={[{id: null, name: 'Todas las tiendas'}, ...stores]}
              keyExtractor={item => `store-${item.id?.toString() || 'all'}`}
              renderItem={({item}) => (
                <TouchableOpacity
                  onPress={() => handleStoreSelect(item.id)}
                  style={[
                    styles.storeChip,
                    selectedStoreFilter === item.id && styles.storeChipActive,
                  ]}
                  activeOpacity={0.7}>
                  <Icon
                    name="storefront"
                    size={14}
                    color={selectedStoreFilter === item.id ? theme.colors.white : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.storeChipText,
                      selectedStoreFilter === item.id && styles.storeChipTextActive,
                    ]}>
                    {item.name || 'Todas'}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.filterList}
              onContentSizeChange={(w) => handleStoreContentResize(w)}
            />
            {storeCanScrollRight && (
              <TouchableOpacity
                style={styles.scrollArrowRight}
                onPress={() => scrollStoreBy('right')}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <Icon name="chevron-forward" size={20} color={primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Product list */}
      <FlatList
        data={products}
        keyExtractor={item => String(item.id)}
        renderItem={renderProductCard}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={
          products.length === 0 ? styles.emptyList : styles.listContent
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

// ─── Simple URL validator (inline to avoid import issues) ─────────────────────
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
  headerLeft: {width: 68},
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
  headerRight: {width: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4},

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

  // Search
  searchContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    height: 42,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    height: 42,
    padding: 0,
    ...Platform.select({ios: {paddingVertical: 2}}),
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

  // Product card (list row)
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
    width: 50,
    height: 50,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: theme.colors.inputBg,
  },
  cardAvatarImg: {
    width: '100%',
    height: '100%',
  },
  cardAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 2,
  },
  cardCategory: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  cardDot: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
  },
  cardStock: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  cardStockDanger: {
    color: primary,
    fontWeight: '600',
  },
  cardPrice: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: primary,
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
    width: 34,
    height: 34,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: theme.spacing.xxl,
    right: theme.spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.lg,
    elevation: 8,
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },

  // Image preview
  imagePreview: {
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
    position: 'relative',
  },
  imagePreviewThumb: {
    width: 120,
    height: 120,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.inputBg,
  },
  imagePreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },

  // Form
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  required: {
    color: primary,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.md + 2 : theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 46,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: primary,
    backgroundColor: primary + '08',
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: primary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowItem: {
    flex: 1,
  },

  // Category picker
  pickerWrapper: {
    marginTop: theme.spacing.sm,
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.md + 2 : theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 46,
  },
  pickerText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  pickerPlaceholder: {
    color: theme.colors.textLight,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: '60%',
    ...theme.shadows.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pickerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pickerList: {
    paddingHorizontal: theme.spacing.sm,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  pickerOptionSelected: {
    backgroundColor: primary + '10',
  },
  pickerOptionText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  pickerOptionTextSelected: {
    color: primary,
    fontWeight: '600',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.lg,
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
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },

  // Submit button
  submitButton: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    minHeight: 50,
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

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  chipScrollWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrowLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: theme.borderRadius.xl,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: -1, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  scrollArrowRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: theme.borderRadius.xl,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  filterList: {
    marginRight: theme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.inputBg,
    marginRight: theme.spacing.sm,
  },
  filterChipActive: {
    backgroundColor: primary,
  },
  filterChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: theme.colors.white,
  },
  // Store filter toggle
  storeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  storeFilterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  storeFilterLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  storeFilterLabelActive: {
    color: primary,
    fontWeight: '600',
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  clearFiltersText: {
    fontSize: theme.fontSize.xs,
    color: primary,
    fontWeight: '600',
  },
  storeFilterContainer: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.inputBg,
    marginRight: theme.spacing.sm,
  },
  storeChipActive: {
    backgroundColor: primary,
  },
  storeChipText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  storeChipTextActive: {
    color: theme.colors.white,
  },

  // Store selection in form
  createSection: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  sectionDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  roleCheckWrap: {
    gap: theme.spacing.sm,
  },
  roleCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  roleCheckSelected: {
    backgroundColor: primary,
    borderColor: primary,
  },
  roleCheckText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  roleCheckTextSelected: {
    color: theme.colors.white,
    fontWeight: '600',
  },

  // Multi-image gallery
  imagesSection: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    minHeight: 40,
    ...theme.shadows.sm,
  },
  uploadBtnDisabled: {
    opacity: 0.6,
  },
  uploadBtnText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    marginLeft: theme.spacing.sm,
  },
  addUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  addUrlInput: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.sm + 2 : theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 38,
  },
  addUrlButton: {
    width: 38,
    height: 38,
    borderRadius: theme.borderRadius.md,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageGalleryScroll: {
    marginBottom: theme.spacing.sm,
  },
  imageGalleryContent: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  galleryThumbWrap: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: theme.colors.border,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  galleryThumbPrimary: {
    borderColor: primary,
  },
  galleryThumb: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: primary,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: 'center',
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.white,
  },
  galleryThumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagesHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
});

export default AdminProductsScreen;
