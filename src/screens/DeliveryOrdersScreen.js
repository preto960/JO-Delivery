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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, useIsFocused} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import apiService from '@services/api';
import {formatPrice} from '@utils/helpers';
import ENV from '@config/env';
import theme from '@theme/styles';
import ConfirmModal from '@components/ConfirmModal';
import Toast from '@components/Toast';
import useThemeColors from '@hooks/useThemeColors';

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

/** Request Android location permission */
const requestLocationPermission = async (shopName = 'JO-Shop') => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Permiso de ubicacion',
        message: `${shopName} necesita acceso a tu ubicacion para mostrar la ruta de entrega.`,
        buttonNeutral: 'Preguntar despues',
        buttonNegative: 'Cancelar',
        buttonPositive: 'Permitir',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
};

/** Get current device position */
const getCurrentPosition = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation no disponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve(position.coords),
      error => reject(error),
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
    );
  });
};

// ─── Component ────────────────────────────────────────────────────────────────

const DeliveryOrdersScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const {user, logout} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  // Data state
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('available');

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Highlight state (cuando viene de notificacion)
  const [highlightOrderId, setHighlightOrderId] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
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
    [activeTab, user?.id],
  );

  useEffect(() => {
    loadOrders();
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

  const handleRefresh = useCallback(() => {
    loadOrders(true);
  }, [loadOrders]);

  const handleTabChange = useCallback(
    tabKey => {
      if (tabKey === activeTab) return;
      setActiveTab(tabKey);
      setError(null);
      setOrders([]);
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

      // Step 2: Try to get user location and route
      setRouteLoading(true);
      try {
        const hasPermission = await requestLocationPermission(config.shop_name || 'JO-Shop');
        if (hasPermission) {
          const userCoords = await getCurrentPosition();
          const userPos = {
            latitude: userCoords.latitude,
            longitude: userCoords.longitude,
          };
          setUserLocation(userPos);

          // Step 3: Fetch route
          const route = await fetchRouteDirections(userPos, coords);
          if (route) {
            setRoutePoints(route.points);
            setRouteData({
              distance: route.distance,
              duration: route.duration,
            });
            // Fit map to show both points
            const region = fitTwoPoints(userPos, coords);
            setMapRegion(region);
          }
        }
      } catch {
        // Cannot get location - just show destination marker
      } finally {
        setRouteLoading(false);
      }
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
            // Recargar lista
            setTimeout(() => loadOrders(true), 300);
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
  }, [loading, error, activeTab, loadOrders]);

  // ─── Render: Order Card ──────────────────────────────────────────────────

  const renderOrderCard = useCallback(
    ({item}) => {
      const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.confirmed;
      const isActing = actionLoading === item.id;
      const isHighlighted = highlightOrderId && String(item.id) === String(highlightOrderId);

      return (
        <Animated.View
          style={[
            styles.cardWrapper,
            isHighlighted && {
              transform: [{scale: pulseAnim}],
            },
          ]}>
        <View style={[
          styles.card,
          isHighlighted && styles.cardHighlighted,
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
                  style={[styles.actionButton, styles.mapButton]}
                  onPress={() => handleOpenMap(item.address)}
                  activeOpacity={0.8}>
                  <Icon name="map-outline" size={16} color={theme.colors.white} />
                  <Text style={styles.actionButtonText}>Mapa</Text>
                </TouchableOpacity>
              )}

              {activeTab === 'available' && item.status !== 'shipped' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={() => handleAcceptOrder(item)}
                  disabled={isActing}
                  activeOpacity={0.8}>
                  {isActing ? (
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
              <TouchableOpacity
                style={[styles.actionButton, styles.deliverButton]}
                onPress={() => handleMarkDelivered(item)}
                disabled={isActing}
                activeOpacity={0.8}>
                {isActing ? (
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
        </View>
        </Animated.View>
      );
    },
    [actionLoading, handleAcceptOrder, handleMarkDelivered, activeTab, user?.id, handleOpenMap, highlightOrderId, pulseAnim],
  );

  // ─── Render: Filter Tabs ─────────────────────────────────────────────────

  const renderFilterTabs = useCallback(() => {
    return (
      <View style={styles.tabsContainer}>
        {FILTER_TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleTabChange(tab.key)}
              activeOpacity={0.7}>
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [activeTab, handleTabChange]);

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
          <TouchableOpacity
            onPress={handleNavigateExternal}
            hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
            disabled={!mapCoords}
            style={[styles.mapNavigateBtn, !mapCoords && styles.mapBtnDisabled]}>
            <Icon name="navigate" size={20} color={mapCoords ? theme.colors.white : theme.colors.textLight} />
          </TouchableOpacity>
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
              showsUserLocation={!!userLocation}
              showsMyLocationButton={false}
              showsCompass
              showsBuildings
              showsTraffic
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

          {/* Navigate button */}
          {mapCoords && (
            <TouchableOpacity
              style={styles.navigateButton}
              onPress={handleNavigateExternal}
              activeOpacity={0.8}>
              <Icon name="navigate" size={20} color={theme.colors.white} />
              <Text style={styles.navigateButtonText}>
                Navegar con {Platform.OS === 'ios' ? 'Maps' : 'Google Maps'}
              </Text>
            </TouchableOpacity>
          )}
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

      {/* Filter Tabs */}
      {renderFilterTabs()}

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
    backgroundColor: primary,
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabLabelActive: {
    color: theme.colors.white,
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
  deliverButton: {
    backgroundColor: theme.colors.success,
  },
  actionButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.white,
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
});

export default DeliveryOrdersScreen;
