# JO-Delivery

App móvil dedicada para repartidores del sistema JO-Shop. Permite gestionar entregas, aceptar pedidos, ver rutas en mapa y más.

## Características

- Gestión de entregas (pedidos disponibles, en camino, entregados)
- Aceptar pedidos asignados
- Marcar pedidos como entregados
- Mapa con ruta de entrega (Google Maps)
- Notificaciones push en tiempo real (OneSignal)
- Perfil de usuario con autenticación en 2 pasos

## Stack Tecnológico

- React Native 0.73.6
- React Navigation 6
- Axios para API
- react-native-maps para mapas
- OneSignal para notificaciones push
- Google Maps / Places API

## Requisitos

- Node.js >= 18
- Android Studio / Xcode
- Cuenta de Google Cloud con Places API habilitada

## Instalación

```bash
npm install
# or
bun install
```

## Ejecución

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

## Variables de Entorno

Configura la URL del backend y APIs en `src/config/env.js`:

- `API_URL` — URL del backend de JO-Shop
- `GOOGLE_PLACES_API_KEY` — API key de Google Maps/Places
- `ONESIGNAL_APP_ID` — App ID de OneSignal (en `index.js`)
