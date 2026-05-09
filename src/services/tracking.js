/**
 * Background GPS location tracking service for delivery drivers.
 *
 * Watches the driver's position via navigator.geolocation.watchPosition and
 * periodically sends location updates to the backend for real-time tracking.
 *
 * Android permissions required in AndroidManifest.xml:
 *   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
 *   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
 *   (These are typically already declared by react-native-maps)
 *
 * iOS: NSLocationWhenInUseUsageDescription in Info.plist
 */

import {Platform, PermissionsAndroid} from 'react-native';
import apiService from './api';

let watchId = null;
let trackingInterval = null;
let currentOrderId = null;
let lastLocation = null;

const TRACKING_INTERVAL = 15000; // 15 seconds
const MIN_DISTANCE = 10; // minimum 10 meters between updates

// ─── Permission Helpers ──────────────────────────────────────────────────

const requestLocationPermission = async () => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Permiso de ubicación',
        message:
          'JO-Delivery necesita acceso a tu ubicación para rastrear la entrega en tiempo real.',
        buttonNeutral: 'Preguntar después',
        buttonNegative: 'Cancelar',
        buttonPositive: 'Permitir',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
};

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Start tracking location for a specific order.
 * If already tracking the same order, this is a no-op.
 * @param {string|number} orderId
 */
export async function startTracking(orderId) {
  if (currentOrderId === orderId) {
    return; // Already tracking this order
  }

  // Request permission before starting
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    console.warn('[Tracking] Location permission denied');
    return;
  }

  stopTracking(); // Stop any previous tracking
  currentOrderId = orderId;

  // Start watching position
  watchId = navigator.geolocation.watchPosition(
    position => {
      const {latitude, longitude} = position.coords;

      // Check minimum distance to avoid unnecessary API calls
      if (lastLocation) {
        const distance = getDistance(
          lastLocation.latitude,
          lastLocation.longitude,
          latitude,
          longitude,
        );
        if (distance < MIN_DISTANCE) {
          return;
        }
      }

      lastLocation = {latitude, longitude};

      // Send to backend immediately on significant position change
      apiService
        .sendLocationUpdate(orderId, latitude, longitude)
        .catch(err => {
          console.error('[Tracking] Error sending location:', err);
        });
    },
    error => {
      console.warn('[Tracking] Geolocation error:', error.message);
    },
    {
      enableHighAccuracy: true,
      distanceFilter: MIN_DISTANCE,
      interval: 5000,
      fastestInterval: 3000,
    },
  );

  // Also set up interval as fallback to ensure periodic updates
  trackingInterval = setInterval(() => {
    if (lastLocation && currentOrderId) {
      navigator.geolocation.getCurrentPosition(
        position => {
          const {latitude, longitude} = position.coords;
          lastLocation = {latitude, longitude};
          apiService
            .sendLocationUpdate(currentOrderId, latitude, longitude)
            .catch(() => {});
        },
        () => {},
        {enableHighAccuracy: true, timeout: 10000},
      );
    }
  }, TRACKING_INTERVAL);

  console.log(`[Tracking] Started tracking for order ${orderId}`);
}

/**
 * Stop all location tracking.
 * Clears the watchPosition and the fallback interval.
 */
export function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (trackingInterval !== null) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
  if (currentOrderId) {
    console.log(`[Tracking] Stopped tracking for order ${currentOrderId}`);
  }
  currentOrderId = null;
  lastLocation = null;
}

/**
 * Check if tracking is currently active.
 * @returns {boolean}
 */
export function isTracking() {
  return currentOrderId !== null;
}

/**
 * Get the currently tracked order ID.
 * @returns {string|number|null}
 */
export function getCurrentOrderId() {
  return currentOrderId;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────

/**
 * Haversine formula to calculate distance in meters between two coordinates.
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}
