import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import ENV from '@config/env';

const API_CONFIG_KEY = '@jodelivery_api_config';
let authToken = null;

const defaultConfig = {
  baseUrl: ENV.API_URL || '',
  timeout: ENV.API_TIMEOUT || 15000,
};

const getApiConfig = async () => {
  try {
    const stored = await AsyncStorage.getItem(API_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.baseUrl && parsed.baseUrl.trim() !== '') {
        return {...defaultConfig, ...parsed};
      }
    }
    return {...defaultConfig};
  } catch (error) {
    return {...defaultConfig};
  }
};

const saveApiConfig = async config => {
  try {
    await AsyncStorage.setItem(API_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
};

const clearApiConfig = async () => {
  try {
    await AsyncStorage.removeItem(API_CONFIG_KEY);
    return true;
  } catch {
    return false;
  }
};

const setAuthToken = token => {
  authToken = token;
};

const createApiClient = async () => {
  const config = await getApiConfig();

  if (!config.baseUrl) {
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Platform': 'app-delivery',
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const client = axios.create({
    baseURL: config.baseUrl,
    timeout: config.timeout,
    headers,
  });

  client.interceptors.response.use(
    response => response.data,
    error => {
      if (error.response) {
        const message =
          error.response.data?.message || error.response.data?.error;
        throw new Error(message || `Error del servidor: ${error.response.status}`);
      } else if (error.request) {
        throw new Error('No se pudo conectar al servidor. Verifica la URL.');
      } else {
        throw new Error(error.message || 'Error inesperado');
      }
    },
  );

  return client;
};

// ==================== ENDPOINTS PÚBLICOS ====================

const fetchProducts = async (params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/products', {params});
};

const fetchProductById = async productId => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get(`/products/${productId}`);
};

const fetchCategories = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/categories');
};

const fetchStores = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/stores', {params: {limit: 50, active: true}});
};

const searchProducts = async (query, params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/products/search', {params: {q: query, ...params}});
};

const createOrder = async orderData => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/orders', orderData);
};

const checkConnection = async baseUrl => {
  try {
    const url = (baseUrl && baseUrl.trim() !== '') ? baseUrl : ENV.API_URL;
    const client = axios.create({baseURL: url, timeout: ENV.CONNECTION_TIMEOUT || 10000});
    await client.get('/health');
    return {success: true, message: 'Conexión exitosa'};
  } catch {
    try {
      const url = (baseUrl && baseUrl.trim() !== '') ? baseUrl : ENV.API_URL;
      const client = axios.create({baseURL: url, timeout: ENV.CONNECTION_TIMEOUT || 10000});
      await client.get('/');
      return {success: true, message: 'Conexión exitosa'};
    } catch {
      return {success: false, message: 'No se pudo conectar. Verifica la URL.'};
    }
  }
};

// ==================== CRUD ADMIN ====================

// Products CRUD
const createProduct = async productData => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/products', productData);
};

const updateProduct = async (productId, productData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/products/${productId}`, productData);
};

const deleteProduct = async productId => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/products/${productId}`);
};

const uploadProductImage = async formData => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/products/upload-image', formData, {
    headers: {'Content-Type': 'multipart/form-data'},
  });
};

const uploadProductImages = async formData => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/products/upload-images', formData, {
    headers: {'Content-Type': 'multipart/form-data'},
  });
};

const deleteProductImage = async url => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete('/products/delete-image', {data: {url}});
};

// Categories CRUD
const createCategory = async categoryData => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/categories', categoryData);
};

const updateCategory = async (categoryId, categoryData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/categories/${categoryId}`, categoryData);
};

const deleteCategory = async categoryId => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/categories/${categoryId}`);
};

// Orders management
const fetchOrders = async (params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/orders', {params});
};

const updateOrderStatus = async (orderId, status) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/orders/${orderId}/status`, {status});
};

const cancelOrder = async orderId => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/orders/${orderId}`);
};

const fetchDashboard = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/orders/stats/dashboard');
};

// Delivery: pedidos disponibles para aceptar
const fetchAvailableOrders = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/orders/available');
};

// Delivery: aceptar pedido
const acceptOrder = async orderId => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post(`/orders/${orderId}/accept`);
};

// ==================== ROLES Y PERMISOS ====================

const fetchPermissions = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/auth/permissions');
};

const fetchRoles = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/auth/roles');
};

const createRole = async (roleData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/auth/roles', roleData);
};

const updateRole = async (roleId, roleData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/auth/roles/${roleId}`, roleData);
};

const deleteRole = async (roleId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/auth/roles/${roleId}`);
};

const fetchUsers = async (params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/auth/users', {params});
};

const updateUserRoles = async (userId, roleIds) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/auth/users/${userId}/roles`, {roleIds});
};

const grantUserPermission = async (userId, permissionId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post(`/auth/users/${userId}/permissions`, {permissionId});
};

const revokeUserPermission = async (userId, permissionId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/auth/users/${userId}/permissions/${permissionId}`);
};

// ==================== DIRECCIONES ====================

const fetchAddresses = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/addresses');
};

const createAddress = async (addressData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/addresses', addressData);
};

const updateAddress = async (addressId, addressData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/addresses/${addressId}`, addressData);
};

const setDefaultAddress = async (addressId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/addresses/${addressId}/default`);
};

const deleteAddress = async (addressId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/addresses/${addressId}`);
};

// ==================== ADMIN USER EDIT ====================

const updateUser = async (userId, userData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/auth/users/${userId}`, userData);
};

const createUser = async (userData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/auth/users', userData);
};

// ==================== SYSTEM CONFIG ====================

const fetchSystemConfig = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/config');
};

const updateSystemConfig = async (settings) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put('/config', {settings});
};

// ==================== DELIVERY CONFIG (apariencia independiente) ====================

const fetchDeliveryConfig = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/config/delivery');
};

const updateDeliveryConfig = async (settings) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put('/config/delivery', {settings});
};

// Aliases for backward compatibility
const fetchConfig = fetchSystemConfig;
const updateConfig = updateSystemConfig;

// ==================== BANNERS ====================

const uploadBanner = async (formData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/banners', formData, {
    headers: {'Content-Type': 'multipart/form-data'},
    transformRequest: data => data,
  });
};

const deleteBanner = async (imageUrl) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete('/config/upload-banner', {data: {url: imageUrl}});
};

const fetchBanners = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/banners');
};

const fetchAdminBanners = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/banners/all');
};

const deleteBannerById = async (bannerId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/banners/${bannerId}`);
};

const updateBanner = async (bannerId, formData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/banners/${bannerId}`, formData, {
    headers: {'Content-Type': 'multipart/form-data'},
    transformRequest: data => data,
  });
};

// ==================== STORES CRUD ====================

const fetchAdminStores = async (params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/stores', {params: {limit: 50, ...params}});
};

const createStore = async (storeData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/stores', storeData);
};

const updateStore = async (storeId, storeData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/stores/${storeId}`, storeData);
};

const deleteStore = async (storeId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/stores/${storeId}`);
};

// ==================== PRODUCT BATCHES CRUD ====================

const updateOnlineStatus = async (isOnline) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.patch('/auth/profile/status', {isOnline});
};

const fetchBatches = async (params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/product-batches', {params});
};

const createBatch = async (batchData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/product-batches', batchData);
};

const updateBatch = async (batchId, batchData) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/product-batches/${batchId}`, batchData);
};

const deleteBatch = async (batchId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.delete(`/product-batches/${batchId}`);
};

// ─── Tracking ───────────────────────────────────────────────────────────

const sendLocationUpdate = async (orderId, latitude, longitude) => {
  const api = await createApiClient();
  if (!api) return; // Silent fail for tracking
  return api.post('/tracking/location', {orderId, latitude, longitude});
};

const fetchLocationHistory = async (orderId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get(`/tracking/location/${orderId}`);
};

// ==================== CHAT ====================

const sendChatMessage = async (orderId, content) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post(`/chats/orders/${orderId}/messages`, {content});
};

const fetchChatMessages = async (orderId) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  const res = await api.get(`/chats/orders/${orderId}/messages`);
  // Backend returns { data: [...messages], pagination: {...} }
  if (res && res.data) {
    return { messages: res.data };
  }
  return { messages: [] };
};

// Admin Chat
const fetchAdminChatMessages = async (recipientId, senderPlatform, recipientPlatform) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  const params = {};
  if (recipientId) params.recipientId = String(recipientId);
  if (senderPlatform) params.senderPlatform = senderPlatform;
  if (recipientPlatform) params.recipientPlatform = recipientPlatform;
  return api.get('/chats/admin/messages', { params });
};

const sendAdminChatMessage = async (content, recipientId, targetPlatform) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.post('/chats/admin/messages', { content, recipientId, targetPlatform });
};

// Alias for backward compatibility
const fetchStoresAdmin = fetchAdminStores;

const apiService = {
  getApiConfig,
  saveApiConfig,
  clearApiConfig,
  setAuthToken,
  createApiClient,
  // Public endpoints
  fetchProducts,
  fetchProductById,
  fetchCategories,
  searchProducts,
  fetchStores,
  createOrder,
  checkConnection,
  // Products CRUD
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  uploadProductImages,
  deleteProductImage,
  // Categories CRUD
  createCategory,
  updateCategory,
  deleteCategory,
  // Orders
  fetchOrders,
  updateOrderStatus,
  cancelOrder,
  fetchDashboard,
  // Delivery
  fetchAvailableOrders,
  acceptOrder,
  // Roles y permisos
  fetchPermissions,
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  fetchUsers,
  updateUserRoles,
  grantUserPermission,
  revokeUserPermission,
  // Direcciones
  fetchAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  // Admin user edit & create
  updateUser,
  createUser,
  // System config
  fetchSystemConfig,
  updateSystemConfig,
  fetchConfig,
  updateConfig,
  // Delivery config (apariencia independiente)
  fetchDeliveryConfig,
  updateDeliveryConfig,
  // Banners
  uploadBanner,
  deleteBanner,
  fetchBanners,
  fetchAdminBanners,
  deleteBannerById,
  updateBanner,
  // Stores CRUD
  fetchAdminStores,
  fetchStoresAdmin,
  createStore,
  updateStore,
  deleteStore,
  // Product Batches
  fetchBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  // Online status
  updateOnlineStatus,
  // Chat
  sendChatMessage,
  fetchChatMessages,
  fetchAdminChatMessages,
  sendAdminChatMessage,
  // Tracking
  sendLocationUpdate,
  fetchLocationHistory,
};

export default apiService;
