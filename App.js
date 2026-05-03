import React, {createRef, useEffect, useState, useCallback} from 'react';
import {StatusBar, StyleSheet, View, DeviceEventEmitter} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import AppNavigator from '@navigation/AppNavigator';
import {AuthProvider, useAuth} from '@context/AuthContext';
import {ConfigProvider, useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';
import pushNotifications from '@services/notifications';
import ConfirmModal from '@components/ConfirmModal';
import OneSignal from 'react-native-onesignal';
import ThemeLoader from '@components/ThemeLoader';

// Ref de navegacion accesible fuera del componente
export const navigationRef = createRef();

// ─── Mapeo de pantallas: nombre logico → ruta de navegacion real ──────────
const SCREEN_ROUTES = {
  DeliveryOrders:  { parent: 'DeliveryMainTabs', screen: 'DeliveryOrders' },
  DeliveryProfile: { parent: 'DeliveryMainTabs', screen: 'DeliveryProfile' },
  AdminDashboard:  { parent: 'AdminMainTabs',   screen: 'AdminDashboard' },
  AdminOrders:     { parent: 'AdminMainTabs',   screen: 'AdminOrders' },
  AdminProducts:   { parent: 'AdminMainTabs',   screen: 'AdminProducts' },
  AdminCategories: { parent: 'AdminMainTabs',   screen: 'AdminCategories' },
  AdminStores:    { parent: 'AdminMainTabs',   screen: 'AdminStores' },
  AdminUsers:     { parent: 'AdminMainTabs',   screen: 'AdminUsers' },
  AdminRoles:      { parent: 'AdminMainTabs',   screen: 'AdminRoles' },
};

function navigateToScreen(screenName, params = {}) {
  const route = SCREEN_ROUTES[screenName];
  const nav = navigationRef.current;
  if (!nav) {
    console.warn('[Navigation] navigationRef.current es null, no se puede navegar a', screenName);
    return;
  }

  if (!nav.getRootState || !nav.getRootState().routes || nav.getRootState().routes.length === 0) {
    console.warn('[Navigation] Navigator no esta listo aun, reintentando en 300ms...');
    setTimeout(() => navigateToScreen(screenName, params), 300);
    return;
  }

  if (route) {
    console.log('[Navigation] Navegando a', route.parent, '->', route.screen, 'params:', JSON.stringify(params));
    nav.navigate(route.parent, { screen: route.screen, params });
  } else {
    console.log('[Navigation] Navegando directo a', screenName, 'params:', JSON.stringify(params));
    nav.navigate(screenName, params);
  }
}

// Componente que maneja notificaciones push
const NotificationHandler = () => {
  const {isAuthenticated} = useAuth();
  const {config} = useConfig();
  const shopName = config.shop_name || 'JO-Delivery';
  const [initialNotification, setInitialNotification] = useState(null);

  const [notifModal, setNotifModal] = useState({
    visible: false,
    title: '',
    message: '',
    data: null,
  });

  const showNotifModal = useCallback((title, message, data) => {
    setNotifModal({visible: true, title, message, data});
  }, []);

  // Registrar callback para que el modulo de notificaciones pueda usarlo
  useEffect(() => {
    pushNotifications.setForegroundCallback(showNotifModal);
  }, [showNotifModal]);

  // ─── OneSignal SDK 4.x: Handler para notificacion abierta ────────────
  useEffect(() => {
    OneSignal.setNotificationOpenedHandler((openedEvent) => {
      const notification = openedEvent.notification;
      const additionalData = notification?.additionalData || {};

      console.log('[App] Notificacion OneSignal abierta (SDK 4.x)');
      console.log('[App] Screen:', additionalData.screen);
      console.log('[App] Data:', JSON.stringify(additionalData));

      const notifData = {
        data: additionalData,
        notification: {
          title: notification?.title,
          body: notification?.body,
        },
      };

      if (isAuthenticated && additionalData?.screen) {
        navigateToScreen(additionalData.screen, additionalData);
      } else {
        setInitialNotification(notifData);
      }
    });

    console.log('[App] OneSignal setNotificationOpenedHandler registrado');
  }, [isAuthenticated]);

  // Navegar al abrir la app desde notificacion (despues de autenticacion)
  useEffect(() => {
    if (!isAuthenticated || !initialNotification) return;

    const {data} = initialNotification;
    if (data?.screen) {
      console.log('[App] Navegando desde notificacion inicial a:', data.screen);
      const timer = setTimeout(() => {
        navigateToScreen(data.screen, data);
        setInitialNotification(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, initialNotification]);

  // Escuchar mensajes en foreground (app abierta)
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = pushNotifications.onForegroundMessage(async (remoteMessage) => {
      const data = remoteMessage?.data || {};
      const title = data.title || remoteMessage?.notification?.title || shopName;
      const body = data.body || remoteMessage?.notification?.body || '';

      if (title || body) {
        showNotifModal(title, body, data);
        DeviceEventEmitter.emit('pushNotificationReceived', data);
      }
    });

    return unsubscribe;
  }, [isAuthenticated, showNotifModal]);

  const handleNotifClose = useCallback(() => {
    setNotifModal(prev => ({...prev, visible: false}));
  }, []);

  const handleNotifConfirm = useCallback(() => {
    const {data} = notifModal;
    setNotifModal(prev => ({...prev, visible: false}));
    if (data?.screen) {
      DeviceEventEmitter.emit('pushNotificationAction', data);
      navigateToScreen(data.screen, data);
    }
  }, [notifModal]);

  return (
    <>
      <ConfirmModal
        visible={notifModal.visible}
        onClose={handleNotifClose}
        onConfirm={handleNotifConfirm}
        title={notifModal.title}
        message={notifModal.message}
        confirmText="Ver"
        cancelText="Cerrar"
        type="confirm"
        icon="notifications"
      />
    </>
  );
};

// Componente interno que accede a config para theme dinámico + loader
const AppContent = () => {
  const {config, loading} = useConfig();
  const primaryColor = config.primary_color || theme.colors.accent;

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={{
          dark: false,
          colors: {
            primary: primaryColor,
            background: theme.colors.background,
            card: theme.colors.card,
            text: theme.colors.text,
            border: theme.colors.border,
            notification: primaryColor,
          },
        }}>
        <View style={styles.container}>
          <StatusBar
            barStyle="dark-content"
            backgroundColor={theme.colors.white}
            translucent={false}
          />
          <NotificationHandler />
          <AppNavigator />
        </View>
      </NavigationContainer>
      {loading && <ThemeLoader />}
    </>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ConfigProvider>
          <AppContent />
        </ConfigProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});

export default App;
