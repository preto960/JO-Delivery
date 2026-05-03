/**
 * ============================================
 *  JO-Delivery — Environment Configuration
 * ============================================
 *
 * INSTRUCCIONES:
 * Cambia la URL de tu backend aqui antes de compilar.
 * Esta URL se usara automaticamente al iniciar la app.
 *
 * Puedes seguir cambiandola en runtime desde Ajustes,
 * pero este archivo es el valor por defecto.
 *
 * Para produccion: coloca la URL definitiva y compila.
 * Para desarrollo: cambia segun tu entorno local.
 */

const ENV = {
  // ── Cambia esta URL por la de tu backend ──
  API_URL: 'https://jo-backend-shop.vercel.app',

  // ── Configuracion general ──
  APP_NAME: 'JO-Delivery',
  APP_VERSION: '1.0.0',
  DEBUG: __DEV__,

  // ── Timeouts (en milisegundos) ──
  API_TIMEOUT: 15000,
  CONNECTION_TIMEOUT: 10000,

  // ── Credenciales demo ──
  DEMO_DELIVERY_EMAIL: 'delivery@joshop.com',
  DEMO_DELIVERY_PASSWORD: 'Delivery123',

  // ── Google Maps / Places API ──
  GOOGLE_PLACES_API_KEY: 'AIzaSyBJBdrBQpWZeH6Ceh-S5ccRj5-tO4gM6DA',
};

export default ENV;
