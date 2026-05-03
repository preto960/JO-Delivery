// ─── Servicio de Notificaciones (OneSignal SDK 4.x) ──────────────────────────
// Migrado desde Firebase Messaging + Notifee a react-native-onesignal@4.5.4
//
// API v4.x de react-native-onesignal:
//   OneSignal.setAppId()          - Inicializar
//   OneSignal.setExternalUserId() - Login
//   OneSignal.removeExternalUserId() - Logout
//   OneSignal.setNotificationOpenedHandler() - Click handler
//   OneSignal.setNotificationWillShowInForegroundHandler() - Foreground handler
//   OneSignal.getDeviceState()    - Info del dispositivo (pushToken, userId)
//   OneSignal.sendTag() / deleteTag() - Tags
//   OneSignal.promptForPushNotificationsWithUserResponse() - Permisos
//
// Este archivo mantiene la MISMA API que el anterior (Firebase) para que
// AuthContext.js y App.js funcionen sin cambios.

import {Platform} from 'react-native';
import apiService from '@services/api';
import OneSignal from 'react-native-onesignal';
import ENV from '@config/env';

// ─── CALLBACK PARA NOTIFICACIONES FOREGROUND ──────────────────────
// App.js registra un callback aqui para mostrar el modal de notificacion
let _foregroundCallback = null;

export function setForegroundCallback(callback) {
  _foregroundCallback = callback;
}

// ─── Permisos ───────────────────────────────────────────────────────────────

/**
 * Solicitar permiso de notificaciones.
 */
export async function requestNotificationPermission() {
  try {
    return new Promise((resolve) => {
      OneSignal.promptForPushNotificationsWithUserResponse((response) => {
        console.log('[Push] Permisos OneSignal:', response ? 'OTORGADOS' : 'DENEGADOS');
        resolve(response);
      });
    });
  } catch (error) {
    console.error('[Push] Error solicitando permisos:', error.message);
    return false;
  }
}

/**
 * Verificar si las notificaciones estan autorizadas
 */
export async function checkNotificationPermission() {
  try {
    const state = await OneSignal.getDeviceState();
    return state?.hasNotificationPermission || false;
  } catch {
    return false;
  }
}

/**
 * Obtener el ID del dispositivo (equivalente al FCM token).
 * En OneSignal SDK 4.x se obtiene via getDeviceState().userId
 */
export async function getFCMToken() {
  try {
    const state = await OneSignal.getDeviceState();
    const playerId = state?.userId;
    if (playerId) {
      console.log('[Push] OneSignal Player ID:', playerId);
    }
    return playerId;
  } catch (error) {
    console.error('[Push] Error obteniendo Player ID:', error.message);
    return null;
  }
}

/**
 * Registrar el dispositivo con OneSignal y el usuario en el backend.
 */
export async function registerPushToken() {
  try {
    const api = await apiService.createApiClient();
    if (!api) {
      console.log('[Push] No hay conexion al servidor');
      return false;
    }

    // Obtener el perfil para saber el userId
    let userId = null;
    try {
      const profile = await api.get('/auth/me');
      userId = profile?.id;
    } catch {
      console.log('[Push] No se pudo obtener el perfil del usuario');
      return false;
    }

    if (!userId) {
      console.log('[Push] No hay userId disponible');
      return false;
    }

    // Asociar el dispositivo con el usuario en OneSignal (SDK 4.x)
    OneSignal.setExternalUserId(String(userId), (results) => {
      if (results.pushSuccess) {
        console.log('[Push] External ID set exitoso para user', userId);
      } else {
        console.warn('[Push] External ID set fallo:', JSON.stringify(results));
      }
    });

    // Obtener el player_id y enviarlo al backend como referencia
    try {
      const state = await OneSignal.getDeviceState();
      const playerId = state?.userId;
      if (playerId) {
        await api.post('/notifications/token', {
          token: playerId,
          platform: Platform.OS,
        });
        console.log('[Push] Player ID registrado en backend');
      }
    } catch (err) {
      console.warn('[Push] Error registrando player ID en backend (no critico):', err.message);
    }

    return true;
  } catch (error) {
    console.error('[Push] Error en registerPushToken:', error.message);
    return false;
  }
}

/**
 * Desasociar el dispositivo del usuario (logout).
 */
export async function unregisterPushToken() {
  try {
    OneSignal.removeExternalUserId(() => {
      console.log('[Push] External ID removido exitosamente');
    });

    // Tambien eliminar el token del backend
    try {
      const state = await OneSignal.getDeviceState();
      const playerId = state?.userId;
      if (playerId) {
        const api = await apiService.createApiClient();
        if (api) {
          await api.delete('/notifications/token', {data: {token: playerId}});
        }
      }
    } catch {
      // No critico
    }
  } catch (error) {
    console.error('[Push] Error en unregisterPushToken:', error.message);
  }
}

/**
 * Escuchar cuando el token cambia (compatibilidad con Firebase onTokenRefresh).
 */
export function onTokenRefresh(callback) {
  // OneSignal SDK 4.x no tiene onTokenRefresh directo.
  // El pushToken se mantiene estable entre sesiones.
  return () => {};
}

/**
 * Escuchar mensajes en foreground (app abierta).
 * Convierte el evento de OneSignal al formato que App.js espera.
 */
export function onForegroundMessage(callback) {
  // Handler para notificaciones en foreground (SDK 4.x)
  OneSignal.setNotificationWillShowInForegroundHandler((event) => {
    const notification = event.notification;
    const data = notification?.additionalData || {};

    // Convertir al formato que App.js espera (simula un remoteMessage de Firebase)
    const remoteMessage = {
      data: {
        title: notification?.title || ENV.APP_NAME,
        body: notification?.body || '',
        ...data,
      },
      notification: {
        title: notification?.title,
        body: notification?.body,
      },
    };

    // Llamar al callback de App.js
    if (callback) {
      callback(remoteMessage);
    }

    // Completar el evento para mostrar la notificacion en el sistema
    // Si no se llama complete(), la notificacion NO se mostrara
    event.complete(notification);
  });

  // Retornar funcion de cleanup
  return () => {
    OneSignal.clearHandlers();
  };
}

/**
 * Obtener la notificacion inicial (app abierta desde notificacion).
 * Con OneSignal SDK 4.x, se maneja via setNotificationOpenedHandler.
 */
export async function getInitialNotification() {
  // En SDK 4.x no hay getInitialNotification directo.
  // La notificacion inicial se maneja via setNotificationOpenedHandler en App.js.
  return null;
}

/**
 * Compatibilidad: isFirebaseAvailable
 */
export const isFirebaseAvailable = () => !!OneSignal;

/**
 * Compatibilidad: ensureNotificationChannel (no es necesario con OneSignal)
 */
export async function ensureNotificationChannel() {
  console.log('[Push] OneSignal maneja los canales automaticamente');
}

export default {
  requestNotificationPermission,
  checkNotificationPermission,
  getFCMToken,
  registerPushToken,
  unregisterPushToken,
  onTokenRefresh,
  onForegroundMessage,
  getInitialNotification,
  setForegroundCallback,
  isFirebaseAvailable,
  ensureNotificationChannel,
};
