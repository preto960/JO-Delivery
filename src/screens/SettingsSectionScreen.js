import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useNavigation, useRoute} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import apiService from '@services/api';
import ENV from '@config/env';
import {normalizeUrl, isValidUrl} from '@utils/helpers';
import {launchImageLibrary} from 'react-native-image-picker';
import ConfirmModal from '@components/ConfirmModal';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

// ─── Apariencia ──────────────────────────────────────────────────────────────
const AppearanceSection = ({primary, styles, config, updateConfig, setModal}) => {
  const [shopName, setShopName] = useState(config.shop_name || 'JO-Delivery');
  const [primaryColor, setPrimaryColor] = useState(config.primary_color || '#FF6B35');
  const [accentColor, setAccentColor] = useState(config.accent_color || '#E94560');
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    setShopName(config.shop_name || 'JO-Delivery');
    setPrimaryColor(config.primary_color || '#FF6B35');
    setAccentColor(config.accent_color || '#E94560');
  }, [config.shop_name, config.primary_color, config.accent_color]);

  const handleSaveAppearance = useCallback(async () => {
    setSavingAppearance(true);
    try {
      await updateConfig({
        shop_name: shopName,
        primary_color: primaryColor,
        accent_color: accentColor,
      });
    } catch (err) {
      setModal({visible: true, type: 'alert', title: 'Error', message: 'No se pudo guardar la apariencia.', confirmText: 'Aceptar', onConfirm: null});
    } finally {
      setSavingAppearance(false);
    }
  }, [shopName, primaryColor, accentColor, updateConfig, setModal]);

  const handlePickLogo = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });
      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
        Alert.alert('Error', 'La imagen no debe superar 2MB');
        return;
      }
      setLogoUploading(true);
      try {
        const api = await apiService.createApiClient();
        const formData = new FormData();
        const fileUri = asset.uri;
        const filename = asset.fileName || fileUri.split('/').pop() || 'logo.png';
        formData.append('file', {
          uri: fileUri,
          name: filename,
          type: asset.type || 'image/jpeg',
        });
        const res = await api.post('/config/delivery/upload-logo', formData, {
          headers: {'Content-Type': 'multipart/form-data'},
          transformRequest: data => data,
        });
        const logoUrl = res?.url || res?.data?.url;
        if (logoUrl) {
          await updateConfig({shop_logo_url: logoUrl});
        }
      } catch (err) {
        Alert.alert('Error', 'No se pudo subir el logo.');
      } finally {
        setLogoUploading(false);
      }
    } catch (err) {
      // Picker error
    }
  }, [updateConfig]);

  const handleDeleteLogo = useCallback(async () => {
    setModal({
      visible: true, type: 'confirm', title: 'Eliminar logo',
      message: 'Se eliminara el logo actual del sistema.',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        try {
          const api = await apiService.createApiClient();
          await api.delete('/config/delivery/upload-logo');
          await updateConfig({shop_logo_url: ''});
        } catch (err) {
          Alert.alert('Error', 'No se pudo eliminar el logo.');
        }
      },
    });
  }, [updateConfig, setModal]);

  const resetAppearanceDefaults = () => {
    setShopName('JO-Delivery');
    setPrimaryColor('#FF6B35');
    setAccentColor('#E94560');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.appearanceLabel}>Nombre del sistema</Text>
      <View style={styles.appearanceInputWrap}>
        <Icon name="text-outline" size={18} color={theme.colors.textSecondary} />
        <TextInput
          value={shopName}
          onChangeText={setShopName}
          placeholder="JO-Delivery"
          placeholderTextColor={theme.colors.textLight}
          style={styles.appearanceInput}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.colorsRow}>
        <View style={styles.colorItem}>
          <Text style={styles.appearanceLabel}>Color primario</Text>
          <View style={styles.colorInputRow}>
            <View style={[styles.colorPreview, {backgroundColor: primaryColor}]} />
            <TextInput
              value={primaryColor}
              onChangeText={text => { if (/^#[0-9A-Fa-f]{0,6}$/.test(text)) setPrimaryColor(text); }}
              placeholder="#FF6B35"
              placeholderTextColor={theme.colors.textLight}
              style={styles.colorTextInput}
              maxLength={7}
              autoCapitalize="none"
            />
          </View>
        </View>
        <View style={styles.colorItem}>
          <Text style={styles.appearanceLabel}>Color secundario</Text>
          <View style={styles.colorInputRow}>
            <View style={[styles.colorPreview, {backgroundColor: accentColor}]} />
            <TextInput
              value={accentColor}
              onChangeText={text => { if (/^#[0-9A-Fa-f]{0,6}$/.test(text)) setAccentColor(text); }}
              placeholder="#E94560"
              placeholderTextColor={theme.colors.textLight}
              style={styles.colorTextInput}
              maxLength={7}
              autoCapitalize="none"
            />
          </View>
        </View>
      </View>

      <Text style={[styles.appearanceLabel, {marginTop: 4}]}>Vista previa</Text>
      <View style={[styles.previewCard, {backgroundColor: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`}]}>
        <Text style={styles.previewName}>{shopName || 'JO-Shop'}</Text>
        <Text style={styles.previewSubtext}>Tu tienda de confianza</Text>
      </View>
      <View style={styles.previewColors}>
        <View style={[styles.previewSwatch, {backgroundColor: primaryColor}]} />
        <View style={[styles.previewSwatch, {backgroundColor: accentColor}]} />
      </View>

      <Text style={[styles.appearanceLabel, {marginTop: 4}]}>Logo del sistema</Text>
      <View style={styles.logoRow}>
        <TouchableOpacity onPress={handlePickLogo} disabled={logoUploading} activeOpacity={0.7}>
          <View style={styles.logoPreview}>
            {logoUploading ? (
              <ActivityIndicator size="small" color={primary} />
            ) : config.shop_logo_url ? (
              <Image source={{uri: config.shop_logo_url}} style={styles.logoImage} resizeMode="cover" />
            ) : (
              <Icon name="image-outline" size={28} color={theme.colors.textLight} />
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.logoActions}>
          <TouchableOpacity onPress={handlePickLogo} disabled={logoUploading} style={styles.logoBtn} activeOpacity={0.7}>
            <Icon name="cloud-upload-outline" size={16} color={primary} />
            <Text style={styles.logoBtnText}>{logoUploading ? 'Subiendo...' : 'Subir logo'}</Text>
          </TouchableOpacity>
          {config.shop_logo_url ? (
            <TouchableOpacity onPress={handleDeleteLogo} style={styles.logoBtn} activeOpacity={0.7}>
              <Icon name="trash-outline" size={16} color="#EF4444" />
              <Text style={[styles.logoBtnText, {color: '#EF4444'}]}>Eliminar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <Text style={styles.logoHint}>Maximo 2MB. Formatos: JPG, PNG, WebP</Text>

      <View style={styles.appearanceButtons}>
        <TouchableOpacity onPress={resetAppearanceDefaults} style={styles.appearanceResetBtn} activeOpacity={0.7}>
          <Icon name="refresh-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.appearanceResetBtnText}>Restaurar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSaveAppearance} disabled={savingAppearance} style={[styles.appearanceSaveBtn, savingAppearance && {opacity: 0.6}]} activeOpacity={0.7}>
          {savingAppearance ? (
            <ActivityIndicator size="small" color={theme.colors.white} />
          ) : (
            <Icon name="checkmark-outline" size={16} color={theme.colors.white} />
          )}
          <Text style={styles.appearanceSaveBtnText}>
            {savingAppearance ? 'Guardando...' : 'Guardar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};





// ─── Servidor Backend ────────────────────────────────────────────────────────
const ServerSection = ({primary, styles, setModal}) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const envUrl = ENV.API_URL || '';

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await apiService.getApiConfig();
      const activeUrl = cfg.baseUrl || envUrl;
      setBaseUrl(activeUrl);
      const stored = await AsyncStorage.getItem('@jodelivery_api_config');
      const parsed = stored ? JSON.parse(stored) : null;
      setSaved(!!(parsed?.baseUrl && parsed.baseUrl.trim() !== ''));
    };
    loadConfig();
  }, []);

  const handleTestConnection = async () => {
    const url = normalizeUrl(baseUrl);
    if (!isValidUrl(url)) {
      setModal({visible: true, type: 'alert', title: 'URL invalida', message: 'Ingresa una URL valida (ej: https://mi-api.com)', confirmText: 'Aceptar', onConfirm: null});
      return;
    }
    setTesting(true);
    setConnectionStatus(null);
    const result = await apiService.checkConnection(url);
    setConnectionStatus(result);
    setTesting(false);
  };

  const handleSave = async () => {
    const url = normalizeUrl(baseUrl);
    if (!url || !isValidUrl(url)) {
      setModal({visible: true, type: 'alert', title: 'URL invalida', message: 'Ingresa una URL valida para el servidor.', confirmText: 'Aceptar', onConfirm: null});
      return;
    }
    const success = await apiService.saveApiConfig({
      ...(await apiService.getApiConfig()),
      baseUrl: url,
    });
    if (success) {
      setSaved(true);
      setModal({visible: true, type: 'alert', title: 'Guardado', message: 'Se usara esta URL como servidor.\n\nReinicia la app para aplicar los cambios completamente.', confirmText: 'Aceptar', onConfirm: null});
    } else {
      setModal({visible: true, type: 'alert', title: 'Error', message: 'No se pudo guardar la configuracion.', confirmText: 'Aceptar', onConfirm: null});
    }
  };

  const handleResetToEnv = () => {
    setModal({
      visible: true,
      type: 'confirm',
      title: 'Restaurar URL por defecto',
      message: `Se eliminara la URL personalizada y se usara:\n${envUrl}`,
      confirmText: 'Restaurar',
      onConfirm: async () => {
        await apiService.clearApiConfig();
        setBaseUrl(envUrl);
        setSaved(false);
        setConnectionStatus(null);
      },
    });
  };

  return (
    <>
      <View style={styles.envCard}>
        <View style={styles.envCardHeader}>
          <Icon name="hardware-chip-outline" size={18} color={primary} />
          <Text style={styles.envCardTitle}>URL embebida (compilacion)</Text>
        </View>
        <Text style={styles.envUrlText} numberOfLines={1}>{envUrl || 'No configurada'}</Text>
        <Text style={styles.envHint}>Definida en src/config/env.js antes de compilar</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            URL del servidor {saved ? '(personalizada)' : ''}
          </Text>
          <TextInput
            value={baseUrl}
            onChangeText={text => { setBaseUrl(text); setConnectionStatus(null); }}
            placeholder={envUrl || 'https://mi-servidor.com'}
            placeholderTextColor={theme.colors.textLight}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <Text style={styles.inputHint}>
            {saved
              ? 'Usando URL personalizada. Deja vacio para volver a la embebida.'
              : 'Usando URL embebida. Escribe otra para sobreescribir.'}
          </Text>
        </View>

        {connectionStatus && (
          <View
            style={[
              styles.statusBadge,
              connectionStatus.success ? styles.statusSuccess : styles.statusError,
            ]}>
            <Icon
              name={connectionStatus.success ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={connectionStatus.success ? theme.colors.success : primary}
            />
            <Text
              style={[
                styles.statusText,
                connectionStatus.success ? styles.statusTextSuccess : styles.statusTextError,
              ]}>
              {connectionStatus.message}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleTestConnection}
            style={[styles.actionButton, styles.testButton]}
            disabled={testing || !baseUrl.trim()}
            activeOpacity={0.8}>
            <Icon name="wifi-outline" size={18} color={theme.colors.text} />
            <Text style={styles.actionButtonText}>{testing ? 'Probando...' : 'Probar'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.actionButton, styles.saveButton]}
            activeOpacity={0.8}>
            <Icon name="save-outline" size={18} color={theme.colors.white} />
            <Text style={[styles.actionButtonText, {color: theme.colors.white}]}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {saved && (
        <TouchableOpacity
          onPress={handleResetToEnv}
          style={styles.resetButton}
          activeOpacity={0.8}>
          <Icon name="refresh-outline" size={18} color={primary} />
          <Text style={styles.resetButtonText}>Restaurar URL embebida</Text>
        </TouchableOpacity>
      )}
    </>
  );
};

// ─── Acerca de ───────────────────────────────────────────────────────────────
const AboutSection = ({primary, styles, config}) => (
  <View style={styles.card}>
    <View style={styles.aboutRow}>
      <Icon name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
      <View style={styles.aboutInfo}>
        <Text style={styles.aboutLabel}>Version</Text>
        <Text style={styles.aboutValue}>1.0.0</Text>
      </View>
    </View>
    <View style={styles.aboutDivider} />
    <View style={styles.aboutRow}>
      <Icon name="code-outline" size={20} color={theme.colors.textSecondary} />
      <View style={styles.aboutInfo}>
        <Text style={styles.aboutLabel}>Desarrollado con</Text>
        <Text style={styles.aboutValue}>React Native (CLI)</Text>
      </View>
    </View>
    <View style={styles.aboutDivider} />
    <View style={styles.aboutRow}>
      <Icon name="heart-outline" size={20} color={primary} />
      <View style={styles.aboutInfo}>
        <Text style={styles.aboutLabel}>{config.shop_name || 'JO-Delivery'}</Text>
        <Text style={styles.aboutValue}>Tu servicio de entrega</Text>
      </View>
    </View>
  </View>
);

// ─── Section metadata ────────────────────────────────────────────────────────
const SECTION_META = {
  appearance: {title: 'Apariencia', icon: 'color-palette-outline', color: '#FF6B35'},
  server: {title: 'Servidor Backend', icon: 'server-outline', color: '#4FACFE'},
  about: {title: 'Acerca de', icon: 'information-circle-outline', color: '#56AB2F'},
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
const SettingsSectionScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {isAdmin} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const {config, updateConfig} = useConfig();
  const [modal, setModal] = useState({visible: false, type: 'alert', title: '', message: '', confirmText: 'Aceptar', onConfirm: null});


  const section = route.params?.section || 'appearance';
  const meta = SECTION_META[section] || SECTION_META.appearance;

  const renderContent = () => {
    switch (section) {
      case 'appearance':
        return <AppearanceSection primary={primary} styles={styles} config={config} updateConfig={updateConfig} setModal={setModal} />;
      case 'server':
        return <ServerSection primary={primary} styles={styles} setModal={setModal} />;
      case 'about':
        return <AboutSection primary={primary} styles={styles} config={config} />;
      default:
        return <AboutSection primary={primary} styles={styles} config={config} />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{meta.title}</Text>
          </View>
          <View style={{width: 40}} />
        </View>

        <View style={styles.section}>
          {renderContent()}
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
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

const createStyles = primary => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  // ─── Toggle ──────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  toggleIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  toggleLabel: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  toggleDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  switchWrapper: {
    width: 52,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.sm,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeDotSingle: {backgroundColor: '#3498DB'},
  modeDotMulti: {backgroundColor: primary},
  modeText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  configHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: theme.spacing.sm,
    lineHeight: 16,
  },
  // ─── Appearance ──────────────────────────────────────────────
  appearanceLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
  },
  appearanceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    marginBottom: 16,
  },
  appearanceInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    height: '100%',
    padding: 0,
  },
  colorsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  colorItem: {flex: 1},
  colorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    gap: 8,
  },
  colorPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  colorTextInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontFamily: 'monospace',
    height: '100%',
    padding: 0,
  },
  previewCard: {
    borderRadius: theme.borderRadius.md,
    padding: 16,
    minHeight: 80,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewName: {
    color: 'white',
    fontWeight: '800',
    fontSize: 20,
  },
  previewSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  previewColors: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  previewSwatch: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  logoPreview: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoActions: {
    flex: 1,
    gap: 8,
  },
  logoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  logoBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: primary,
  },
  logoHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginBottom: 16,
  },
  appearanceButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  appearanceResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.inputBg,
  },
  appearanceResetBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  appearanceSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: theme.borderRadius.md,
    backgroundColor: primary,
  },
  appearanceSaveBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.white,
  },
  // ─── Banners ─────────────────────────────────────────────────
  bannerList: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  bannerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  bannerThumb: {
    width: 64,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.border,
  },
  bannerThumbWrapper: {
    width: 64,
    height: 36,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerThumbOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerItemInfo: {flex: 1},
  bannerItemLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  bannerItemUrl: {
    fontSize: 10,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  bannerRemoveBtn: {padding: 4},
  addBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderWidth: 2,
    borderColor: primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    backgroundColor: primary + '08',
  },
  addBannerBtnText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: primary,
  },
  // ─── Server ──────────────────────────────────────────────────
  envCard: {
    backgroundColor: '#FFF8F0',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#FFD6A0',
    marginBottom: theme.spacing.sm,
  },
  envCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  envCardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: '#CC7A00',
  },
  envUrlText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    fontFamily: 'monospace',
  },
  envHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  inputGroup: {marginBottom: theme.spacing.md},
  inputLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  inputHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textLight,
    marginTop: theme.spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
  },
  statusSuccess: {backgroundColor: '#E8F8F0'},
  statusError: {backgroundColor: '#FDE8EC'},
  statusText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  statusTextSuccess: {color: '#27AE60'},
  statusTextError: {color: primary},
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  testButton: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  saveButton: {backgroundColor: primary},
  actionButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: primary,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
    backgroundColor: '#FDE8EC',
  },
  resetButtonText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: primary,
  },
  // ─── About ───────────────────────────────────────────────────
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  aboutInfo: {marginLeft: theme.spacing.md},
  aboutLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  aboutValue: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 44,
  },
  bottomSpacing: {
    height: theme.spacing.xxl,
  },
});

export default SettingsSectionScreen;
