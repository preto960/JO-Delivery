import React, {useState, useMemo, useEffect} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

const LoginScreen = ({navigation, route}) => {
  const {login, isLoading, error, clearError, isAuthenticated} = useAuth();
  const {config} = useConfig();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const shopName = config.shop_name || 'JO-Delivery';
  const shopLogoUrl = config.shop_logo_url || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const saved = await AsyncStorage.getItem('@jodelivery_saved_credentials');
        if (saved) {
          const { email: savedEmail, password: savedPassword } = JSON.parse(saved);
          if (savedEmail) setEmail(savedEmail);
          if (savedPassword) setPassword(savedPassword);
        }
      } catch {}
    };
    loadSavedCredentials();
  }, []);

  const handleLogin = async () => {
    setLocalError('');

    if (!email.trim()) {
      setLocalError('Ingresa tu correo electrónico');
      return;
    }
    if (!password.trim()) {
      setLocalError('Ingresa tu contraseña');
      return;
    }

    const result = await login(email.trim().toLowerCase(), password);
    console.log('[LoginScreen] login result:', JSON.stringify(result));
    if (result.success) {
      try {
        await AsyncStorage.setItem('@jodelivery_saved_credentials', JSON.stringify({ email, password }));
      } catch {}
    }
    if (!result.success) {
      if (result.requiresOtp) {
        // 2FA requerido — por ahora mostrar error (se puede agregar pantalla de verificación después)
        setLocalError('Se requiere verificación en 2 pasos. Contacta al administrador.');
      } else {
        setLocalError(result.error || 'Error al iniciar sesión');
      }
    }
  };

  const errorMessage = localError || error;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoContainer}>
            {shopLogoUrl ? (
              <Image source={{uri: shopLogoUrl}} style={styles.logoImage} resizeMode="contain" />
            ) : (
              <>
                <View style={styles.logoCircle}>
                  <Icon name="bicycle" size={40} color={theme.colors.white} />
                </View>
                <Text style={styles.logoText}>{shopName}</Text>
              </>
            )}
            <Text style={styles.subtitle}>Inicia sesión para continuar</Text>
          </View>

          {/* Error */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={18} color={primary} />
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity onPress={() => {setLocalError(''); clearError();}}>
                <Icon name="close" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Correo electrónico</Text>
            <View style={styles.inputContainer}>
              <Icon name="mail-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                value={email}
                onChangeText={text => {setEmail(text); setLocalError(''); clearError();}}
                placeholder="tu@correo.com"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputContainer}>
              <Icon name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                value={password}
                onChangeText={text => {setPassword(text); setLocalError(''); clearError();}}
                placeholder="Tu contraseña"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}>
                <Icon
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              style={[styles.loginButton, isLoading && styles.buttonDisabled]}
              disabled={isLoading}
              activeOpacity={0.8}>
              <Text style={styles.loginButtonText}>
                {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </Text>
            </TouchableOpacity>

            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>
                Contacta al administrador si necesitas acceso.
              </Text>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (primary) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
    marginBottom: theme.spacing.md,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
  },
  logoText: {
    fontSize: theme.fontSize.hero,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE8EC',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm + 2,
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: primary,
    fontWeight: '500',
  },
  form: {
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    height: 52,
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    height: '100%',
  },
  loginButton: {
    backgroundColor: primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md + 4,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    ...theme.shadows.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  infoContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  infoText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
});

export default LoginScreen;
