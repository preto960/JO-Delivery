import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Share,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import apiService from '@services/api';
import theme from '@theme/styles';
import ENV from '@config/env';
import ConfirmModal from '@components/ConfirmModal';
import useThemeColors from '@hooks/useThemeColors';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

const ProfileScreen = () => {
  const {user, isAdmin, hasRole, logout, fetchProfile, send2FACode, verify2FASetup, setupTOTP, enableTOTP, generateBackupCodes} = useAuth();
  const {isMultiStore} = useConfig();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const [loggingOut, setLoggingOut] = useState(false);

  // 2FA state machine: idle → confirming → verifying → idle
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled || false);
  const [twoFaStep, setTwoFaStep] = useState('idle'); // 'idle' | 'confirming' | 'verifying' | 'setup-totp' | 'verify-totp' | 'backup-codes' | 'choose-method'
  const [twoFaAction, setTwoFaAction] = useState(null); // 'enable' | 'disable'
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState('');
  const [twoFaOtp, setTwoFaOtp] = useState(['', '', '', '', '', '']);
  const [twoFaResendCooldown, setTwoFaResendCooldown] = useState(0);
  const twoFaInputRefs = useRef([]);
  const mountedRef = useRef(true);

  // TOTP-specific state
  const [twoFaMethod, setTwoFaMethod] = useState(null); // 'email' | 'totp'
  const [totpQrCode, setTotpQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpBackupCodes, setTotpBackupCodes] = useState([]);
  const [backupCodesConfirmed, setBackupCodesConfirmed] = useState(false);
  const [generatingBackupCodes, setGeneratingBackupCodes] = useState(false);
  const totpInputRefs = useRef([]);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({phone: '', birthdate: ''});
  const [saving, setSaving] = useState(false);

  // Addresses state
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);

  // Address CRUD modal
  const [addrModalVisible, setAddrModalVisible] = useState(false);
  const [addrForm, setAddrForm] = useState({
    label: '',
    address: '',
    city: '',
    notes: '',
    lat: null,
    lng: null,
  });
  const [addrSaving, setAddrSaving] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState(null);

  // Google Places
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [placeResults, setPlaceResults] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);

  // ConfirmModal state
  const [modal, setModal] = useState({
    visible: false,
    type: 'alert',
    title: '',
    message: '',
    confirmText: 'Aceptar',
    onConfirm: null,
  });

  const isStaff = hasRole('admin') || hasRole('editor');
  const isCustomer = hasRole('customer');
  const isDeliveryRole = hasRole('delivery');

  // ─── Load addresses ───────────────────────────────────────────────────

  const loadAddresses = useCallback(async () => {
    try {
      setAddressesLoading(true);
      const res = await apiService.fetchAddresses();
      const list = res.data || res || [];
      setAddresses(Array.isArray(list) ? list : []);
    } catch {
      // Non-critical
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCustomer || isDeliveryRole) {
      loadAddresses();
    }
  }, [isCustomer, isDeliveryRole, loadAddresses]);

  // Limpiar refs al desmontar
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Countdown para reenviar 2FA
  useEffect(() => {
    if (twoFaResendCooldown <= 0) return;
    const timer = setInterval(() => {
      if (mountedRef.current) {
        setTwoFaResendCooldown(prev => Math.max(0, prev - 1));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [twoFaResendCooldown]);

  // Sincronizar twoFactorEnabled cuando se actualiza el perfil
  useEffect(() => {
    if (user?.twoFactorEnabled !== undefined) {
      setTwoFactorEnabled(user.twoFactorEnabled);
    }
  }, [user?.twoFactorEnabled]);

  // ─── 2FA: 3-Step Flow (idle → confirming → verifying) ──────────────

  const handle2FaStart = useCallback((action) => {
    setTwoFaAction(action);
    setTwoFaError('');
    setTwoFaOtp(['', '', '', '', '', '']);
    setTwoFaStep('confirming');
  }, []);

  const handle2FaSendCode = useCallback(async () => {
    setTwoFaLoading(true);
    setTwoFaError('');
    const result = await send2FACode(twoFaAction);
    if (result.success) {
      setTwoFaStep('verifying');
      setTwoFaResendCooldown(RESEND_COOLDOWN);
      // Enfocar primer input OTP
      setTimeout(() => twoFaInputRefs.current[0]?.focus(), 300);
    } else {
      setTwoFaError(result.error);
    }
    setTwoFaLoading(false);
  }, [twoFaAction, send2FACode]);

  const handle2FaVerify = useCallback(async () => {
    const code = twoFaOtp.join('');
    if (code.length !== OTP_LENGTH) {
      setTwoFaError('Ingresa los 6 digitos del codigo');
      return;
    }
    setTwoFaLoading(true);
    setTwoFaError('');
    const result = await verify2FASetup(code, twoFaAction);
    if (result.success) {
      setTwoFactorEnabled(result.twoFactorEnabled);
      setTwoFaStep('idle');
      setTwoFaAction(null);
      setModal({
        visible: true, type: 'alert',
        title: result.twoFactorEnabled ? '2FA Activado' : '2FA Desactivado',
        message: result.twoFactorEnabled
          ? 'Se ha activado la autenticacion en 2 pasos. A partir de ahora se te pedira un codigo al iniciar sesion.'
          : 'Se ha desactivado la autenticacion en 2 pasos.',
        confirmText: 'Aceptar', onConfirm: null,
      });
    } else {
      setTwoFaError(result.error);
      setTwoFaOtp(['', '', '', '', '', '']);
      twoFaInputRefs.current[0]?.focus();
    }
    setTwoFaLoading(false);
  }, [twoFaOtp, twoFaAction, verify2FASetup]);

  const handle2FaResend = useCallback(async () => {
    if (twoFaResendCooldown > 0) return;
    setTwoFaOtp(['', '', '', '', '', '']);
    const result = await send2FACode(twoFaAction);
    if (result.success) {
      setTwoFaResendCooldown(RESEND_COOLDOWN);
      setTwoFaError('');
      twoFaInputRefs.current[0]?.focus();
    } else {
      setTwoFaError(result.error);
    }
  }, [twoFaAction, twoFaResendCooldown, send2FACode]);

  const handle2FaCancel = useCallback(() => {
    setTwoFaStep('idle');
    setTwoFaAction(null);
    setTwoFaMethod(null);
    setTwoFaError('');
    setTwoFaOtp(['', '', '', '', '', '']);
    setTwoFaResendCooldown(0);
    setTotpQrCode('');
    setTotpSecret('');
    setTotpBackupCodes([]);
    setBackupCodesConfirmed(false);
  }, []);

  const handle2FaOtpChange = useCallback((index, value) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length > 1) {
      const chars = numericValue.slice(0, OTP_LENGTH).split('');
      const newOtp = [...twoFaOtp];
      chars.forEach((char, i) => {
        if (index + i < OTP_LENGTH) newOtp[index + i] = char;
      });
      setTwoFaOtp(newOtp);
      const nextIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
      twoFaInputRefs.current[nextIndex]?.focus();
      return;
    }
    const newOtp = [...twoFaOtp];
    newOtp[index] = numericValue;
    setTwoFaOtp(newOtp);
    if (numericValue && index < OTP_LENGTH - 1) {
      twoFaInputRefs.current[index + 1]?.focus();
    }
  }, [twoFaOtp]);

  const handle2FaKeyPress = useCallback((index, key) => {
    if (key === 'Backspace' && !twoFaOtp[index] && index > 0) {
      const newOtp = [...twoFaOtp];
      newOtp[index - 1] = '';
      setTwoFaOtp(newOtp);
      twoFaInputRefs.current[index - 1]?.focus();
    }
  }, [twoFaOtp]);

  const formatCooldown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── 2FA: Method selection ────────────────────────────────────────────

  const handle2FaChooseMethod = useCallback(() => {
    if (twoFactorEnabled) {
      // Disabling: go straight to confirming (email-based)
      handle2FaStart('disable');
    } else {
      // Enabling: show method selection
      setTwoFaStep('choose-method');
      setTwoFaError('');
    }
  }, [twoFactorEnabled, handle2FaStart]);

  const handle2FaSelectMethod = useCallback((method) => {
    setTwoFaMethod(method);
    if (method === 'email') {
      handle2FaStart('enable');
    } else if (method === 'totp') {
      handle2FaStartTOTP();
    }
  }, [handle2FaStart]);

  // ─── 2FA: TOTP Flow ───────────────────────────────────────────────────

  const handle2FaStartTOTP = useCallback(async () => {
    setTwoFaLoading(true);
    setTwoFaError('');
    setTwoFaOtp(['', '', '', '', '', '']);
    const result = await setupTOTP();
    if (result.success) {
      setTotpQrCode(result.qrCode);
      setTotpSecret(result.secret);
      setTwoFaStep('setup-totp');
    } else {
      setTwoFaError(result.error || 'No se pudo iniciar la configuracion TOTP');
    }
    setTwoFaLoading(false);
  }, [setupTOTP]);

  const handle2FaProceedToVerifyTotp = useCallback(() => {
    setTwoFaStep('verify-totp');
    setTwoFaOtp(['', '', '', '', '', '']);
    setTwoFaError('');
    setTimeout(() => totpInputRefs.current[0]?.focus(), 300);
  }, []);

  const handleEnableTotp = useCallback(async () => {
    const code = twoFaOtp.join('');
    if (code.length !== OTP_LENGTH) {
      setTwoFaError('Ingresa los 6 digitos del codigo');
      return;
    }
    setTwoFaLoading(true);
    setTwoFaError('');
    const result = await enableTOTP(code);
    if (result.success) {
      setTwoFactorEnabled(result.twoFactorEnabled);
      setTotpBackupCodes(result.backupCodes || []);
      setBackupCodesConfirmed(false);
      setTwoFaStep('backup-codes');
      await fetchProfile();
    } else {
      setTwoFaError(result.error || 'Codigo invalido');
      setTwoFaOtp(['', '', '', '', '', '']);
      totpInputRefs.current[0]?.focus();
    }
    setTwoFaLoading(false);
  }, [twoFaOtp, enableTOTP, fetchProfile]);

  const handleBackupCodesContinue = useCallback(() => {
    if (!backupCodesConfirmed) return;
    setTwoFaStep('idle');
    setTwoFaMethod(null);
    setTotpBackupCodes([]);
    setBackupCodesConfirmed(false);
    setTotpQrCode('');
    setTotpSecret('');
    setTwoFaAction(null);
    setModal({
      visible: true, type: 'alert',
      title: '2FA Activado',
      message: 'Se ha activado la autenticacion en 2 pasos con tu app authenticator. A partir de ahora se te pedira un codigo al iniciar sesion.',
      confirmText: 'Aceptar', onConfirm: null,
    });
  }, [backupCodesConfirmed]);

  const handleGenerateBackupCodes = useCallback(async () => {
    setGeneratingBackupCodes(true);
    setTwoFaError('');
    const result = await generateBackupCodes();
    if (result.success) {
      setTotpBackupCodes(result.backupCodes || []);
      setBackupCodesConfirmed(false);
      setTwoFaStep('backup-codes');
    } else {
      setTwoFaError(result.error || 'No se pudieron generar los codigos de respaldo');
    }
    setGeneratingBackupCodes(false);
  }, [generateBackupCodes]);

  const handleCopyBackupCodes = useCallback(async () => {
    const text = totpBackupCodes.join('\n');
    try {
      await Share.share({
        message: `Codigos de respaldo 2FA:\n\n${text}`,
      });
    } catch {
      // User cancelled or error — no action needed
    }
  }, [totpBackupCodes]);

  const handleTotpOtpChange = useCallback((index, value) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length > 1) {
      const chars = numericValue.slice(0, OTP_LENGTH).split('');
      const newOtp = [...twoFaOtp];
      chars.forEach((char, i) => {
        if (index + i < OTP_LENGTH) newOtp[index + i] = char;
      });
      setTwoFaOtp(newOtp);
      const nextIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
      totpInputRefs.current[nextIndex]?.focus();
      return;
    }
    const newOtp = [...twoFaOtp];
    newOtp[index] = numericValue;
    setTwoFaOtp(newOtp);
    if (numericValue && index < OTP_LENGTH - 1) {
      totpInputRefs.current[index + 1]?.focus();
    }
  }, [twoFaOtp]);

  const handleTotpKeyPress = useCallback((index, key) => {
    if (key === 'Backspace' && !twoFaOtp[index] && index > 0) {
      const newOtp = [...twoFaOtp];
      newOtp[index - 1] = '';
      setTwoFaOtp(newOtp);
      totpInputRefs.current[index - 1]?.focus();
    }
  }, [twoFaOtp]);

  // ─── Google Places Search ─────────────────────────────────────────────

  const searchPlaces = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setPlaceResults([]);
      return;
    }
    try {
      setPlacesLoading(true);
      const apiKey = ENV.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        setPlaceResults([]);
        return;
      }
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&language=es`,
      );
      const data = await response.json();
      if (data.predictions) {
        setPlaceResults(
          data.predictions.map(p => ({
            place_id: p.place_id,
            description: p.description,
          })),
        );
      }
    } catch {
      setPlaceResults([]);
    } finally {
      setPlacesLoading(false);
    }
  }, []);

  const selectPlace = useCallback(async (place) => {
    try {
      setPlacesLoading(true);
      const apiKey = ENV.GOOGLE_PLACES_API_KEY;
      if (!apiKey) return;
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_address,geometry&key=${apiKey}`,
      );
      const data = await response.json();
      if (data.result) {
        setAddrForm(prev => ({
          ...prev,
          address: data.result.formatted_address || place.description,
          lat: data.result.geometry?.location?.lat || null,
          lng: data.result.geometry?.location?.lng || null,
        }));
      }
      setShowPlaceSearch(false);
      setPlaceSearchQuery('');
      setPlaceResults([]);
    } catch {
      setShowPlaceSearch(false);
    } finally {
      setPlacesLoading(false);
    }
  }, []);

  // ─── Edit profile ──────────────────────────────────────────────────────

  const openEditModal = useCallback(() => {
    setEditForm({
      phone: user?.phone || '',
      birthdate: user?.birthdate || '',
    });
    setEditModalVisible(true);
  }, [user?.phone, user?.birthdate]);

  const handleSaveProfile = useCallback(async () => {
    try {
      setSaving(true);
      const api = await apiService.createApiClient();
      if (!api) {
        setModal({ visible: true, type: 'alert', title: 'Error', message: 'No hay conexión con el servidor.', confirmText: 'Aceptar', onConfirm: null });
        return;
      }
      await api.put('/auth/profile', {
        phone: editForm.phone.trim() || null,
        birthdate: editForm.birthdate.trim() || null,
      });
      await fetchProfile();
      setEditModalVisible(false);
      setModal({ visible: true, type: 'alert', title: 'Perfil actualizado', message: 'Tus datos han sido guardados.', confirmText: 'Aceptar', onConfirm: null });
    } catch (err) {
      setModal({ visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo actualizar el perfil.', confirmText: 'Aceptar', onConfirm: null });
    } finally {
      setSaving(false);
    }
  }, [editForm, fetchProfile]);

  // ─── Address CRUD ──────────────────────────────────────────────────────

  const openAddressModal = useCallback(
    (addr = null) => {
      if (addr) {
        setEditingAddrId(addr.id);
        setAddrForm({
          label: addr.label || '',
          address: addr.address || '',
          city: addr.city || '',
          notes: addr.notes || '',
          lat: addr.lat || null,
          lng: addr.lng || null,
        });
      } else {
        setEditingAddrId(null);
        setAddrForm({
          label: '',
          address: '',
          city: '',
          notes: '',
          lat: null,
          lng: null,
        });
      }
      setShowPlaceSearch(false);
      setPlaceSearchQuery('');
      setPlaceResults([]);
      setAddrModalVisible(true);
    },
    [],
  );

  const handleSaveAddress = useCallback(async () => {
    if (!addrForm.label.trim() || !addrForm.address.trim()) {
      setModal({ visible: true, type: 'alert', title: 'Datos requeridos', message: 'Ingresa etiqueta y dirección.', confirmText: 'Aceptar', onConfirm: null });
      return;
    }

    try {
      setAddrSaving(true);

      if (editingAddrId) {
        const res = await apiService.updateAddress(editingAddrId, {
          label: addrForm.label.trim(),
          address: addrForm.address.trim(),
          city: addrForm.city.trim() || null,
          notes: addrForm.notes.trim() || null,
          lat: addrForm.lat,
          lng: addrForm.lng,
        });
        const updated = res.address || res;
        setAddresses(prev =>
          prev.map(a => (a.id === editingAddrId ? updated : a)),
        );
      } else {
        const res = await apiService.createAddress({
          label: addrForm.label.trim(),
          address: addrForm.address.trim(),
          city: addrForm.city.trim() || null,
          notes: addrForm.notes.trim() || null,
          lat: addrForm.lat,
          lng: addrForm.lng,
        });
        const newAddr = res.address || res;
        setAddresses(prev => [...prev, newAddr]);
      }

      setAddrModalVisible(false);
      setModal({ visible: true, type: 'alert', title: 'Éxito', message: editingAddrId ? 'Dirección actualizada correctamente.' : 'Dirección guardada correctamente.', confirmText: 'Aceptar', onConfirm: null });
    } catch (err) {
      setModal({ visible: true, type: 'alert', title: 'Error', message: err.message || 'No se pudo guardar la dirección.', confirmText: 'Aceptar', onConfirm: null });
    } finally {
      setAddrSaving(false);
    }
  }, [addrForm, editingAddrId]);

  const handleSetDefault = useCallback(async (addrId) => {
    try {
      await apiService.setDefaultAddress(addrId);
      setAddresses(prev =>
        prev.map(a => ({...a, isDefault: a.id === addrId})),
      );
    } catch (err) {
      setModal({ visible: true, type: 'alert', title: 'Error', message: 'No se pudo cambiar la dirección principal.', confirmText: 'Aceptar', onConfirm: null });
    }
  }, []);

  const handleDeleteAddress = useCallback(
    (addr) => {
      setModal({
        visible: true, type: 'danger', title: 'Eliminar dirección',
        message: `¿Eliminar "${addr.label}"?`,
        confirmText: 'Eliminar',
        onConfirm: async () => {
          try {
            await apiService.deleteAddress(addr.id);
            setAddresses(prev => prev.filter(a => a.id !== addr.id));
            setModal({ visible: true, type: 'alert', title: 'Eliminada', message: 'Dirección eliminada.', confirmText: 'Aceptar', onConfirm: null });
          } catch {
            setModal({ visible: true, type: 'alert', title: 'Error', message: 'No se pudo eliminar la dirección.', confirmText: 'Aceptar', onConfirm: null });
          }
        },
      });
    },
    [],
  );

  // ─── Logout ────────────────────────────────────────────────────────────

  const handleLogout = () => {
    setModal({
      visible: true, type: 'danger', title: 'Cerrar sesión',
      message: '¿Estás seguro de que deseas cerrar sesión?',
      confirmText: 'Cerrar sesión',
      onConfirm: () => {
        setLoggingOut(true);
        setTimeout(() => logout(), 300);
      },
    });
  };

  // ─── Data ──────────────────────────────────────────────────────────────

  const roleNames = user?.roles?.map(r => r.name) || [];

  // Permisos: solo visible para staff (no para cliente)
  const permCodes = isStaff
    ? user?.permissions?.map(p => p.code) || []
    : [];
  const moduleLabels = {
    products: 'Productos',
    categories: 'Categorías',
    orders: 'Pedidos',
    delivery: 'Delivery',
    users: 'Usuarios',
    dashboard: 'Dashboard',
  };

  const groupedPerms = {};
  for (const code of permCodes) {
    const [mod] = code.split('.');
    if (!groupedPerms[mod]) groupedPerms[mod] = [];
    groupedPerms[mod].push(code);
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Perfil</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleLogout} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="log-out-outline" size={22} color={primary} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* Avatar y nombre */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Usuario'}</Text>
          <View style={styles.roleBadges}>
            {roleNames.map(role => (
              <View
                key={role}
                style={[
                  styles.roleBadge,
                  role === 'admin' && styles.roleBadgeAdmin,
                ]}>
                <Icon
                  name={
                    role === 'admin'
                      ? 'shield'
                      : role === 'editor'
                        ? 'create'
                        : role === 'delivery'
                          ? 'bicycle'
                          : 'person'
                  }
                  size={14}
                  color={
                    role === 'admin' || role === 'editor'
                      ? theme.colors.white
                      : theme.colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.roleText,
                    (role === 'admin' || role === 'editor') &&
                      styles.roleTextWhite,
                  ]}>
                  {role === 'admin'
                    ? 'Administrador'
                    : role === 'editor'
                      ? 'Editor'
                      : role === 'delivery'
                        ? 'Delivery'
                        : 'Cliente'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tiendas asignadas (solo lectura, cuando multi-store activo) */}
        {isMultiStore && user?.stores && user.stores.length > 0 && (
          <View style={styles.infoCard}>
            <View style={styles.sectionHeader}>
              <Icon name="storefront-outline" size={18} color={primary} />
              <Text style={styles.sectionHeaderText}>Tiendas asignadas</Text>
            </View>
            {user.stores.map(store => (
              <View key={store.id} style={styles.infoRow}>
                <Icon
                  name="storefront-outline"
                  size={18}
                  color={theme.colors.textSecondary}
                  style={{marginRight: theme.spacing.md}}
                />
                <Text style={styles.infoValue}>{store.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Icon
              name="mail-outline"
              size={20}
              color={theme.colors.textSecondary}
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Correo</Text>
              <Text style={styles.infoValue}>{user?.email || '-'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Icon
              name="call-outline"
              size={20}
              color={theme.colors.textSecondary}
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Teléfono</Text>
              <Text style={styles.infoValue}>
                {user?.phone || 'No configurado'}
              </Text>
            </View>
          </View>

          {user?.birthdate && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Icon
                  name="calendar-outline"
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>
                    Fecha de nacimiento
                  </Text>
                  <Text style={styles.infoValue}>{user.birthdate}</Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Icon
              name="time-outline"
              size={20}
              color={theme.colors.textSecondary}
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Miembro desde</Text>
              <Text style={styles.infoValue}>
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'long',
                    })
                  : '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* Edit profile button (not for admin — they edit in user management) */}
        {!isAdmin && (
          <TouchableOpacity
            onPress={openEditModal}
            style={styles.editButton}
            activeOpacity={0.8}>
            <Icon
              name="create-outline"
              size={20}
              color={primary}
            />
            <Text style={styles.editButtonText}>Editar perfil</Text>
          </TouchableOpacity>
        )}

        {/* ─── Security Section ──────────────────────────────────────── */}
        {!isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Icon name="shield-checkmark-outline" size={18} color={primary} />{' '}
              Seguridad
            </Text>

            {/* STEP: Idle - Estado actual + boton de accion */}
            {twoFaStep === 'idle' && (
              <>
                <View style={styles.securityCard}>
                  <View style={styles.securityRow}>
                    <View style={styles.securityInfo}>
                      <View style={[
                        styles.securityIconWrap,
                        twoFactorEnabled && { backgroundColor: theme.colors.success + '15' },
                      ]}>
                        <Icon
                          name={twoFactorEnabled ? 'shield-checkmark' : 'shield-outline'}
                          size={22}
                          color={twoFactorEnabled ? theme.colors.success : theme.colors.textSecondary}
                        />
                      </View>
                      <View style={styles.securityTextWrap}>
                        <Text style={styles.securityLabel}>Autenticacion en 2 pasos</Text>
                        <Text style={styles.securityDescription}>
                          {twoFactorEnabled
                            ? `Activada (${user?.twoFactorType === 'totp' ? 'App Authenticator' : 'Correo electronico'})`
                            : 'Desactivada: tu sesion inicia solo con correo y contrasena'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={handle2FaChooseMethod}
                      style={[
                        styles.twoFaActionBtn,
                        twoFactorEnabled
                          ? { backgroundColor: '#FDE8EC', borderColor: '#FF6B6B' }
                          : { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Icon
                        name={twoFactorEnabled ? 'close-circle-outline' : 'checkmark-circle-outline'}
                        size={18}
                        color={twoFactorEnabled ? '#FF6B6B' : '#4CAF50'}
                      />
                      <Text style={[
                        styles.twoFaActionBtnText,
                        { color: twoFactorEnabled ? '#FF6B6B' : '#4CAF50' },
                      ]}>
                        {twoFactorEnabled ? 'Desactivar' : 'Activar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* When 2FA is enabled with TOTP, show "Generate new backup codes" */}
                {twoFactorEnabled && user?.twoFactorType === 'totp' && (
                  <TouchableOpacity
                    onPress={handleGenerateBackupCodes}
                    style={[styles.securityCard, styles.backupCodesActionCard]}
                    disabled={generatingBackupCodes}
                    activeOpacity={0.7}
                  >
                    <View style={styles.securityInfo}>
                      <View style={styles.securityIconWrap}>
                        <Icon
                          name="key-outline"
                          size={20}
                          color={theme.colors.textSecondary}
                        />
                      </View>
                      <View style={styles.securityTextWrap}>
                        <Text style={styles.securityLabel}>Codigos de respaldo</Text>
                        <Text style={styles.securityDescription}>
                          Genera nuevos codigos de un solo uso en caso de perder acceso a tu app authenticator.
                        </Text>
                      </View>
                    </View>
                    {generatingBackupCodes ? (
                      <ActivityIndicator size="small" color={primary} />
                    ) : (
                      <Icon name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* STEP: Choose Method - Seleccionar email o totp */}
            {twoFaStep === 'choose-method' && (
              <View style={styles.securityCard}>
                <View style={styles.twoFaConfirmHeader}>
                  <Icon name="shield-checkmark-outline" size={40} color={theme.colors.success} />
                  <Text style={styles.twoFaConfirmTitle}>Activar autenticacion en 2 pasos</Text>
                  <Text style={styles.twoFaConfirmDesc}>
                    Elige el metodo para recibir tu codigo de verificacion.
                  </Text>
                </View>

                {twoFaError ? (
                  <View style={styles.errorBox}>
                    <Icon name="alert-circle" size={16} color={primary} />
                    <Text style={styles.errorText}>{twoFaError}</Text>
                  </View>
                ) : null}

                {/* Method: Email */}
                <TouchableOpacity
                  onPress={() => handle2FaSelectMethod('email')}
                  style={styles.methodOption}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodOptionIcon, { backgroundColor: '#E3F2FD' }]}>
                    <Icon name="mail-outline" size={22} color="#1976D2" />
                  </View>
                  <View style={styles.methodOptionInfo}>
                    <Text style={styles.methodOptionLabel}>Por correo electronico</Text>
                    <Text style={styles.methodOptionDesc}>
                      Recibiras un codigo de 6 digitos por correo cada vez que inicies sesion.
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color={theme.colors.textLight} />
                </TouchableOpacity>

                <View style={styles.methodDivider} />

                {/* Method: TOTP Authenticator App */}
                <TouchableOpacity
                  onPress={() => handle2FaSelectMethod('totp')}
                  style={styles.methodOption}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodOptionIcon, { backgroundColor: '#E8F5E9' }]}>
                    <Icon name="phone-portrait-outline" size={22} color="#4CAF50" />
                  </View>
                  <View style={styles.methodOptionInfo}>
                    <Text style={styles.methodOptionLabel}>Por App Authenticator</Text>
                    <Text style={styles.methodOptionDesc}>
                      Usa Google Authenticator, Authy u otra app TOTP para generar codigos offline.
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color={theme.colors.textLight} />
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity onPress={handle2FaCancel} style={styles.twoFaCancelLink} activeOpacity={0.7}>
                  <Text style={styles.twoFaCancelLinkText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP: Setup TOTP - Show QR code and secret */}
            {twoFaStep === 'setup-totp' && (
              <View style={styles.securityCard}>
                {twoFaLoading ? (
                  <View style={styles.twoFaVerifyContent}>
                    <ActivityIndicator size="large" color={primary} />
                    <Text style={styles.twoFaVerifyDesc} style={{ marginTop: 12 }}>Generando codigo QR...</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.twoFaConfirmHeader}>
                      <Icon name="phone-portrait-outline" size={40} color={theme.colors.success} />
                      <Text style={styles.twoFaConfirmTitle}>Configura tu App Authenticator</Text>
                      <Text style={styles.twoFaConfirmDesc}>
                        Escanea el codigo QR con tu app authenticator (Google Authenticator, Authy, etc.)
                      </Text>
                    </View>

                    {twoFaError ? (
                      <View style={styles.errorBox}>
                        <Icon name="alert-circle" size={16} color={primary} />
                        <Text style={styles.errorText}>{twoFaError}</Text>
                      </View>
                    ) : null}

                    {/* QR Code Image */}
                    {totpQrCode ? (
                      <View style={styles.qrCodeContainer}>
                        <Image
                          source={{ uri: totpQrCode }}
                          style={styles.qrCodeImage}
                          resizeMode="contain"
                        />
                      </View>
                    ) : null}

                    {/* Secret Key (manual entry fallback) */}
                    {totpSecret ? (
                      <View style={styles.totpSecretContainer}>
                        <Text style={styles.totpSecretLabel}>Clave secreta (si no puedes escanear):</Text>
                        <TouchableOpacity
                          onPress={() => {
                            Share.share({ message: totpSecret });
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.totpSecretValueWrap}>
                            <Text style={styles.totpSecretValue} selectable>
                              {totpSecret}
                            </Text>
                            <Icon name="copy-outline" size={16} color={primary} />
                          </View>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={styles.twoFaBtnRow}>
                      <TouchableOpacity
                        onPress={handle2FaCancel}
                        style={styles.twoFaCancelBtn}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.twoFaCancelBtnText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handle2FaProceedToVerifyTotp}
                        style={[styles.twoFaSendBtn, { backgroundColor: theme.colors.success }]}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.twoFaSendBtnText}>Continuar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* STEP: Verify TOTP - Enter 6-digit code from authenticator */}
            {twoFaStep === 'verify-totp' && (
              <View style={styles.securityCard}>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={styles.twoFaVerifyContent}
                >
                  <Icon
                    name="phone-portrait-outline"
                    size={40}
                    color={primary}
                    style={{ marginBottom: 12 }}
                  />
                  <Text style={styles.twoFaVerifyTitle}>Verifica tu App Authenticator</Text>
                  <Text style={styles.twoFaVerifyDesc}>
                    Ingresa el codigo de 6 digitos que muestra tu app authenticator.
                  </Text>

                  {twoFaError ? (
                    <View style={styles.errorBox}>
                      <Icon name="alert-circle" size={16} color={primary} />
                      <Text style={styles.errorText}>{twoFaError}</Text>
                    </View>
                  ) : null}

                  {/* OTP Inputs */}
                  <View style={styles.twoFaOtpContainer}>
                    {twoFaOtp.map((digit, index) => (
                      <TextInput
                        key={`totp-${index}`}
                        ref={ref => totpInputRefs.current[index] = ref}
                        style={[
                          styles.twoFaOtpInput,
                          digit && styles.twoFaOtpInputFilled,
                        ]}
                        value={digit}
                        onChangeText={value => handleTotpOtpChange(index, value)}
                        onKeyPress={({nativeEvent}) => handleTotpKeyPress(index, nativeEvent.key)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                      />
                    ))}
                  </View>

                  {/* Boton verificar */}
                  <TouchableOpacity
                    onPress={handleEnableTotp}
                    style={[
                      styles.twoFaVerifyBtn,
                      { backgroundColor: theme.colors.success },
                      (twoFaLoading || twoFaOtp.join('').length !== OTP_LENGTH) && styles.buttonDisabled,
                    ]}
                    disabled={twoFaLoading || twoFaOtp.join('').length !== OTP_LENGTH}
                    activeOpacity={0.7}
                  >
                    {twoFaLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.white} />
                    ) : (
                      <Text style={styles.twoFaVerifyBtnText}>Verificar y activar</Text>
                    )}
                  </TouchableOpacity>

                  {/* Cancelar */}
                  <TouchableOpacity onPress={handle2FaCancel} style={styles.twoFaCancelLink} activeOpacity={0.7}>
                    <Text style={styles.twoFaCancelLinkText}>Cancelar</Text>
                  </TouchableOpacity>
                </KeyboardAvoidingView>
              </View>
            )}

            {/* STEP: Backup Codes - One-time display */}
            {twoFaStep === 'backup-codes' && (
              <View style={styles.securityCard}>
                <View style={styles.twoFaConfirmHeader}>
                  <Icon name="key-outline" size={40} color={theme.colors.success} />
                  <Text style={styles.twoFaConfirmTitle}>Codigos de respaldo</Text>
                  <Text style={styles.twoFaConfirmDesc}>
                    Guarda estos codigos en un lugar seguro. Cada codigo solo puede usarse una vez para iniciar sesion si pierdes acceso a tu app authenticator.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleCopyBackupCodes}
                  style={styles.backupCodesCopyBtn}
                  activeOpacity={0.7}
                >
                  <Icon name="copy-outline" size={16} color={theme.colors.white} />
                  <Text style={styles.backupCodesCopyBtnText}>Copiar todos</Text>
                </TouchableOpacity>

                <ScrollView
                  style={styles.backupCodesScroll}
                  contentContainerStyle={styles.backupCodesList}
                  showsVerticalScrollIndicator={false}
                >
                  {totpBackupCodes.map((code, index) => (
                    <View key={index} style={styles.backupCodeItem}>
                      <Text style={styles.backupCodeIndex}>{index + 1}.</Text>
                      <Text style={styles.backupCodeText} selectable>{code}</Text>
                    </View>
                  ))}
                </ScrollView>

                {/* Checkbox */}
                <TouchableOpacity
                  onPress={() => setBackupCodesConfirmed(!backupCodesConfirmed)}
                  style={styles.backupCodesCheckboxRow}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.backupCodesCheckbox,
                    backupCodesConfirmed && styles.backupCodesCheckboxChecked,
                  ]}>
                    {backupCodesConfirmed && (
                      <Icon name="checkmark" size={14} color={theme.colors.white} />
                    )}
                  </View>
                  <Text style={styles.backupCodesCheckboxLabel}>
                    He guardado mis codigos de respaldo en un lugar seguro
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleBackupCodesContinue}
                  style={[
                    styles.twoFaVerifyBtn,
                    { backgroundColor: theme.colors.success, marginTop: theme.spacing.md },
                    !backupCodesConfirmed && styles.buttonDisabled,
                  ]}
                  disabled={!backupCodesConfirmed}
                  activeOpacity={0.7}
                >
                  <Text style={styles.twoFaVerifyBtnText}>Continuar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* STEP: Confirming - Explicacion + enviar codigo (email flow) */}
            {twoFaStep === 'confirming' && (
              <View style={styles.securityCard}>
                <View style={styles.twoFaConfirmHeader}>
                  <Icon
                    name={twoFaAction === 'enable' ? 'shield-checkmark-outline' : 'shield-outline'}
                    size={40}
                    color={twoFaAction === 'enable' ? theme.colors.success : '#FF6B6B'}
                  />
                  <Text style={styles.twoFaConfirmTitle}>
                    {twoFaAction === 'enable' ? 'Activar' : 'Desactivar'} autenticacion en 2 pasos
                  </Text>
                  <Text style={styles.twoFaConfirmDesc}>
                    {twoFaAction === 'enable'
                      ? 'Enviaremos un codigo de verificacion a tu correo electronico para confirmar tu identidad.'
                      : 'Enviaremos un codigo de verificacion a tu correo electronico para confirmar que deseas desactivar esta funcion.'}
                  </Text>
                </View>

                {twoFaError ? (
                  <View style={styles.errorBox}>
                    <Icon name="alert-circle" size={16} color={primary} />
                    <Text style={styles.errorText}>{twoFaError}</Text>
                  </View>
                ) : null}

                <View style={styles.twoFaBtnRow}>
                  <TouchableOpacity
                    onPress={handle2FaCancel}
                    style={styles.twoFaCancelBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.twoFaCancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handle2FaSendCode}
                    style={[
                      styles.twoFaSendBtn,
                      twoFaAction === 'enable'
                        ? { backgroundColor: theme.colors.success }
                        : { backgroundColor: '#FF6B6B' },
                      twoFaLoading && styles.buttonDisabled,
                    ]}
                    disabled={twoFaLoading}
                    activeOpacity={0.7}
                  >
                    {twoFaLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.white} />
                    ) : (
                      <Icon name="mail-outline" size={18} color={theme.colors.white} />
                    )}
                    <Text style={styles.twoFaSendBtnText}>
                      {twoFaLoading ? 'Enviando...' : 'Enviar codigo'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP: Verifying - Ingresar OTP de 6 digitos (email flow) */}
            {twoFaStep === 'verifying' && (
              <View style={styles.securityCard}>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={styles.twoFaVerifyContent}
                >
                  <Icon
                    name="mail-open-outline"
                    size={40}
                    color={primary}
                    style={{ marginBottom: 12 }}
                  />
                  <Text style={styles.twoFaVerifyTitle}>Ingresa el codigo de 6 digitos</Text>
                  <Text style={styles.twoFaVerifyDesc}>
                    Enviamos un codigo a <Text style={{ fontWeight: '600', color: primary }}>{user?.email}</Text>
                  </Text>

                  {twoFaError ? (
                    <View style={styles.errorBox}>
                      <Icon name="alert-circle" size={16} color={primary} />
                      <Text style={styles.errorText}>{twoFaError}</Text>
                    </View>
                  ) : null}

                  {/* OTP Inputs */}
                  <View style={styles.twoFaOtpContainer}>
                    {twoFaOtp.map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={ref => twoFaInputRefs.current[index] = ref}
                        style={[
                          styles.twoFaOtpInput,
                          digit && styles.twoFaOtpInputFilled,
                        ]}
                        value={digit}
                        onChangeText={value => handle2FaOtpChange(index, value)}
                        onKeyPress={({nativeEvent}) => handle2FaKeyPress(index, nativeEvent.key)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                      />
                    ))}
                  </View>

                  {/* Boton verificar */}
                  <TouchableOpacity
                    onPress={handle2FaVerify}
                    style={[
                      styles.twoFaVerifyBtn,
                      twoFaAction === 'enable'
                        ? { backgroundColor: theme.colors.success }
                        : { backgroundColor: '#FF6B6B' },
                      (twoFaLoading || twoFaOtp.join('').length !== OTP_LENGTH) && styles.buttonDisabled,
                    ]}
                    disabled={twoFaLoading || twoFaOtp.join('').length !== OTP_LENGTH}
                    activeOpacity={0.7}
                  >
                    {twoFaLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.white} />
                    ) : (
                      <Text style={styles.twoFaVerifyBtnText}>Verificar</Text>
                    )}
                  </TouchableOpacity>

                  {/* Reenviar */}
                  <View style={styles.twoFaResendContainer}>
                    {twoFaResendCooldown > 0 ? (
                      <Text style={styles.twoFaResendCooldownText}>
                        Reenviar en {formatCooldown(twoFaResendCooldown)}
                      </Text>
                    ) : (
                      <TouchableOpacity onPress={handle2FaResend} activeOpacity={0.7}>
                        <Text style={styles.twoFaResendBtnText}>Reenviar codigo</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Cancelar */}
                  <TouchableOpacity onPress={handle2FaCancel} style={styles.twoFaCancelLink} activeOpacity={0.7}>
                    <Text style={styles.twoFaCancelLinkText}>Cancelar</Text>
                  </TouchableOpacity>
                </KeyboardAvoidingView>
              </View>
            )}
          </View>
        )}

        {/* ─── Saved Addresses Section (client only) ──────────────── */}
        {(isCustomer || isDeliveryRole) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                <Icon
                  name="location-outline"
                  size={18}
                  color={primary}
                />{' '}
                Mis direcciones ({addresses.length})
              </Text>
              <TouchableOpacity
                onPress={() => openAddressModal()}
                activeOpacity={0.7}>
                <Icon
                  name="add-circle-outline"
                  size={24}
                  color={primary}
                />
              </TouchableOpacity>
            </View>

            {addressesLoading ? (
              <ActivityIndicator
                size="small"
                color={primary}
              />
            ) : addresses.length > 0 ? (
              addresses.map(addr => (
                <View key={addr.id} style={styles.addressCard}>
                  <View style={styles.addressCardLeft}>
                    <View
                      style={[
                        styles.addressIcon,
                        addr.isDefault && styles.addressIconDefault,
                      ]}>
                      <Icon
                        name={
                          addr.isDefault
                            ? 'home'
                            : addr.label.toLowerCase().includes('oficina')
                              ? 'business'
                              : 'location'
                        }
                        size={18}
                        color={
                          addr.isDefault
                            ? theme.colors.white
                            : theme.colors.textSecondary
                        }
                      />
                    </View>
                    <View style={styles.addressCardInfo}>
                      <View style={styles.addressCardLabelRow}>
                        <Text style={styles.addressCardLabel}>
                          {addr.label}
                        </Text>
                        {addr.isDefault && (
                          <View style={styles.defaultTag}>
                            <Text style={styles.defaultTagText}>
                              Principal
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.addressCardText} numberOfLines={2}>
                        {addr.address}
                      </Text>
                      {addr.city && (
                        <Text style={styles.addressCardCity}>
                          {addr.city}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.addressCardActions}>
                    <TouchableOpacity
                      onPress={() => openAddressModal(addr)}
                      hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
                      <Icon
                        name="create-outline"
                        size={20}
                        color={theme.colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {!addr.isDefault && (
                      <>
                        <TouchableOpacity
                          onPress={() => handleSetDefault(addr.id)}
                          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
                          <Icon
                            name="star-outline"
                            size={20}
                            color={theme.colors.textSecondary}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteAddress(addr)}
                          hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}>
                          <Icon
                            name="trash-outline"
                            size={20}
                            color={primary}
                          />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <TouchableOpacity
                style={styles.emptyAddressCard}
                onPress={() => openAddressModal()}
                activeOpacity={0.7}>
                <Icon
                  name="add-circle-outline"
                  size={36}
                  color={primary}
                />
                <Text style={styles.emptyAddressText}>
                  Agrega tu primera dirección
                </Text>
                <Text style={styles.emptyAddressSubtext}>
                  Para entregas rápidas y precisas
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Permisos (solo para staff, no para cliente) */}
        {isStaff && Object.keys(groupedPerms).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Icon
                name="key-outline"
                size={18}
                color={primary}
              />{' '}
              Mis Permisos ({permCodes.length})
            </Text>
            {Object.entries(groupedPerms).map(([module, codes]) => (
              <View key={module} style={styles.permModule}>
                <Text style={styles.permModuleLabel}>
                  {moduleLabels[module] || module}
                </Text>
                <View style={styles.permList}>
                  {codes.map(code => (
                    <View key={code} style={styles.permChip}>
                      <Icon
                        name="checkmark"
                        size={12}
                        color={theme.colors.success}
                      />
                      <Text style={styles.permChipText}>{code}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}


      </ScrollView>

      {/* ─── Edit Profile Modal ──────────────────────────────────────── */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar perfil</Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon
                  name="close"
                  size={24}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                value={editForm.phone}
                onChangeText={val =>
                  setEditForm(prev => ({...prev, phone: val}))
                }
                placeholder="Tu número de teléfono"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                keyboardType="phone-pad"
                maxLength={20}
              />

              <Text style={styles.label}>Fecha de nacimiento</Text>
              <TextInput
                value={editForm.birthdate}
                onChangeText={val =>
                  setEditForm(prev => ({...prev, birthdate: val}))
                }
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                keyboardType="number-pad"
                maxLength={10}
              />

              <TouchableOpacity
                onPress={handleSaveProfile}
                style={[styles.saveBtn, saving && styles.buttonDisabled]}
                disabled={saving}
                activeOpacity={0.8}>
                {saving ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Guardar cambios</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Address CRUD Modal ────────────────────────────────────────── */}
      <Modal
        visible={addrModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddrModalVisible(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAddrModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingAddrId ? 'Editar dirección' : 'Nueva dirección'}
              </Text>
              <TouchableOpacity
                onPress={() => setAddrModalVisible(false)}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon
                  name="close"
                  size={24}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Etiqueta</Text>
              <TextInput
                value={addrForm.label}
                onChangeText={val =>
                  setAddrForm(prev => ({...prev, label: val}))
                }
                placeholder="Ej: Casa, Oficina..."
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
              />

              <Text style={styles.label}>Dirección</Text>
              <View style={styles.placeSearchRow}>
                <TextInput
                  value={addrForm.address}
                  onChangeText={text => {
                    setAddrForm(prev => ({...prev, address: text}));
                    searchPlaces(text);
                    if (ENV.GOOGLE_PLACES_API_KEY) {
                      setShowPlaceSearch(true);
                    }
                  }}
                  placeholder="Escribe o busca dirección..."
                  placeholderTextColor={theme.colors.textLight}
                  style={[styles.input, styles.placeInput]}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                {ENV.GOOGLE_PLACES_API_KEY && (
                  <TouchableOpacity
                    style={styles.searchIcon}
                    onPress={() => {
                      if (addrForm.address.length >= 3) {
                        searchPlaces(addrForm.address);
                        setShowPlaceSearch(true);
                      }
                    }}>
                    <Icon
                      name="search"
                      size={20}
                      color={primary}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {showPlaceSearch && placeResults.length > 0 && (
                <View style={styles.placeResults}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    style={{maxHeight: 180}}>
                    {placesLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={primary}
                      />
                    ) : (
                      placeResults.map(place => (
                        <TouchableOpacity
                          key={place.place_id}
                          style={styles.placeResultItem}
                          onPress={() => selectPlace(place)}>
                          <Icon
                            name="location-outline"
                            size={16}
                            color={theme.colors.textSecondary}
                          />
                          <Text style={styles.placeResultText} numberOfLines={2}>
                            {place.description}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

              {addrForm.lat && addrForm.lng && (
                <View style={styles.coordsRow}>
                  <Icon
                    name="checkmark-circle"
                    size={14}
                    color={theme.colors.success}
                  />
                  <Text style={styles.coordsText}>
                    Ubicación verificada en Google Maps
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Ciudad</Text>
              <TextInput
                value={addrForm.city}
                onChangeText={val =>
                  setAddrForm(prev => ({...prev, city: val}))
                }
                placeholder="Ej: Caracas"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
              />

              <Text style={styles.label}>Notas (opcional)</Text>
              <TextInput
                value={addrForm.notes}
                onChangeText={val =>
                  setAddrForm(prev => ({...prev, notes: val}))
                }
                placeholder="Punto de referencia, apartamento, etc."
                placeholderTextColor={theme.colors.textLight}
                style={[styles.input, styles.notesInput]}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />

              <TouchableOpacity
                onPress={handleSaveAddress}
                style={[styles.saveBtn, addrSaving && styles.buttonDisabled]}
                disabled={addrSaving}
                activeOpacity={0.8}>
                {addrSaving ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingAddrId ? 'Actualizar' : 'Guardar dirección'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={{height: theme.spacing.xxl}} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ConfirmModal */}
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
  headerRight: {
    width: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sectionHeaderText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: theme.borderRadius.full,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    marginBottom: theme.spacing.md,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: theme.colors.white,
  },
  userName: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  roleBadges: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.inputBg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.xl,
  },
  roleBadgeAdmin: {
    backgroundColor: primary,
  },
  roleText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  roleTextWhite: {
    color: theme.colors.white,
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
    marginTop: theme.spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  infoValue: {
    fontSize: theme.fontSize.md,
    fontWeight: '500',
    color: theme.colors.text,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
  },
  editButtonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: primary,
  },
  // Section
  section: {
    marginTop: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  // Security card
  securityCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
  },
  securityIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityTextWrap: {
    flex: 1,
  },
  securityLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  securityDescription: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  securityLoader: {
    marginTop: theme.spacing.sm,
  },
  // 2FA Flow styles
  twoFaActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1.5,
  },
  twoFaActionBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  twoFaConfirmHeader: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  twoFaConfirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  twoFaConfirmDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: theme.spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE8EC',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm + 2,
    marginVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: primary,
    fontWeight: '500',
  },
  twoFaBtnRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  twoFaCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoFaCancelBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  twoFaSendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
  },
  twoFaSendBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.white,
  },
  twoFaVerifyContent: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  twoFaVerifyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  twoFaVerifyDesc: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  twoFaOtpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 20,
  },
  twoFaOtpInput: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.inputBg,
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  twoFaOtpInputFilled: {
    borderColor: primary,
    backgroundColor: primary + '08',
  },
  twoFaVerifyBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoFaVerifyBtnText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.white,
  },
  twoFaResendContainer: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  twoFaResendCooldownText: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  twoFaResendBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: primary,
  },
  twoFaCancelLink: {
    marginTop: theme.spacing.md,
    paddingVertical: 8,
  },
  twoFaCancelLinkText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  // Method selector
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  methodOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodOptionInfo: {
    flex: 1,
  },
  methodOptionLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  methodOptionDesc: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  methodDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  // TOTP QR code
  qrCodeContainer: {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.md,
  },
  qrCodeImage: {
    width: 200,
    height: 200,
  },
  // TOTP secret key
  totpSecretContainer: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.sm,
  },
  totpSecretLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  totpSecretValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  totpSecretValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  // Backup codes
  backupCodesActionCard: {
    marginTop: theme.spacing.sm,
  },
  backupCodesCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignSelf: 'center',
    marginVertical: theme.spacing.sm,
  },
  backupCodesCopyBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.white,
  },
  backupCodesScroll: {
    maxHeight: 250,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
  },
  backupCodesList: {
    padding: theme.spacing.sm,
  },
  backupCodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backupCodeIndex: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.textLight,
    width: 20,
  },
  backupCodeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  backupCodesCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  backupCodesCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupCodesCheckboxChecked: {
    backgroundColor: primary,
    borderColor: primary,
  },
  backupCodesCheckboxLabel: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  // Address cards
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  addressCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressIconDefault: {
    backgroundColor: primary,
  },
  addressCardInfo: {
    flex: 1,
  },
  addressCardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  addressCardLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  defaultTag: {
    backgroundColor: primary + '18',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.borderRadius.sm,
  },
  defaultTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: primary,
  },
  addressCardText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  addressCardCity: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  addressCardActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  emptyAddressCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    marginTop: theme.spacing.xs,
  },
  emptyAddressText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
  emptyAddressSubtext: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  // Permissions
  permModule: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  permModuleLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: primary,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  permList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  permChipText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: primary,
    borderRadius: theme.borderRadius.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  logoutText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: primary,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingBottom: theme.spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  modalBody: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  notesInput: {
    textAlignVertical: 'top',
    minHeight: 56,
  },
  saveBtn: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  saveBtnText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  // Google Places
  placeSearchRow: {
    position: 'relative',
  },
  placeInput: {
    paddingRight: 44,
    minHeight: 70,
  },
  searchIcon: {
    position: 'absolute',
    right: theme.spacing.md,
    top: 16,
  },
  placeResults: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  placeResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  placeResultText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  coordsText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.success,
    fontWeight: '600',
  },
});

export default ProfileScreen;
