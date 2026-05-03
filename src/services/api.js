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

// ==================== AUTH ====================

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

// ==================== ORDERS (DELIVERY) ====================

// Orders list
const fetchOrders = async (params = {}) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/orders', {params});
};

// Update order status
const updateOrderStatus = async (orderId, status) => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.put(`/orders/${orderId}/status`, {status});
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

// ==================== SYSTEM CONFIG ====================

const fetchSystemConfig = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/config');
};

// Aliases for backward compatibility
const fetchConfig = fetchSystemConfig;

// ==================== BANNERS ====================

const fetchBanners = async () => {
  const api = await createApiClient();
  if (!api) throw new Error('No hay URL del servidor configurada');
  return api.get('/banners');
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

const apiService = {
  getApiConfig,
  saveApiConfig,
  clearApiConfig,
  setAuthToken,
  createApiClient,
  checkConnection,
  // Orders (Delivery)
  fetchOrders,
  updateOrderStatus,
  fetchAvailableOrders,
  acceptOrder,
  // System config
  fetchSystemConfig,
  fetchConfig,
  // Banners
  fetchBanners,
  // Addresses
  fetchAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};

export default apiService;
