import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from 'react';
import {AppState, AsyncStorage} from 'react-native';
import apiService from '@services/api';

const ConfigContext = createContext(null);

// Polling interval: 30 seconds
const POLL_INTERVAL = 30000;

export const ConfigProvider = ({children}) => {
  const [config, setConfig] = useState({
    delivery_name: 'JO-Delivery',
    delivery_logo_url: '',
    delivery_primary_color: '#FF6B35',
    delivery_accent_color: '#E94560',
  });
  const [loading, setLoading] = useState(true);
  const appStateRef = useRef(AppState.currentState);
  const pollTimerRef = useRef(null);
  const lastConfigRef = useRef(null);

  const loadConfig = useCallback(async () => {
    try {
      // Try loading from cache first for immediate colors on reload
      try {
        const cached = await AsyncStorage.getItem('delivery_app_config');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Object.keys(parsed).length > 0) {
            lastConfigRef.current = parsed;
            setConfig(parsed);
          }
        }
      } catch {
        // Ignore cache errors
      }

      const data = await apiService.fetchDeliveryConfig();
      // Mapear keys de delivery a nombres legibles internos
      const newConfig = {
        delivery_name: data?.delivery_name || 'JO-Delivery',
        delivery_logo_url: data?.delivery_logo_url || '',
        delivery_primary_color: data?.delivery_primary_color || '#FF6B35',
        delivery_accent_color: data?.delivery_accent_color || '#E94560',
        // Alias para compatibilidad con componentes existentes
        shop_name: data?.delivery_name || 'JO-Delivery',
        shop_logo_url: data?.delivery_logo_url || '',
        primary_color: data?.delivery_primary_color || '#FF6B35',
        accent_color: data?.delivery_accent_color || '#E94560',
      };
      lastConfigRef.current = newConfig;
      setConfig(newConfig);
      // Persist to AsyncStorage for fast reload
      try {
        await AsyncStorage.setItem('delivery_app_config', JSON.stringify(newConfig));
      } catch {
        // Ignore storage errors
      }
    } catch (err) {
      console.warn('[Config] Error loading delivery config:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (settings) => {
    try {
      // Mapear aliases a keys de delivery
      const deliverySettings = {};
      for (const [key, value] of Object.entries(settings)) {
        if (key === 'shop_name') deliverySettings.delivery_name = value;
        else if (key === 'shop_logo_url') deliverySettings.delivery_logo_url = value;
        else if (key === 'primary_color') deliverySettings.delivery_primary_color = value;
        else if (key === 'accent_color') deliverySettings.delivery_accent_color = value;
        else if (key.startsWith('delivery_')) deliverySettings[key] = value;
      }
      const result = await apiService.updateDeliveryConfig(deliverySettings);
      // Immediately update local state
      const newConfig = {...lastConfigRef.current, ...settings};
      setConfig(prev => ({...prev, ...settings}));
      lastConfigRef.current = newConfig;
      // Persist to AsyncStorage
      try {
        await AsyncStorage.setItem('delivery_app_config', JSON.stringify(newConfig));
      } catch {
        // Ignore storage errors
      }
      return result;
    } catch (err) {
      console.error('[Config] Error updating delivery config:', err.message);
      throw err;
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    loadConfig();

    pollTimerRef.current = setInterval(() => {
      loadConfig();
    }, POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [loadConfig]);

  // Also refresh when app comes back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        loadConfig();
      }
      appStateRef.current = nextAppState;
    });

    return () => subscription.remove();
  }, [loadConfig]);

  // Computed values
  const isMultiStore = config.multi_store === 'true' || config.multi_store === true;

  const value = {
    config,
    loading,
    isMultiStore,
    loadConfig,
    updateConfig,
  };

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig debe usarse dentro de un ConfigProvider');
  }
  return context;
};

export default ConfigContext;
