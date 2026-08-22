import React, {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Linking,
  Modal,
  Platform,
  PermissionsAndroid,
  Animated,
  DeviceEventEmitter,
  Switch,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, useIsFocused} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import apiService from '@services/api';
import {
  getPusherClient,
  subscribeToUserChannel,
  unsubscribeFromUserChannel,
} from '@services/pusher';
import {formatPrice} from '@utils/helpers';
import ENV from '@config/env';
import theme from '@theme/styles';
import ConfirmModal from '@components/ConfirmModal';
import Toast from '@components/Toast';
import useThemeColors from '@hooks/useThemeColors';
import {startTracking, stopTracking, isTracking} from '@services/tracking';

// ─── Status Configuration ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: 'Pendiente',
    color: theme.colors.warning,
    icon: 'time-outline',
  },
  confirmed: {
    label: 'Disponible',
    color: '#3498DB',
    icon: 'checkmark-circle-outline',
  },
  shipped: {
    label: 'En camino',
    color: '#1ABC9C',
    icon: 'bicycle-outline',
  },
  delivered: {
    label: 'Entregado',
    color: theme.colors.success,
    icon: 'checkmark-done-outline',
  },
};

const FILTER_TABS = [
  {key: 'available', label: 'Disponibles'},
  {key: 'my_deliveries', label: 'Mis entregas'},
  {key: 'delivered', label: 'Entregados'},
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = dateStr => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}`;
};

// ─── Google Maps API Helpers ──────────────────────────────────────────────────

const geocodeAddress = async address => {
  try {
    const apiKey = ENV.GOOGLE_PLACES_API_KEY;
    if (!apiKey || !address) return null;
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&language=es`,
    );
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const {lat, lng} = data.results[0].geometry.location;
      return {latitude: lat, longitude: lng};
    }
    return null;
  } catch {
    return null;
  }
};

const fetchRouteDirections = async (origin, destination) => {
  try {
    const apiKey = ENV.GOOGLE_PLACES_API_KEY;
    if (!apiKey || !origin || !destination) return null;
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&key=${apiKey}&language=es`,
    );
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const leg = route.legs[0];
      return {
        points: decodePolyline(route.overview_polyline.points),
        distance: leg.distance.text,
        duration: leg.duration.text,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
      };
    }
    return null;
  } catch {
    return null;
  }
};

/** Decode Google's encoded polyline into array of {latitude, longitude} */
const decodePolyline = encoded => {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({latitude: lat / 1e5, longitude: lng / 1e5});
  }
  return points;
};

/** Fit map region to show two points with padding */
const fitTwoPoints = (pointA, pointB) => {
  const padding = 0.01;
  const minLat = Math.min(pointA.latitude, pointB.latitude) - padding;
  const maxLat = Math.max(pointA.latitude, pointB.latitude) + padding;
  const minLng = Math.min(pointA.longitude, pointB.longitude) - padding;
  const maxLng = Math.max(pointA.longitude, pointB.longitude) + padding;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat,
    longitudeDelta: maxLng - minLng,
  };
};

/** Request Android location permission and ensure system location is enabled */
const requestLocationPermission = async (shopName = 'JO-Shop') => {
  if (Platform.OS !== 'android') return true;
  try {
    // Step 1: Request app permission
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Permiso de ubicacion',
        message: `${shopName} necesita acceso a tu ubicacion para mostrar la ruta de entrega.`,
        buttonNeutral: 'Preguntar despues',
        buttonNegative: 'Cancelar',
        buttonPositive: 'Aceptar',
      },
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;

    // Step 2: Check if system location is enabled, if not prompt with native dialog
    try {
      const {promptForEnableLocationIfNeeded} = require('react-native-location-enabler');
      await promptForEnableLocationIfNeeded();
      return true;
    } catch (e) {
      // User cancelled or module not available
      console.warn('[Location] promptForEnableLocationIfNeeded:', e?.message);
      return false;
    }
  } catch {
    return false;
  }
};

/** Prompt user to enable system location with multiple fallback methods */
const promptEnableLocation = () => {
  return new Promise(resolve => {
    Alert.alert(
      'Ubicacion desactivada',
      'Para mostrar tu posicion y la ruta necesitas activar la ubicacion del telefono.\n\nVe a: Ajustes > Ubicacion > activarla',
      [
        {text: 'Cerrar', style: 'cancel', onPress: () => resolve(false)},
        {
          text: 'Ir a Ajustes',
          onPress: async () => {
            // Try multiple methods to open location settings (Xiaomi/Redmi compatible)
            let opened = false;
            const methods = [
              () => Linking.openURL('android.settings.LOCATION_SOURCE_SETTINGS'),
              () => Linking.openURL('settings:navigation'),
              () => Linking.openSettings(),
            ];
            for (const method of methods) {
              try {
                await method();
                opened = true;
                break;
              } catch {}
            }
            if (!opened) {
              Alert.alert('Ajustes manuales', 'Ve a Ajustes > Ubicacion y activa la ubicacion.');
            }
            resolve(true);
          },
        },
      ],
    );
  });
};

/** Get current device position (fallback) */
const getCurrentPosition = () => {
  return new Promise((resolve, reject) => {
    try {
      const Geolocation = require('@react-native-community/geolocation');
      Geolocation.getCurrentPosition(
        position => resolve(position.coords),
        error => reject(error),
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 5000},
      );
    } catch {
      reject(new Error('Geolocation no disponible'));
    }
  });
};

/** Fetch route once we have user location from MapView */
const fetchRouteOnceReady = async (userPos, mapCoords, setRoutePoints, setRouteData, setUserLocation, setMapRegion) => {
  if (!userPos || !mapCoords) return;
  setUserLocation(userPos);
  const route = await fetchRouteDirections(userPos, mapCoords);
  if (route) {
    setRoutePoints(route.points);
    setRouteData({ distance: route.distance, duration: route.duration });
    const region = fitTwoPoints(userPos, mapCoords);
    setMapRegion(region);
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

const DeliveryOrdersScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const {user, logout, fetchProfile, token} = useAuth();
  const {config} = useConfig();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  // Online status
  const isDeliveryOnline = user?.isOnline || false;
  const [localOnline, setLocalOnline] = useState(isDeliveryOnline);
  const [onlineLoading, setOnlineLoading] = useState(false);
  // Si user ya existe (restaurado de AsyncStorage o login), considerar sincronizado.
  // Esto evita que se carguen ordenes mientras espera fetchProfile.
  const [onlineSynced, setOnlineSynced] = useState(user !== null);

  // Sincronizar con el user del contexto (tras fetchProfile)
  useEffect(() => {
    if (user?.isOnline !== undefined) {
      const wasUnsynced = !onlineSynced;
      setLocalOnline(user.isOnline);
      setOnlineSynced(true);
      // Al sincronizarse y estar online, asegurar que Disponibles este seleccionado
      if (wasUnsynced && user.isOnline) {
        setActiveTab('available');
      }
    }
  }, [user?.isOnline]);

  const handleToggleOnline = useCallback(async (value) => {
    if (onlineLoading) return;

    if (!value) {
      // Verificar si tiene ordenes en curso (shipped) antes de desconectar
      try {
        setOnlineLoading(true);
        const res = await apiService.fetchOrders({status: 'shipped'});
        const allShipped = Array.isArray(res) ? res : res?.data || [];
        const myShipped = allShipped.filter(o => o.deliveryId === user?.id || o.delivery?.id === user?.id);
        setOnlineLoading(false);

        if (myShipped.length > 0) {
          const orderLines = myShipped.map(o => '#' + o.id).join(', ');
          const msg = myShipped.length === 1
            ? 'Tienes ' + myShipped.length + ' orden en curso (' + orderLines + ') que no ha sido entregada. Debes completar la entrega antes de desconectarte.'
            : 'Tienes ' + myShipped.length + ' ordenes en curso (' + orderLines + ') que no han sido entregadas. Debes completar las entregas antes de desconectarte.';

          setConfirmModal({
            visible: true, type: 'danger', title: 'No puedes desconectarte',
            message: msg,
            confirmText: 'Ver mis entregas',
            onConfirm: () => {
              setConfirmModal({visible: false, type: 'confirm', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});
              const ids = myShipped.map(o => String(o.id));
              pendingHighlightRef.current = ids[0];
              setHighlightMultiple(ids);
              if (activeTab !== 'my_deliveries') {
                // Si no estamos en Mis entregas, cambiar de tab.
                // NO llamar loadOrders aqui porque usa activeTab del closure (el viejo).
                // El useEffect de loadOrders se disparara al cambiar activeTab.
                setActiveTab('my_deliveries');
              }
              // Si ya estamos en my_deliveries, solo aplicar highlight (no recargar)
            },
          });
          return;
        }
      } catch {
        setOnlineLoading(false);
      }

      setConfirmModal({
        visible: true, type: 'danger', title: 'Desconectarse',
        message: 'Si te desconectas, no recibirás notificaciones de nuevos pedidos.',
        confirmText: 'Desconectarse',
        onConfirm: () => {
          setConfirmModal({visible: false, type: 'confirm', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});
          setOnlineLoading(true);
          apiService.updateOnlineStatus(false)
            .then(async () => {
              setLocalOnline(false);
              await fetchProfile();
            })
            .catch(() => { setLocalOnline(true); })
            .finally(() => { setOnlineLoading(false); });
        },
      });
      return;
    }

    setOnlineLoading(true);
    apiService.updateOnlineStatus(true)
      .then(async () => {
        setLocalOnline(true);
        setActiveTab('available');
        await fetchProfile();
      })
      .catch(() => { setLocalOnline(false); })
      .finally(() => { setOnlineLoading(false); });
  }, [onlineLoading, fetchProfile, user?.id, loadOrders]);

  // Data state
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('available');

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Highlight state (cuando viene de notificacion)
  const [highlightOrderId, setHighlightOrderId] = useState(null);
  const [highlightMultiple, setHighlightMultiple] = useState([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Animacion de parpadeo para alert highlight
  const alertBlinkAnim = useRef(new Animated.Value(0)).current;
  // Ref para highlight pendiente (espera a que la lista se refresque)
  const pendingHighlightRef = useRef(null);

  // Action state
  const [actionLoading, setActionLoading] = useState(null);

  // Modal state
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    type: 'confirm',
    title: '',
    message: '',
    confirmText: 'Aceptar',
    onConfirm: null,
  });

  // Toast state
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  // Map modal state
  const [mapModal, setMapModal] = useState({
    visible: false,
    address: '',
  });

  // Native map state
  const [mapCoords, setMapCoords] = useState(null);
  const [mapRegion, setMapRegion] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);

  const flatListRef = useRef(null);
  const mapViewRef = useRef(null);
  const userLocationRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({visible: true, message, type});
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({...prev, visible: false}));
  }, []);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadOrders = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        // Si esta desconectado y ya se sincronizo, no consultar pedidos
        if (onlineSynced && !localOnline) {
          setOrders([]);
          return;
        }

        let data;
        if (activeTab === 'available') {
          // Pedidos disponibles (sin asignar)
          const res = await apiService.fetchAvailableOrders();
          data = Array.isArray(res) ? res : res?.data || [];
        } else if (activeTab === 'my_deliveries') {
          // Mis entregas (asignados a mí que no están entregados)
          const res = await apiService.fetchOrders({status: 'shipped'});
          const allOrders = Array.isArray(res) ? res : res?.data || [];
          data = allOrders.filter(o => o.deliveryId === user?.id || o.delivery?.id === user?.id);
        } else {
          // Entregados por mí
          const res = await apiService.fetchOrders({status: 'delivered'});
          const allOrders = Array.isArray(res) ? res : res?.data || [];
          data = allOrders.filter(o => o.deliveryId === user?.id || o.delivery?.id === user?.id);
        }

        const normalized = data.map(order => ({
          id: order.id,
          orderNumber: order.id,
          customerName:
            order.customerName ||
            order.user?.name ||
            'Cliente',
          customerPhone:
            order.customerPhone ||
            order.user?.phone ||
            '',
          address:
            order.customerAddr || order.address || '',
          items: order.items || [],
          totalItems: order.totalItems || order.items?.length || 0,
          total: order.total || 0,
          status: order.status || 'confirmed',
          createdAt: order.createdAt || null,
          deliveryId: order.deliveryId || order.delivery?.id || null,
        }));

        setOrders(normalized);
      } catch (err) {
        setError(
          err?.message || 'Error al cargar los pedidos. Intenta de nuevo.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, user?.id, localOnline, onlineSynced],
  );

  // Carga inicial con pantalla completa, cambios de tab solo refrescan datos
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadOrders(); // Carga inicial: muestra loading screen completo
    } else {
      loadOrders(true); // Cambios de tab: solo refresh spinner en datos
    }
  }, [loadOrders]);

  // Manejar params de notificacion: highlightOrderId
  useEffect(() => {
    const orderId = route.params?.highlightOrderId;
    if (orderId) {
      // Cambiar a tab de disponibles si no esta en esa tab
      if (activeTab !== 'available') {
        setActiveTab('available');
      }
      setHighlightOrderId(orderId);
      // Limpiar params para no re-procesar
      navigation.setParams({highlightOrderId: null});
    }
  }, [route.params?.highlightOrderId]);

  // Refrescar cuando la pantalla obtiene foco
  useEffect(() => {
    if (isFocused) {
      loadOrders(true);
    }
  }, [isFocused]);

  // Refrescar automaticamente cuando llega una notificacion push (estando en esta pantalla)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('pushNotificationReceived', (data) => {
      const type = data?.type;
      if (type === 'new_order' || type === 'delivery_assigned') {
        loadOrders(true);
      }
    });
    return () => subscription.remove();
  }, [loadOrders]);

  // Escuchar mensajes de chat de orden via Pusher (canal de usuario)
  useEffect(() => {
    if (!token || !user?.id) return;

    const pusher = getPusherClient(token);
    const channel = subscribeToUserChannel(pusher, user.id);
    if (!channel) return;

    channel.bind('order-message', (data) => {
      const senderName = data?.senderName || 'Cliente';
      const orderId = data?.orderId;
      setConfirmModal({
        visible: true,
        type: 'confirm',
        title: 'Nuevo mensaje',
        message: `${senderName} te escribio en la orden #${String(orderId || '').slice(-6)}`,
        confirmText: 'Ver',
        cancelText: 'Cancelar',
        onConfirm: () => {
          if (orderId) {
            // Switch to my_deliveries tab since the order is assigned to this delivery
            setActiveTab('my_deliveries');
            navigation.navigate('Chat', {
              orderId: orderId,
              orderNumber: String(orderId).slice(-6).toUpperCase(),
              otherUserName: senderName,
            });
          }
        },
      });
    });

    return () => {
      channel.unbind('order-message');
      unsubscribeFromUserChannel(pusher, user.id);
    };
  }, [token, user?.id]);

  // Escuchar accion del boton "Ver" del modal de notificacion (cuando ya estamos en esta pantalla)
  // PRIMERO refresca la lista, LUEGO aplica el highlight/parpadeo
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('pushNotificationAction', (data) => {
      if (data?.screen === 'DeliveryOrders' && data?.highlightOrderId) {
        const targetId = String(data.highlightOrderId);
        console.log('[DeliveryOrders] pushNotificationAction: refrescando primero, luego highlight', targetId);
        // Guardar target para highlight DESPUES del refresh
        pendingHighlightRef.current = targetId;
        // Asegurar que la tab sea 'available' para que la orden sea visible
        setActiveTab('available');
        // Refrescar datos para tener la lista actualizada
        loadOrders(true);
      }
    });
    return () => subscription.remove();
  }, [loadOrders]);

  // Cuando orders se actualizan y hay un highlight pendiente, aplicarlo
  // Esto asegura que el parpadeo ocurra DESPUES de que la lista este actualizada
  useEffect(() => {
    const targetId = pendingHighlightRef.current;
    if (!targetId || orders.length === 0) return;

    pendingHighlightRef.current = null;  // Limpiar para no repetir
    console.log('[DeliveryOrders] Lista actualizada - aplicando highlight a', targetId);
    setHighlightOrderId(targetId);
  }, [orders]);

  // Animacion de pulso para la orden resaltada
  useEffect(() => {
    if (!highlightOrderId) return;

    const animation = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.03,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]);

    Animated.loop(animation, {iterations: 4}).start(() => {
      setHighlightOrderId(null);
    });

    // Scroll hasta la orden resaltada
    setTimeout(() => {
      const idx = orders.findIndex(o => String(o.id) === String(highlightOrderId));
      console.log('[DeliveryOrders] Scroll a highlight - idx:', idx, 'total:', orders.length);
      if (idx >= 0 && flatListRef.current) {
        try {
          flatListRef.current.scrollToIndex({index: idx, animated: true, viewPosition: 0.3});
        } catch {
          flatListRef.current.scrollToOffset({offset: idx * 220, animated: true});
        }
      }
    }, 600);
  }, [highlightOrderId, orders]);

  // Animacion de parpadeo para highlightMultiple (alert border)
  useEffect(() => {
    if (highlightMultiple.length === 0) {
      alertBlinkAnim.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(alertBlinkAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(alertBlinkAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [highlightMultiple]);

  // ─── GPS Tracking: auto-start for active shipped orders ──────────────

  // When orders load and there are shipped orders assigned to this driver,
  // automatically start tracking the first one.
  useEffect(() => {
    if (!isFocused || !localOnline || !onlineSynced) return;

    const shippedOrders = orders.filter(
      o => o.status === 'shipped' && o.deliveryId === user?.id,
    );

    if (shippedOrders.length > 0 && !isTracking()) {
      startTracking(shippedOrders[0].id).catch(() => {});
    } else if (shippedOrders.length === 0 && isTracking()) {
      // No active shipments but tracking is running — stop it
      stopTracking();
    }
  }, [orders, isFocused, localOnline, onlineSynced, user?.id]);

  // Cleanup: stop tracking when screen unmounts
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  // Limpiar highlightMultiple despues de 8 segundos
  useEffect(() => {
    if (highlightMultiple.length === 0) return;
    const timer = setTimeout(() => {
      setHighlightMultiple([]);
    }, 8000);
    return () => clearTimeout(timer);
  }, [highlightMultiple]);

  const handleRefresh = useCallback(() => {
    loadOrders(true);
  }, [loadOrders]);

  const handleTabChange = useCallback(
    tabKey => {
      if (tabKey === activeTab) return;
      setActiveTab(tabKey);
      setError(null);
      setOrders([]);
      setHighlightMultiple([]);
      flatListRef.current?.scrollToOffset({offset: 0, animated: true});
    },
    [activeTab],
  );

  // ─── Map Actions ─────────────────────────────────────────────────────────

  const handleOpenMap = useCallback(async (address) => {
    if (!address) return;

    // Open modal immediately
    setMapModal({visible: true, address});
    setMapCoords(null);
    setMapRegion(null);
    setRouteData(null);
    setRoutePoints([]);
    setUserLocation(null);
    setMapLoading(true);

    // Step 1: Geocode the delivery address
    const coords = await geocodeAddress(address);

    if (coords) {
      setMapCoords(coords);
      setMapRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      });

      // Step 2: Request permission and let MapView handle GPS via showsUserLocation
      setRouteLoading(true);
      try {
        await requestLocationPermission(config?.shop_name || 'JO-Shop');
      } catch {
      } finally {
        setRouteLoading(false);
      }
      // Route will be fetched via useEffect once both userLocation and mapCoords are ready
    } else {
      // Geocoding failed, show error in map
      setMapLoading(false);
    }

    setMapLoading(false);
  }, []);

  const handleCloseMap = useCallback(() => {
    setMapModal({visible: false, address: ''});
    setMapCoords(null);
    setMapRegion(null);
    setRouteData(null);
    setRoutePoints([]);
    setUserLocation(null);
  }, []);

  const handleNavigateExternal = useCallback(() => {
    if (!mapCoords) return;
    const url = Platform.select({
      ios: `https://maps.apple.com/?daddr=${mapCoords.latitude},${mapCoords.longitude}`,
      android: `google.navigation:q=${mapCoords.latitude},${mapCoords.longitude}`,
    });
    Linking.openURL(url).catch(() => {
      // Fallback: open in browser
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${mapCoords.latitude},${mapCoords.longitude}`).catch(() => {});
    });
  }, [mapCoords]);

  const handleCenterOnDestination = useCallback(() => {
    if (!mapCoords) return;
    setMapRegion({
      latitude: mapCoords.latitude,
      longitude: mapCoords.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  }, [mapCoords]);

  const handleShowFullRoute = useCallback(() => {
    if (!userLocation || !mapCoords) return;
    const region = fitTwoPoints(userLocation, mapCoords);
    setMapRegion(region);
  }, [userLocation, mapCoords]);

  // Fetch route when both user location and destination coords are available
  const routeFetchedRef = useRef(false);
  useEffect(() => {
    if (userLocation && mapCoords && mapModal.visible && !routeFetchedRef.current) {
      routeFetchedRef.current = true;
      setRouteLoading(true);
      fetchRouteDirections(userLocation, mapCoords).then(route => {
        if (route) {
          setRoutePoints(route.points);
          setRouteData({ distance: route.distance, duration: route.duration });
          const region = fitTwoPoints(userLocation, mapCoords);
          setMapRegion(region);
        }
      }).catch(() => {}).finally(() => setRouteLoading(false));
    }
  }, [userLocation, mapCoords, mapModal.visible]);

  // Reset route flag when map closes
  useEffect(() => {
    if (!mapModal.visible) {
      routeFetchedRef.current = false;
    }
  }, [mapModal.visible]);

  // ─── Order Actions ───────────────────────────────────────────────────────

  const handleAcceptOrder = useCallback(
    order => {
      setConfirmModal({
        visible: true,
        type: 'confirm',
        title: 'Aceptar entrega',
        message: `¿Deseas aceptar la entrega del pedido #${order.id}?\n\nCliente: ${order.customerName}\nDirección: ${order.address || 'Sin dirección'}\nTotal: ${formatPrice(order.total)}`,
        confirmText: 'Aceptar entrega',
        onConfirm: async () => {
          setConfirmModal(prev => ({...prev, visible: false}));
          try {
            setActionLoading(order.id);
            await apiService.acceptOrder(order.id);
            showToast('Pedido aceptado correctamente. ¡En camino!');
            // Iniciar rastreo GPS para esta entrega
            startTracking(order.id).catch(() => {});
            // Cambiar a Mis entregas y highlight del pedido aceptado
            pendingHighlightRef.current = String(order.id);
            setHighlightOrderId(String(order.id));
            setActiveTab('my_deliveries');
          } catch (err) {
            const msg = err?.message || 'Error al aceptar el pedido';
            if (err?.response?.data?.code === 'ORDER_ALREADY_ASSIGNED') {
              showToast('Este pedido ya fue tomado por otro repartidor', 'warning');
            } else {
              showToast(msg, 'error');
            }
            loadOrders(true);
          } finally {
            setActionLoading(null);
          }
        },
      });
    },
    [loadOrders, showToast],
  );

  const handleMarkDelivered = useCallback(
    order => {
      setConfirmModal({
        visible: true,
        type: 'confirm',
        title: 'Confirmar entrega',
        message: `¿Confirmar que el pedido #${order.id} fue entregado exitosamente?`,
        confirmText: 'Sí, fue entregado',
        onConfirm: async () => {
          setConfirmModal(prev => ({...prev, visible: false}));
          try {
            setActionLoading(order.id);
            await apiService.updateOrderStatus(order.id, 'delivered');
            showToast('Entrega confirmada', 'success');
            // Detener rastreo GPS al entregar
            stopTracking();
            setTimeout(() => loadOrders(true), 300);
          } catch (err) {
            showToast(err?.message || 'Error al confirmar entrega', 'error');
            loadOrders(true);
          } finally {
            setActionLoading(null);
          }
        },
      });
    },
    [loadOrders, showToast],
  );

  const handleLogout = useCallback(() => {
    setConfirmModal({
      visible: true,
      type: 'danger',
      title: 'Cerrar sesión',
      message: `¿Cerrar sesión de ${user?.name || 'la cuenta'}?`,
      confirmText: 'Cerrar sesión',
      onConfirm: () => {
        setConfirmModal(prev => ({...prev, visible: false}));
        logout();
      },
    });
  }, [user?.name, logout]);

  // ─── Render: Empty State ─────────────────────────────────────────────────

  const renderEmpty = useCallback(() => {
    if (loading) return null;

    // Si esta desconectado (y ya se sincronizo con el servidor), mostrar mensaje
    if (onlineSynced && !localOnline) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.offlineEmptyIcon}>
            <Icon name="wifi-outline" size={48} color="#FF9800" />
          </View>
          <Text style={styles.emptyTitle}>Desconectado</Text>
          <Text style={styles.emptyText}>
            Conectate para ver y aceptar pedidos disponibles.
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Icon
            name="alert-circle-outline"
            size={56}
            color={primary}
          />
          <Text style={styles.emptyTitle}>Error al cargar</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadOrders(true)}
            activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const tabLabel = activeTab === 'available'
      ? 'disponibles'
      : activeTab === 'my_deliveries'
        ? 'en camino'
        : 'entregados';

    return (
      <View style={styles.emptyContainer}>
        <Icon name="receipt-outline" size={56} color={theme.colors.textLight} />
        <Text style={styles.emptyTitle}>Sin pedidos</Text>
        <Text style={styles.emptyText}>
          No hay pedidos {tabLabel} en este momento.
        </Text>
        {activeTab !== 'available' && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setActiveTab('available')}
            activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Ver disponibles</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [loading, error, activeTab, loadOrders, localOnline, onlineSynced]);

  // ─── Render: Order Card ──────────────────────────────────────────────────

  const renderOrderCard = useCallback(
    ({item}) => {
      const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.confirmed;
      const isActing = actionLoading === item.id;
      const isHighlighted = highlightOrderId && String(item.id) === String(highlightOrderId);
      const isAlertHighlight = highlightMultiple.includes(String(item.id));

      return (
        <Animated.View
          style={[
            styles.cardWrapper,
            isHighlighted && {
              transform: [{scale: pulseAnim}],
            },
          ]}>
        <Animated.View style={[
          styles.card,
          isHighlighted && styles.cardHighlighted,
          isAlertHighlight && styles.cardAlertHighlight,
          isAlertHighlight && {
            borderColor: alertBlinkAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['#FF572244', '#FF5722'],
            }),
            shadowOpacity: alertBlinkAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.6],
            }),
          },
        ]}>
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.orderId}>#{item.orderNumber}</Text>
              {item.createdAt && (
                <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
              )}
            </View>
            <View
              style={[
                styles.statusBadge,
                {backgroundColor: statusInfo.color + '18'},
              ]}>
              <Icon name={statusInfo.icon} size={14} color={statusInfo.color} />
              <Text style={[styles.statusBadgeText, {color: statusInfo.color}]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>

          {/* Card Body */}
          <View style={styles.cardBody}>
            <View style={styles.infoRow}>
              <Icon
                name="person-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.infoText} numberOfLines={1}>
                {item.customerName}
              </Text>
            </View>

            {item.customerPhone ? (
              <View style={styles.infoRow}>
                <Icon
                  name="call-outline"
                  size={16}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.infoText} numberOfLines={1}>
                  {item.customerPhone}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.infoRow, styles.addressRowTouchable]}
              onPress={() => handleOpenMap(item.address)}
              activeOpacity={0.7}>
              <Icon
                name="location-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.infoText} numberOfLines={2}>
                {item.address || 'Sin dirección'}
              </Text>
              <Icon
                name="navigate-outline"
                size={16}
                color={primary}
              />
            </TouchableOpacity>

            {/* Items summary */}
            {item.items && item.items.length > 0 && (
              <View style={styles.itemsSummary}>
                <Text style={styles.itemsSummaryText}>
                  {item.items.slice(0, 3).map(i => i.productName).join(', ')}
                  {item.items.length > 3 ? ` y ${item.items.length - 3} más` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Card Footer */}
          <View style={styles.cardFooter}>
            <View style={styles.footerLeft}>
              <View style={styles.itemsInfo}>
                <Icon
                  name="cube-outline"
                  size={14}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.itemsText}>
                  {item.totalItems} producto{item.totalItems !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.totalText}>{formatPrice(item.total)}</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              {item.address && activeTab === 'available' && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.mapButton,
                    !localOnline && styles.actionButtonDisabled,
                  ]}
                  onPress={() => handleOpenMap(item.address)}
                  disabled={!localOnline}
                  activeOpacity={localOnline ? 0.8 : 1}>
                  <Icon name="map-outline" size={16} color={theme.colors.white} />
                  <Text style={styles.actionButtonText}>Mapa</Text>
                </TouchableOpacity>
              )}

              {activeTab === 'available' && item.status !== 'shipped' && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.acceptButton,
                    !localOnline && styles.actionButtonDisabled,
                  ]}
                  onPress={() => handleAcceptOrder(item)}
                  disabled={isActing || !localOnline}
                  activeOpacity={localOnline ? 0.8 : 1}>
                  {(isActing || !localOnline) ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <>
                      <Icon name="bicycle-outline" size={16} color={theme.colors.white} />
                      <Text style={styles.actionButtonText}>Aceptar</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

            {item.status === 'shipped' && item.deliveryId === user?.id && (
              <>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.chatButton,
                    !localOnline && styles.actionButtonDisabled,
                  ]}
                  onPress={() => navigation.navigate('Chat', {
                    orderId: item.id,
                    orderNumber: item.orderNumber,
                    otherUserName: item.customerName || 'Cliente',
                  })}
                  disabled={!localOnline}
                  activeOpacity={localOnline ? 0.8 : 1}>
                  <Icon name="chatbubble-outline" size={16} color={theme.colors.white} />
                  <Text style={styles.actionButtonText}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.deliverButton,
                    !localOnline && styles.actionButtonDisabled,
                  ]}
                  onPress={() => handleMarkDelivered(item)}
                  disabled={isActing || !localOnline}
                  activeOpacity={localOnline ? 0.8 : 1}>
                  {(isActing || !localOnline) ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <>
                      <Icon
                        name="checkmark-done-outline"
                        size={16}
                        color={theme.colors.white}
                      />
                      <Text style={styles.actionButtonText}>Entregado</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {item.status === 'delivered' && (
              <View style={styles.deliveredBadge}>
                <Icon
                  name="checkmark-done-circle"
                  size={18}
                  color={theme.colors.success}
                />
              </View>
            )}
            </View>
          </View>
        </Animated.View>
        </Animated.View>
      );
    },
    [actionLoading, handleAcceptOrder, handleMarkDelivered, activeTab, user?.id, handleOpenMap, highlightOrderId, pulseAnim, localOnline, highlightMultiple, alertBlinkAnim],
  );

  // ─── Render: Filter Tabs ─────────────────────────────────────────────────

  const renderFilterTabs = useCallback(() => {
    // No mostrar tabs deshabilitados hasta que se sincronice con el servidor
    const isOffline = onlineSynced && !localOnline;
    return (
      <View style={styles.tabsContainer}>
        {FILTER_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive && styles.tabActive,
                isOffline && styles.tabDisabled,
              ]}
              onPress={() => {
                if (isOffline) return;
                handleTabChange(tab.key);
              }}
              activeOpacity={isOffline ? 1 : 0.7}>
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                  isOffline && styles.tabLabelDisabled,
                ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [activeTab, handleTabChange, localOnline, onlineSynced]);

  // ─── Render: Native Map Modal ────────────────────────────────────────────

  const renderMapModal = useCallback(() => (
    <Modal
      visible={mapModal.visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCloseMap}>
      <SafeAreaView style={styles.mapSafeArea} edges={['top']}>
        {/* Map Header */}
        <View style={styles.mapHeader}>
          <TouchableOpacity
            onPress={handleCloseMap}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            style={styles.mapBackBtn}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.mapTitle} numberOfLines={1}>Ubicación de entrega</Text>
          <View style={{width: 32}} />
        </View>

        {/* Map View */}
        <View style={styles.mapContainer}>
          {mapLoading && !mapCoords ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={primary} />
              <Text style={styles.mapLoadingText}>Buscando ubicación...</Text>
            </View>
          ) : mapCoords ? (
            <MapView
              ref={mapViewRef}
              provider={PROVIDER_GOOGLE}
              style={styles.mapView}
              region={mapRegion}
              onRegionChangeComplete={region => setMapRegion(region)}
              onUserLocationChange={event => {
                const coord = event?.nativeEvent?.coordinate;
                if (!coord) return;
                const pos = { latitude: coord.latitude, longitude: coord.longitude };
                userLocationRef.current = pos;
                setUserLocation(pos);
              }}
              showsUserLocation={true}
              showsMyLocationButton={false}
              showsCompass={false}
              showsBuildings
              showsTraffic={false}
              zoomControlsEnabled={false}
              toolbarEnabled={false}
              loadingEnabled
              loadingIndicatorColor={primary}>
              {/* Delivery destination marker */}
              <Marker
                coordinate={mapCoords}
                title="Entrega"
                description={mapModal.address}
                anchor={{x: 0.5, y: 1}}>
                <View style={styles.markerContainer}>
                  <View style={styles.markerPin}>
                    <Icon name="location" size={24} color={theme.colors.white} />
                  </View>
                  <View style={styles.markerShadow} />
                </View>
              </Marker>

              {/* User location marker (if we got it manually) */}
              {userLocation && (
                <Marker
                  coordinate={userLocation}
                  title="Mi ubicación"
                  anchor={{x: 0.5, y: 0.5}}
                  flat>
                  <View style={styles.userMarker}>
                    <View style={styles.userMarkerDot} />
                    <View style={styles.userMarkerPulse} />
                  </View>
                </Marker>
              )}

              {/* Route polyline */}
              {routePoints.length > 1 && (
                <Polyline
                  coordinates={routePoints}
                  strokeColor="#3498DB"
                  strokeWidth={5}
                  strokeCap="round"
                  strokeJoin="round"
                />
              )}
            </MapView>
          ) : (
            <View style={styles.mapError}>
              <Icon name="alert-circle-outline" size={48} color={theme.colors.textSecondary} />
              <Text style={styles.mapErrorText}>No se pudo encontrar la ubicación</Text>
              <TouchableOpacity
                style={styles.mapErrorBtn}
                onPress={() => {
                  if (mapModal.address) {
                    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapModal.address)}`;
                    Linking.openURL(url).catch(() => {});
                  }
                }}
                activeOpacity={0.8}>
                <Text style={styles.mapErrorBtnText}>Abrir en Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Route loading overlay */}
          {routeLoading && mapCoords && (
            <View style={styles.routeLoadingOverlay}>
              <View style={styles.routeLoadingBadge}>
                <ActivityIndicator size="small" color="#3498DB" />
                <Text style={styles.routeLoadingText}>Calculando ruta...</Text>
              </View>
            </View>
          )}

          {/* Map controls - floating buttons */}
          {mapCoords && (
            <View style={styles.mapControls}>
              <TouchableOpacity
                onPress={handleCenterOnDestination}
                style={styles.mapControlBtn}
                activeOpacity={0.7}>
                <Icon name="location" size={22} color={primary} />
              </TouchableOpacity>
              {userLocation && routePoints.length > 1 && (
                <TouchableOpacity
                  onPress={handleShowFullRoute}
                  style={[styles.mapControlBtn, {marginTop: theme.spacing.sm}]}
                  activeOpacity={0.7}>
                  <Icon name="swap-horizontal" size={22} color="#3498DB" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Bottom info panel */}
        <View style={styles.mapBottomPanel}>
          {/* Route info */}
          {routeData && (
            <View style={styles.routeInfoBar}>
              <View style={styles.routeInfoItem}>
                <Icon name="car-outline" size={16} color="#3498DB" />
                <Text style={styles.routeInfoText}>{routeData.distance}</Text>
              </View>
              <View style={styles.routeInfoDivider} />
              <View style={styles.routeInfoItem}>
                <Icon name="time-outline" size={16} color="#3498DB" />
                <Text style={styles.routeInfoText}>{routeData.duration}</Text>
              </View>
            </View>
          )}

          {/* Address row */}
          <View style={styles.mapAddressRow}>
            <Icon name="location-outline" size={18} color={primary} />
            <Text style={styles.mapAddressText} numberOfLines={2}>
              {mapModal.address}
            </Text>
          </View>

        </View>
      </SafeAreaView>
    </Modal>
  ), [mapModal, mapCoords, mapRegion, userLocation, routePoints, routeData, mapLoading, routeLoading]);

  // ─── Loading Screen ──────────────────────────────────────────────────────

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Entregas</Text>
            <Text style={styles.headerSubtitle}>Gestión de entregas</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleLogout}
              hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
              <Icon name="log-out-outline" size={22} color={primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loaderText}>Cargando entregas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Entregas</Text>
          <Text style={styles.headerSubtitle}>
            {orders.length} pedido{orders.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleRefresh}
            hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
            <Icon name="refresh" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
            <Icon name="log-out-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Online Status Toggle (sutil en header) */}
      <View style={[
        styles.onlineBar,
        localOnline ? styles.onlineBarOn : styles.onlineBarOff,
      ]}>
        <View style={styles.onlineBarInfo}>
          <View style={[
            styles.onlineBarDot,
            localOnline ? styles.onlineBarDotOn : styles.onlineBarDotOff,
          ]} />
          <Text style={[
            styles.onlineBarText,
            localOnline ? styles.onlineBarTextOn : styles.onlineBarTextOff,
          ]}>
            {localOnline ? 'En linea' : 'Desconectado'}
          </Text>
        </View>
        <Switch
          value={localOnline}
          onValueChange={handleToggleOnline}
          disabled={onlineLoading}
          trackColor={{false: '#D1D5DB', true: '#4CAF50'}}
          thumbColor={onlineLoading ? '#F5F5F5' : theme.colors.white}
          ios_backgroundColor="#D1D5DB"
        />
      </View>

      {/* Filter Tabs */}
      {renderFilterTabs()}

      {/* Offline hint banner */}
      {onlineSynced && !localOnline && (
        <View style={styles.offlineBanner}>
          <Icon name="information-circle-outline" size={14} color="#E65100" />
          <Text style={styles.offlineBannerText}>
            Conectate para ver y aceptar pedidos
          </Text>
        </View>
      )}

      {/* Orders List */}
      <FlatList
        ref={flatListRef}
        data={orders}
        keyExtractor={item => String(item.id)}
        renderItem={renderOrderCard}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          orders.length === 0 ? styles.emptyList : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[primary]}
            tintColor={primary}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />

      {/* Confirm Modal */}
      <ConfirmModal
        visible={confirmModal.visible}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        onClose={() => setConfirmModal(prev => ({...prev, visible: false}))}
        onConfirm={confirmModal.onConfirm}
      />

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      {/* Map Modal */}
      {renderMapModal()}
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const createStyles = (primary) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  headerLeft: {
    width: 68,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  headerRight: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },

  // Loading
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  loaderText: {
    marginTop: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },

  // Filter Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.inputBg,
  },
  tabActive: {
    backgroundColor: '#4CAF50',
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabLabelActive: {
    color: theme.colors.white,
    fontWeight: '600',
  },
  tabDisabled: {
    backgroundColor: theme.colors.inputBg,
    opacity: 0.5,
  },
  tabLabelDisabled: {
    color: theme.colors.textLight,
  },

  // List
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    paddingTop: theme.spacing.sm,
  },
  emptyList: {
    flexGrow: 1,
    backgroundColor: theme.colors.background,
  },

  // Empty / Error states
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  offlineEmptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  retryButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  retryButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },

  // Order Card
  cardWrapper: {
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  cardHighlighted: {
    borderColor: '#4CAF50',
    borderWidth: 2,
    shadowColor: '#4CAF50',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cardAlertHighlight: {
    borderColor: '#FF5722',
    borderWidth: 2,
    shadowColor: '#FF5722',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cardHeaderLeft: {
    gap: 2,
  },
  orderId: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  orderDate: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },
  statusBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },

  // Card Body
  cardBody: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    lineHeight: 20,
  },
  addressRowTouchable: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs + 2,
  },
  itemsSummary: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  itemsSummaryText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  itemsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  itemsText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  totalText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: primary,
  },

  // Action Buttons
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  acceptButton: {
    backgroundColor: '#1ABC9C',
  },
  mapButton: {
    backgroundColor: '#3498DB',
  },
  chatButton: {
    backgroundColor: '#3498DB',
  },
  deliverButton: {
    backgroundColor: theme.colors.success,
  },
  actionButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.white,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  deliveredBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.success + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Native Map Modal ─────────────────────────────────────────────────
  mapSafeArea: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  mapBackBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTitle: {
    flex: 1,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginHorizontal: theme.spacing.sm,
  },
  mapNavigateBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtnDisabled: {
    backgroundColor: theme.colors.border,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    backgroundColor: '#F5F5F5',
  },
  mapLoadingText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  mapError: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: '#F5F5F5',
  },
  mapErrorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  mapErrorBtn: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    ...theme.shadows.sm,
  },
  mapErrorBtnText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },

  // Map floating controls
  mapControls: {
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  // Route loading overlay
  routeLoadingOverlay: {
    position: 'absolute',
    top: theme.spacing.md,
    left: '50%',
    transform: [{translateX: -90}],
  },
  routeLoadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 20,
    ...theme.shadows.md,
  },
  routeLoadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },

  // Map markers
  markerContainer: {
    alignItems: 'center',
  },
  markerPin: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
  },
  markerShadow: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginTop: -2,
  },
  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.white,
    ...theme.shadows.md,
  },
  userMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.white,
  },
  userMarkerPulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 15,
    backgroundColor: 'rgba(66, 133, 244, 0.2)',
  },

  // Map bottom panel
  mapBottomPanel: {
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.md,
  },
  routeInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.lg,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  routeInfoText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: '#3498DB',
  },
  routeInfoDivider: {
    width: 1,
    height: 16,
    backgroundColor: theme.colors.border,
  },
  mapAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border + '60',
  },
  mapAddressText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 20,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    margin: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  navigateButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.white,
  },
  // ─── Offline Overlay Banner ──────────────────────────────────────────
  offlineBanner: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
    gap: 6,
  },
  offlineBannerText: {
    fontSize: theme.fontSize.xs,
    color: '#E65100',
    fontWeight: '500',
  },

  // ─── Online Status Bar ─────────────────────────────────────────────────
  onlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
  },
  onlineBarOn: {
    backgroundColor: '#E8F5E9',
  },
  onlineBarOff: {
    backgroundColor: '#FFF3E0',
  },
  onlineBarInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineBarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineBarDotOn: {
    backgroundColor: '#4CAF50',
  },
  onlineBarDotOff: {
    backgroundColor: '#FF9800',
  },
  onlineBarText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  onlineBarTextOn: {
    color: '#2E7D32',
  },
  onlineBarTextOff: {
    color: '#E65100',
  },
});

export default DeliveryOrdersScreen;
