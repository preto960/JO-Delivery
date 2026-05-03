import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CommonActions} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import apiService from '@services/api';
import {useAuth} from '@context/AuthContext';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

const VerificationScreen = ({route, navigation}) => {
  const {email, type = 'login', user, token, refreshToken, otpCode, twoFactorType = 'email', onComplete} = route.params || {};
  const {loginWithOtp, resendOtpCode, isAuthenticated, isAdmin, hasRole} = useAuth();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const isDelivery = hasRole('delivery');

  // Cuando el login con OTP exita, isAuthenticated cambia a true
  // Navegar automaticamente a la pantalla principal correcta
  useEffect(() => {
    if (!isAuthenticated || type !== 'login') return;

    const timer = setTimeout(() => {
      try {
        let targetScreen = 'DeliveryMainTabs';
        if (isAdmin) targetScreen = 'AdminMainTabs';

        navigation.dispatch(CommonActions.reset({
          index: 0,
          routes: [{name: targetScreen}],
        }));
      } catch (e) {
        console.log('[VerificationScreen] Navigation reset error:', e.message);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isAuthenticated, type, isDelivery, isAdmin, navigation]);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef([]);
  const mountedRef = useRef(true);

  // Email para mostrar
  const displayEmail = email || '';

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Countdown para reenviar
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      if (mountedRef.current) {
        setResendCooldown(prev => Math.max(0, prev - 1));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Enfocar primer input al montar
  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  // Generar OTP al montar
  // - Para login: no generar, el codigo ya fue enviado en el endpoint /auth/login
  // - Para otros tipos (register/reset): usar endpoint general
  useEffect(() => {
    if (type !== 'login') {
      handleGenerateOtp();
    } else if (twoFactorType === 'email') {
      // Para login con email, iniciar cooldown ya que el codigo fue enviado con /auth/login
      setResendCooldown(RESEND_COOLDOWN);
    }
    // Para TOTP no se inicia cooldown porque no se envía código
  }, []);

  // Auto-rellenar OTP en modo desarrollo
  useEffect(() => {
    if (otpCode && type === 'login') {
      const codeStr = String(otpCode);
      const newOtp = ['' , '', '', '', '', ''];
      for (let i = 0; i < codeStr.length && i < OTP_LENGTH; i++) {
        newOtp[i] = codeStr[i];
      }
      setOtp(newOtp);
    }
  }, [otpCode, type]);

  const handleGenerateOtp = useCallback(async () => {
    if (!displayEmail) return;
    try {
      const api = await apiService.createApiClient();
      await api.post('/auth/otp/generate', {
        email: displayEmail,
        type: type || 'login',
      });
      if (mountedRef.current) {
        setResendCooldown(RESEND_COOLDOWN);
      }
    } catch (err) {
      // En desarrollo, el codigo viene en la respuesta
      const responseData = err.response?.data;
      if (responseData?.code && mountedRef.current) {
        // Llenar campos automaticamente en desarrollo
        const codeStr = String(responseData.code);
        const newOtp = [...otp];
        for (let i = 0; i < codeStr.length && i < OTP_LENGTH; i++) {
          newOtp[i] = codeStr[i];
        }
        setOtp(newOtp);
      }
    }
  }, [displayEmail, type]);

  const handleInputChange = (index, value) => {
    // Solo numeros
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length > 1) {
      // Si pegan un codigo completo
      const chars = numericValue.slice(0, OTP_LENGTH).split('');
      const newOtp = [...otp];
      chars.forEach((char, i) => {
        if (index + i < OTP_LENGTH) {
          newOtp[index + i] = char;
        }
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + chars.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = numericValue;
    setOtp(newOtp);

    // Auto-avanzar al siguiente input
    if (numericValue && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index, key) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      // Retroceder al input anterior si el actual esta vacio
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    console.log('[VerificationScreen] handleVerify - code length:', code.length, 'type:', type, 'email:', displayEmail);
    if (code.length !== OTP_LENGTH) {
      Alert.alert('Codigo incompleto', 'Ingresa los 6 digitos del codigo de verificacion.');
      return;
    }

    if (!displayEmail) return;

    setLoading(true);
    try {
      if (type === 'login') {
        // Flujo de login: verificar OTP via loginWithOtp
        console.log('[VerificationScreen] Llamando loginWithOtp con email:', displayEmail, 'code:', code, 'type:', twoFactorType);
        const result = await loginWithOtp(displayEmail, code, twoFactorType);
        console.log('[VerificationScreen] loginWithOtp result:', JSON.stringify(result));
        if (!result.success) {
          Alert.alert('Error', result.error || 'Error al verificar el código');
          if (mountedRef.current) setLoading(false);
          return;
        }
        // Login exitoso: el estado de autenticación cambia y AppNavigator redirige automáticamente
        console.log('[VerificationScreen] Login exitoso con OTP, redirigiendo...');
      } else {
        // Flujo de registro / reset: verificar OTP via endpoint general
        const api = await apiService.createApiClient();
        await api.post('/auth/otp/verify', {
          email: displayEmail,
          code,
          type: type || 'login',
        });

        // Verificacion exitosa
        if (onComplete) {
          onComplete();
        } else if (navigation) {
          navigation.navigate('Login', {verified: true});
        }
      }
    } catch (err) {
      console.log('[VerificationScreen] handleVerify error:', err.message, err.response?.data);
      const errorMessage = err.response?.data?.error || err.message || 'Error al verificar el codigo';
      Alert.alert('Error', errorMessage);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    // Limpiar campos
    setOtp(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();

    if (type === 'login') {
      // Para login 2FA, usar el endpoint dedicado de resend
      const result = await resendOtpCode(displayEmail);
      if (result.success) {
        setResendCooldown(RESEND_COOLDOWN);
      } else {
        Alert.alert('Error', result.error || 'No se pudo reenviar el codigo');
      }
    } else {
      await handleGenerateOtp();
    }
  };

  const formatCooldown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const typeLabels = {
    login: 'inicio de sesion',
    register: 'registro',
    reset: 'restablecimiento de contraseña',
  };
  const typeLabel = typeLabels[type] || 'verificacion';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (type === 'login') {
                navigation.replace('Login');
              } else {
                navigation.goBack();
              }
            }}
            activeOpacity={0.7}
          >
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Icono */}
          <View style={styles.iconContainer}>
            <Icon
              name={twoFactorType === 'totp' ? 'phone-portrait-outline' : 'shield-checkmark'}
              size={60}
              color={primary}
            />
          </View>

          <Text style={styles.title}>
            {twoFactorType === 'totp' ? 'Autenticacion con App' : 'Verificacion en 2 pasos'}
          </Text>
          <Text style={styles.subtitle}>
            {twoFactorType === 'totp'
              ? 'Ingresa el codigo de 6 digitos de tu aplicacion authenticator'
              : 'Ingresa el codigo de 6 digitos que enviamos a:'}
          </Text>
          {twoFactorType !== 'totp' && (
            <Text style={styles.emailText}>{displayEmail}</Text>
          )}
          <Text style={styles.typeHint}>Para completar tu {typeLabel}</Text>

          {/* Inputs OTP */}
          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={ref => inputRefs.current[index] = ref}
                style={[
                  styles.otpInput,
                  digit && styles.otpInputFilled,
                ]}
                value={digit}
                onChangeText={value => handleInputChange(index, value)}
                onKeyPress={({nativeEvent}) => handleKeyPress(index, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={index === 0}
              />
            ))}
          </View>

          {/* Boton verificar */}
          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.verifyButtonDisabled]}
            onPress={handleVerify}
            disabled={loading || otp.join('').length !== OTP_LENGTH}
            activeOpacity={0.7}
          >
            {loading ? (
              <Text style={styles.verifyButtonText}>Verificando...</Text>
            ) : (
              <Text style={styles.verifyButtonText}>Verificar</Text>
            )}
          </TouchableOpacity>

          {/* Reenviar codigo - solo para email, no para TOTP */}
          {twoFactorType !== 'totp' && (
            <View style={styles.resendContainer}>
              {resendCooldown > 0 ? (
                <Text style={styles.resendCooldownText}>
                  Reenviar en {formatCooldown(resendCooldown)}
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
                  <Text style={styles.resendButtonText}>
                    Reenviar codigo
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Ayuda */}
          <View style={styles.helpContainer}>
            <Icon name="information-circle-outline" size={16} color={theme.colors.textLight} />
            <Text style={styles.helpText}>
              {twoFactorType === 'totp'
                ? 'Abre tu aplicacion authenticator (Google Authenticator, Authy, etc.) para obtener el codigo.'
                : 'Si no recibes el codigo, revisa tu carpeta de spam o correo no deseado.'}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (primary) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  iconContainer: {
    alignSelf: 'center',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    color: primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  typeHint: {
    fontSize: 13,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginBottom: 32,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
  },
  otpInput: {
    width: 48,
    height: 56,
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
  otpInputFilled: {
    borderColor: primary,
    backgroundColor: primary + '08',
  },
  verifyButton: {
    backgroundColor: primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  resendCooldownText: {
    fontSize: 14,
    color: theme.colors.textLight,
  },
  resendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: primary,
  },
  helpContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.colors.inputBg,
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
});

export default VerificationScreen;
