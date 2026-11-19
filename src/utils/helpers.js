/**
 * Formatea un precio numérico a formato de moneda
 */
export const formatPrice = (price, currency = 'USD') => {
  if (price == null || isNaN(price)) return `0.00 ${currency}`;
  const formatted = price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency === 'USD' ? '$' : currency} ${formatted}`;
};

/**
 * Trunca un texto a la longitud máxima indicada
 */
export const truncateText = (text, maxLength = 80) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

/**
 * Valida si una URL es válida (compatible con React Native / Hermes).
 * Seguridad: en producción solo se acepta HTTPS — el token viaja en cada
 * request y un http:// expondría credenciales en texto plano.
 * En desarrollo se permite http:// para probar backends locales.
 */
export const isValidUrl = string => {
  if (!string || typeof string !== 'string') return false;
  const scheme = __DEV__ ? 'https?' : 'https';
  const pattern = new RegExp(`^${scheme}://([a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}(:\\d+)?(/.*)?$`);
  return pattern.test(string.trim());
};

/**
 * Normaliza una URL asegurando que tenga protocolo
 */
export const normalizeUrl = url => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

/**
 * Genera un ID único simple
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

/**
 * Formatea la fecha
 */
export const formatDate = dateString => {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
