import React, { useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import apiService from '@services/api';
import { formatPrice } from '@utils/helpers';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';
import ConfirmModal from '@components/ConfirmModal';
import {useAuth} from '@context/AuthContext';

const STATUS_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'confirmed', label: 'Confirmados' },
  { key: 'preparing', label: 'Preparando' },
  { key: 'shipped', label: 'Enviados' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'cancelled', label: 'Cancelados' },
];

const STATUS_FLOW = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered'];

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: theme.colors.warning, icon: 'time-outline' },
  confirmed: { label: 'Confirmado', color: '#3498DB', icon: 'checkmark-circle-outline' },
  preparing: { label: 'Preparando', color: '#9B59B6', icon: 'restaurant-outline' },
  shipped: { label: 'Enviado', color: '#1ABC9C', icon: 'bicycle-outline' },
  delivered: { label: 'Entregado', color: theme.colors.success, icon: 'checkmark-done-outline' },
  cancelled: { label: 'Cancelado', color: theme.colors.accent, icon: 'close-circle-outline' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}`;
};

const AdminOrdersScreen = () => {
  const navigation = useNavigation();
  const {user, logout} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [deliveryUsers, setDeliveryUsers] = useState([]);
  const [loadingDeliveryUsers, setLoadingDeliveryUsers] = useState(false);
  const [assigningDelivery, setAssigningDelivery] = useState(false);
  const flatListRef = useRef(null);
  const [modal, setModal] = useState({visible: false, type: 'alert', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});

  // Scroll arrow states for status tabs
  const tabsScrollRef = useRef(null);
  const tabsWrapperLayout = useRef(null);
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);
  const TABS_SCROLL_AMOUNT = 160;

  const scrollTabsBy = useCallback((direction) => {
    if (!tabsScrollRef.current) return;
    tabsScrollRef.current.scrollTo({
      x: (direction === 'left' ? -TABS_SCROLL_AMOUNT : TABS_SCROLL_AMOUNT),
      animated: true,
    });
  }, []);

  const handleTabsScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setTabsCanScrollLeft(contentOffset.x > 5);
    setTabsCanScrollRight(contentOffset.x + layoutMeasurement.width < contentSize.width - 5);
  }, []);

  const handleTabsContentResize = useCallback((contentWidth) => {
    if (tabsWrapperLayout.current && contentWidth > tabsWrapperLayout.current.width) {
      setTabsCanScrollRight(true);
    }
  }, []);

  const handleTabsLayout = useCallback((event) => {
    tabsWrapperLayout.current = event.nativeEvent.layout;
  }, []);

  const fetchOrders = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
          setError(null);
        } else if (pageNum === 1) {
          setLoading(true);
          setError(null);
        } else {
          setLoadingMore(true);
        }

        const params = { page: pageNum, limit: 20 };
        if (activeTab !== 'all') {
          params.status = activeTab;
        }

        const response = await apiService.fetchOrders(params);

        if (pageNum === 1 || isRefresh) {
          setOrders(response.data);
        } else {
          setOrders((prev) => [...prev, ...response.data]);
        }

        setPage(pageNum);
        if (response.pagination) {
          setHasMore(pageNum < response.pagination.totalPages);
        } else {
          setHasMore(response.data.length >= 20);
        }
      } catch (err) {
        setError(err?.message || 'Error al cargar pedidos. Intenta de nuevo.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  const onRefresh = useCallback(() => {
    fetchOrders(1, true);
  }, [fetchOrders]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setPage(1);
    setHasMore(true);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      fetchOrders(page + 1);
    }
  };

  const handleOrderPress = (order) => {
    setSelectedOrder(order);
  };

  const handleCloseDetail = () => {
    setSelectedOrder(null);
  };

  const loadDeliveryUsers = useCallback(async () => {
    try {
      setLoadingDeliveryUsers(true);
      const res = await apiService.fetchDeliveryUsers();
      const users = Array.isArray(res) ? res : res.data || [];
      // Filter only users with delivery role
      const deliveryList = users.filter(u =>
        (u.roles || []).some(r => r.name === 'delivery'),
      );
      setDeliveryUsers(deliveryList);
    } catch {
      setDeliveryUsers([]);
    } finally {
      setLoadingDeliveryUsers(false);
    }
  }, []);

  const handleOpenAssignModal = () => {
    if (!selectedOrder) return;
    loadDeliveryUsers();
    setAssignModalVisible(true);
  };

  const handleCloseAssignModal = () => {
    setAssignModalVisible(false);
  };

  const handleAssignDelivery = async (deliveryId) => {
    if (!selectedOrder || assigningDelivery) return;

    try {
      setAssigningDelivery(true);
      const res = await apiService.assignOrderDelivery(selectedOrder.id, deliveryId);
      const updatedOrder = res.order || { ...selectedOrder, deliveryId, status: 'confirmed' };
      setSelectedOrder(updatedOrder);
      setOrders(prev =>
        prev.map(o => (o.id === selectedOrder.id ? updatedOrder : o)),
      );
      setAssignModalVisible(false);
    } catch (err) {
      setModal({visible: true, type: 'alert', title: 'Error', message: err?.message || 'No se pudo asignar el delivery.', confirmText: 'Aceptar', onConfirm: null});
    } finally {
      setAssigningDelivery(false);
    }
  };

  const handleOpenStatusModal = () => {
    if (selectedOrder) {
      setStatusModalVisible(true);
    }
  };

  const handleCloseStatusModal = () => {
    setStatusModalVisible(false);
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedOrder || updatingStatus) return;

    try {
      setUpdatingStatus(true);

      if (newStatus === 'cancelled') {
        await apiService.cancelOrder(selectedOrder.id);
      } else {
        await apiService.updateOrderStatus(selectedOrder.id, newStatus);
      }

      const updatedOrder = { ...selectedOrder, status: newStatus };
      setSelectedOrder(updatedOrder);
      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)),
      );
      setStatusModalVisible(false);
    } catch (err) {
      setError(err?.message || 'Error al actualizar estado del pedido.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getNextStatuses = (currentStatus) => {
    if (currentStatus === 'cancelled') return ['confirmed'];
    const currentIndex = STATUS_FLOW.indexOf(currentStatus);
    if (currentIndex === -1) return STATUS_FLOW;
    return STATUS_FLOW.slice(currentIndex + 1);
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Gestión de Pedidos</Text>
        </View>
        <View style={styles.headerRight}>
          {!user?.roles?.some(r => r.name === 'editor') && (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Icon name="settings-outline" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleLogout} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="log-out-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterTabsContainer}>
        <View style={styles.tabsScrollWrapper} onLayout={handleTabsLayout}>
          {tabsCanScrollLeft && (
            <TouchableOpacity
              style={styles.tabsArrowLeft}
              onPress={() => scrollTabsBy('left')}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            >
              <Icon name="chevron-back" size={20} color={primary} />
            </TouchableOpacity>
          )}
          <ScrollView
            ref={tabsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={handleTabsScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.filterTabsScroll}
            onContentSizeChange={(w) => handleTabsContentResize(w)}
          >
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const count =
                tab.key === 'all'
                  ? null
                  : orders.filter((o) => o.status === tab.key).length;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.filterTab, isActive && styles.filterTabActive]}
                  onPress={() => handleTabChange(tab.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterTabLabel,
                      isActive && styles.filterTabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {isActive && count !== null && (
                    <View style={styles.filterTabCount}>
                      <Text style={styles.filterTabCountText}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {tabsCanScrollRight && (
            <TouchableOpacity
              style={styles.tabsArrowRight}
              onPress={() => scrollTabsBy('right')}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            >
              <Icon name="chevron-forward" size={20} color={primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const renderOrderCard = ({ item }) => {
    const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => handleOrderPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.orderCardHeader}>
          <View style={styles.orderIdContainer}>
            <Text style={styles.orderIdLabel}>#{item.id}</Text>
            <Text style={styles.orderDateText}>{formatDate(item.createdAt)}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusInfo.color + '18' },
            ]}
          >
            <Icon name={statusInfo.icon} size={14} color={statusInfo.color} />
            <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        <View style={styles.orderCardBody}>
          <View style={styles.orderInfoRow}>
            <Icon name="person-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.orderInfoText} numberOfLines={1}>
              {item.customerName}
            </Text>
          </View>

          <View style={styles.orderInfoRow}>
            <Icon name="call-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.orderInfoText} numberOfLines={1}>
              {item.customerPhone}
            </Text>
          </View>

          <View style={styles.orderInfoRow}>
            <Icon name="location-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.orderInfoText} numberOfLines={1}>
              {item.customerAddr || 'Sin dirección'}
            </Text>
          </View>
        </View>

        <View style={styles.orderCardFooter}>
          <View style={styles.itemsCountContainer}>
            <Icon name="cube-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.itemsCountText}>
              {item.totalItems} producto{item.totalItems !== 1 ? 's' : ''}
            </Text>
          </View>
          <Text style={styles.orderTotalText}>{formatPrice(item.total)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderOrderDetail = () => {
    if (!selectedOrder) return null;

    const statusInfo = STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG.pending;
    const nextStatuses = getNextStatuses(selectedOrder.status);

    return (
      <Modal
        visible={!!selectedOrder}
        animationType="slide"
        transparent={false}
        onRequestClose={handleCloseDetail}
      >
        <SafeAreaView style={styles.detailContainer} edges={['top']}>
          <View style={styles.detailHeader}>
            <TouchableOpacity
              style={styles.detailCloseButton}
              onPress={handleCloseDetail}
              activeOpacity={0.7}
            >
              <Icon name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.detailTitle}>Detalle del Pedido</Text>
            <TouchableOpacity
              style={styles.detailEditButton}
              onPress={handleOpenStatusModal}
              activeOpacity={0.7}
            >
              <Text style={styles.detailEditButtonText}>Actualizar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailStatusCard}>
              <View
                style={[
                  styles.detailStatusBadge,
                  { backgroundColor: statusInfo.color },
                ]}
              >
                <Icon name={statusInfo.icon} size={22} color="#FFFFFF" />
                <Text style={styles.detailStatusText}>{statusInfo.label}</Text>
              </View>
              <Text style={styles.detailOrderId}>Pedido #{selectedOrder.id}</Text>
              <Text style={styles.detailDate}>{formatDate(selectedOrder.createdAt)}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Datos del Cliente</Text>
              <View style={styles.detailInfoCard}>
                <View style={styles.detailInfoRow}>
                  <Icon name="person-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.detailInfoText}>{selectedOrder.customerName}</Text>
                </View>
                <View style={styles.detailInfoRow}>
                  <Icon name="call-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.detailInfoText}>{selectedOrder.customerPhone}</Text>
                </View>
                <View style={styles.detailInfoRow}>
                  <Icon name="location-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={[styles.detailInfoText, styles.detailAddrText]}>
                    {selectedOrder.customerAddr || 'Sin dirección'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Productos ({selectedOrder.items?.length || 0})</Text>
              <View style={styles.detailItemsCard}>
                {(selectedOrder.items || []).map((item, index) => (
                  <View key={index} style={styles.detailItemRow}>
                    <View style={styles.detailItemInfo}>
                      <Text style={styles.detailItemName} numberOfLines={2}>
                        {item.productName}
                      </Text>
                      <Text style={styles.detailItemMeta}>
                        {formatPrice(item.productPrice)} x {item.quantity}
                      </Text>
                    </View>
                    <Text style={styles.detailItemSubtotal}>
                      {formatPrice(item.subtotal)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.detailTotalCard}>
              <Text style={styles.detailTotalLabel}>Total</Text>
              <Text style={styles.detailTotalValue}>{formatPrice(selectedOrder.total)}</Text>
            </View>

            {/* Delivery Assignment Section */}
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Repartidor asignado</Text>
              <View style={styles.detailInfoCard}>
                {selectedOrder.delivery ? (
                  <View style={styles.detailInfoRow}>
                    <Icon name="bicycle-outline" size={18} color={primary} />
                    <View style={styles.detailDeliveryInfo}>
                      <Text style={styles.detailDeliveryName}>{selectedOrder.delivery.name}</Text>
                      {selectedOrder.delivery.phone && (
                        <Text style={styles.detailDeliveryPhone}>{selectedOrder.delivery.phone}</Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.detailNoDelivery}>
                    <Icon name="bicycle-outline" size={20} color={theme.colors.textLight} />
                    <Text style={styles.detailNoDeliveryText}>
                      Sin repartidor asignado
                    </Text>
                    <TouchableOpacity
                      style={styles.detailAssignBtn}
                      onPress={handleOpenAssignModal}
                      activeOpacity={0.8}
                      disabled={selectedOrder.status === 'cancelled' || selectedOrder.status === 'delivered'}
                    >
                      <Icon name="person-add-outline" size={18} color={theme.colors.white} />
                      <Text style={styles.detailAssignBtnText}>Asignar repartidor</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {selectedOrder.delivery && (
                  <TouchableOpacity
                    style={styles.detailReassignBtn}
                    onPress={handleOpenAssignModal}
                    activeOpacity={0.8}
                    disabled={selectedOrder.status === 'cancelled' || selectedOrder.status === 'delivered'}
                  >
                    <Icon name="swap-horizontal-outline" size={16} color={primary} />
                    <Text style={styles.detailReassignBtnText}>Reasignar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={styles.detailFooter}>
            <TouchableOpacity
              style={styles.detailCancelBtn}
              onPress={() => handleUpdateStatus('cancelled')}
              disabled={selectedOrder.status === 'cancelled' || selectedOrder.status === 'delivered'}
              activeOpacity={0.7}
            >
              <Icon name="close-circle-outline" size={20} color={primary} />
              <Text style={styles.detailCancelBtnText}>Cancelar Pedido</Text>
            </TouchableOpacity>

            {nextStatuses.length > 0 && (
              <TouchableOpacity
                style={styles.detailNextStatusBtn}
                onPress={() => handleUpdateStatus(nextStatuses[0])}
                disabled={updatingStatus}
                activeOpacity={0.7}
              >
                {updatingStatus ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="arrow-forward-outline" size={20} color="#FFFFFF" />
                )}
                <Text style={styles.detailNextStatusBtnText}>
                  Marcar como {STATUS_CONFIG[nextStatuses[0]]?.label || nextStatuses[0]}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderAssignModal = () => {
    if (!selectedOrder) return null;

    return (
      <Modal
        visible={assignModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCloseAssignModal}
      >
        <TouchableOpacity
          style={styles.assignModalOverlay}
          onPress={handleCloseAssignModal}
          activeOpacity={1}
        >
          <View style={styles.assignModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.assignModalTitle}>Asignar Repartidor</Text>
            <Text style={styles.modalCurrentLabel}>
              Pedido #{selectedOrder.id} — {selectedOrder.customerName}
            </Text>

            {loadingDeliveryUsers ? (
              <ActivityIndicator size="large" color={primary} style={{ paddingVertical: 20 }} />
            ) : deliveryUsers.length === 0 ? (
              <Text style={styles.assignEmptyText}>
                No hay repartidores disponibles. Crea un usuario con el rol "delivery" desde Gestión de Usuarios.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                {deliveryUsers.map(user => {
                  const isCurrentDelivery = selectedOrder.deliveryId === user.id;
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[
                        styles.assignUserCard,
                        isCurrentDelivery && styles.assignUserCardActive,
                      ]}
                      onPress={() => handleAssignDelivery(user.id)}
                      disabled={assigningDelivery || isCurrentDelivery}
                      activeOpacity={0.8}
                    >
                      <View style={styles.assignUserAvatar}>
                        <Text style={styles.assignUserAvatarText}>
                          {(user.name || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.assignUserInfo}>
                        <Text style={styles.assignUserName}>{user.name}</Text>
                        {user.phone && (
                          <Text style={styles.assignUserPhone}>{user.phone}</Text>
                        )}
                      </View>
                      {isCurrentDelivery && (
                        <Icon name="checkmark-circle" size={22} color={primary} />
                      )}
                      {!isCurrentDelivery && assigningDelivery && (
                        <ActivityIndicator size="small" color={primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={handleCloseAssignModal}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderStatusModal = () => {
    if (!selectedOrder) return null;

    const statusInfo = STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG.pending;
    const nextStatuses = getNextStatuses(selectedOrder.status);

    return (
      <Modal
        visible={statusModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={handleCloseStatusModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={handleCloseStatusModal}
          activeOpacity={1}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Actualizar Estado del Pedido</Text>

            <View style={styles.modalCurrentStatus}>
              <Text style={styles.modalCurrentLabel}>Estado actual</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusInfo.color + '18' },
                ]}
              >
                <Icon name={statusInfo.icon} size={14} color={statusInfo.color} />
                <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>

            <Text style={styles.modalActionsLabel}>Cambiar a</Text>

            <View style={styles.modalActionsGrid}>
              {nextStatuses.map((statusKey) => {
                const info = STATUS_CONFIG[statusKey];
                return (
                  <TouchableOpacity
                    key={statusKey}
                    style={[
                      styles.modalActionBtn,
                      { borderColor: info.color + '40' },
                    ]}
                    onPress={() => handleUpdateStatus(statusKey)}
                    disabled={updatingStatus}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.modalActionIcon, { backgroundColor: info.color + '15' }]}>
                      <Icon name={info.icon} size={20} color={info.color} />
                    </View>
                    <Text style={[styles.modalActionLabel, { color: info.color }]}>
                      {info.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                <TouchableOpacity
                  style={[styles.modalActionBtn, { borderColor: primary + '40' }]}
                  onPress={() => handleUpdateStatus('cancelled')}
                  disabled={updatingStatus}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.modalActionIcon,
                      { backgroundColor: primary + '15' },
                    ]}
                  >
                    <Icon name="close-circle-outline" size={20} color={primary} />
                  </View>
                  <Text style={[styles.modalActionLabel, { color: primary }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {updatingStatus && (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={primary} />
                <Text style={styles.modalLoadingText}>Actualizando estado...</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={handleCloseStatusModal}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="receipt-outline" size={64} color={theme.colors.border} />
      <Text style={styles.emptyTitle}>No hay pedidos</Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'all'
          ? 'Aún no hay pedidos registrados.'
          : `No hay pedidos ${STATUS_CONFIG[activeTab]?.label?.toLowerCase() || ''} en este momento.`}
      </Text>
      <TouchableOpacity style={styles.emptyRetryBtn} onPress={onRefresh} activeOpacity={0.7}>
        <Icon name="refresh" size={18} color={primary} />
        <Text style={styles.emptyRetryBtnText}>Actualizar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.errorContainer}>
      <Icon name="alert-circle-outline" size={64} color={primary} />
      <Text style={styles.errorTitle}>Algo salió mal</Text>
      <Text style={styles.errorSubtitle}>{error}</Text>
      <TouchableOpacity style={styles.errorRetryBtn} onPress={onRefresh} activeOpacity={0.7}>
        <Icon name="refresh" size={18} color="#FFFFFF" />
        <Text style={styles.errorRetryBtnText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        {renderHeader()}
        <View style={styles.fullLoader}>
          <ActivityIndicator size="large" color={primary} />
          <Text style={styles.loadingText}>Cargando pedidos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header fijo (fuera del FlatList) */}
      {renderHeader()}
      <FlatList
        ref={flatListRef}
        data={orders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderOrderCard}
        ListEmptyComponent={error ? renderErrorState() : renderEmptyState()}
        contentContainerStyle={[
          styles.listContent,
          orders.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primary}
            colors={[primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadMoreContainer}>
              <ActivityIndicator size="small" color={primary} />
              <Text style={styles.loadMoreText}>Cargando más pedidos...</Text>
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      {renderOrderDetail()}
      {renderStatusModal()}
      {renderAssignModal()}
      <ConfirmModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.confirmText}
        onClose={() => setModal(prev => ({...prev, visible: false}))}
        onConfirm={() => {
          if (modal.onConfirm) modal.onConfirm();
          else setModal(prev => ({...prev, visible: false}));
        }}
      />
    </SafeAreaView>
  );
};

const createStyles = (primary) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  fullLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: theme.colors.textSecondary,
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
  headerRight: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  filterTabsContainer: {
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabsScrollWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabsArrowLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: theme.borderRadius.xl,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: -1, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  tabsArrowRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: theme.borderRadius.xl,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  filterTabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    paddingRight: 44, // Espacio extra para la flecha derecha
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBg,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: primary,
  },
  filterTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  filterTabLabelActive: {
    color: '#FFFFFF',
  },
  filterTabCount: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  filterTabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  listContentEmpty: {
    flex: 1,
  },
  orderCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  orderIdContainer: {
    gap: 2,
  },
  orderIdLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  orderDateText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderCardBody: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  orderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderInfoText: {
    fontSize: 13,
    color: theme.colors.text,
    flex: 1,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  itemsCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemsCountText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  orderTotalText: {
    fontSize: 16,
    fontWeight: '700',
    color: primary,
  },
  loadMoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
  emptyRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: primary + '12',
  },
  emptyRetryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: primary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  errorSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: primary,
  },
  errorRetryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  detailEditButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: primary,
  },
  detailEditButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 100,
  },
  detailStatusCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  detailStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  detailStatusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailOrderId: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  detailSection: {
    gap: 8,
  },
  detailSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    paddingHorizontal: 4,
  },
  detailInfoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  detailInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailInfoText: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  detailAddrText: {
    flexWrap: 'wrap',
  },
  detailItemsCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailItemInfo: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  detailItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  detailItemMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  detailItemSubtotal: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailTotalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  detailTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: primary,
  },
  detailFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 12,
  },
  detailCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: primary + '12',
    flex: 1,
    justifyContent: 'center',
  },
  detailCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: primary,
  },
  detailNextStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: primary,
    flex: 1,
    justifyContent: 'center',
  },
  detailNextStatusBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  modalCurrentStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalCurrentLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  modalActionsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  modalActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: theme.colors.background,
    flex: 1,
    minWidth: '45%',
  },
  modalActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  modalLoadingText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  modalCloseBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.inputBg,
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  // Delivery assignment
  detailDeliveryInfo: {
    flex: 1,
    gap: 2,
  },
  detailDeliveryName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailDeliveryPhone: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  detailNoDelivery: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  detailNoDeliveryText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  detailAssignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: primary,
    marginTop: 4,
  },
  detailAssignBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailReassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: primary + '12',
    marginTop: 12,
  },
  detailReassignBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: primary,
  },
  // Assign modal
  assignModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  assignModalContent: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '60%',
  },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  assignUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  assignUserCardActive: {
    borderColor: primary,
    backgroundColor: primary + '08',
  },
  assignUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignUserAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: primary,
  },
  assignUserInfo: {
    flex: 1,
    gap: 2,
  },
  assignUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  assignUserPhone: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  assignEmptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default AdminOrdersScreen;
