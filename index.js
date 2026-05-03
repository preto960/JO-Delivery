import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// ─── OneSignal: Inicializacion del SDK ──────────────────────────────────────
// OBLIGATORIO: Debe ejecutarse ANTES de AppRegistry.registerComponent()
// react-native-onesignal@4.5.4 usa la API v4.x (OneSignal Android SDK 4.8.10)
// ─────────────────────────────────────────────────────────────────────────────

import OneSignal from 'react-native-onesignal';

// App ID de JO-Delivery en OneSignal (usar el mismo mientras se comparte backend)
const ONESIGNAL_APP_ID = 'b35bca3a-765f-4854-bd30-d0c66d421c9f';

// Logging: 0 = NONE (sin popups visibles en desarrollo)
OneSignal.setLogLevel(__DEV__ ? 0 : 3, __DEV__ ? 2 : 3);

// Inicializar el SDK de OneSignal
OneSignal.setAppId(ONESIGNAL_APP_ID);

// Solicitar permisos de notificacion al usuario
OneSignal.promptForPushNotificationsWithUserResponse();

console.log('[index.js] OneSignal inicializado correctamente (SDK 4.x)');
console.log('[index.js] App ID:', ONESIGNAL_APP_ID);

// ─── Registrar componente principal ─────────────────────────────────────────
AppRegistry.registerComponent(appName, () => App);
