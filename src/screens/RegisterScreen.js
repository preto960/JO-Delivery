import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';
import useThemeColors from '@hooks/useThemeColors';

const ROLE_OPTIONS = [
  {
    key: 'customer',
    label: 'Cliente',
    description: 'Comprar productos y hacer pedidos',
    icon: 'bag-outline',
    color: theme.colors.accent,
    bgColor: theme.colors.accent + '15',
  },
  {
    key: 'delivery',
    label: 'Delivery',
    description: 'Realizar entregas de pedidos',
    icon: 'bicycle-outline',
    color: '#1ABC9C',
    bgColor: '#1ABC9C15',
  },
];

const RegisterScreen = ({navigation}) => {
  const {register, isLoading, error, clearError} = useAuth();
  const {config} = useConfig();
  const {primary} = useThemeColors();
  const styles = useMemo(() => createStyles(primary), [primary]);
  const shopName = config.shop_name || 'JO-Delivery';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('delivery');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  // Password rules
  const passwordRules = [
    {label: 'Al menos 6 caracteres', met: password.length >= 6},
    {label: 'Una letra mayúscula', met: /[A-Z]/.test(password)},
    {label: 'Un número', met: /[0-9]/.test(password)},
  ];
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const allRulesMet = passwordRules.every(r => r.met) && passwordsMatch;

  const handleRegister = async () => {
    setLocalError('');

    if (!selectedRole) {
      setLocalError('Selecciona un tipo de cuenta');
      return;
    }
    if (!name.trim() || name.trim().length < 2) {
      setLocalError('El nombre debe tener al menos 2 caracteres');
      return;
    }
    if (!email.trim()) {
      setLocalError('Ingresa tu correo electrónico');
      return;
    }
    if (password.length < 6) {
      setLocalError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setLocalError('La contraseña debe tener al menos una mayúscula');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setLocalError('La contraseña debe tener al menos un número');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden');
      return;
    }

    const result = await register(name.trim(), email.trim().toLowerCase(), password, selectedRole);
    if (!result.success) {
      setLocalError(result.error);
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
          {/* Header */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.7}>
            <Icon name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Crear cuenta</Text>
            <Text style={styles.subtitle}>Regístrate para empezar a usar {shopName}</Text>
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
            {/* Role Selection */}
            <Text style={styles.label}>Tipo de cuenta</Text>
            <View style={styles.roleContainer}>
              {ROLE_OPTIONS.map(option => {
                const isSelected = selectedRole === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setSelectedRole(option.key)}
                    style={[
                      styles.roleCard,
                      isSelected && {backgroundColor: option.bgColor, borderColor: option.color},
                    ]}
                    activeOpacity={0.7}>
                    <View style={[
                      styles.roleIconContainer,
                      isSelected && {backgroundColor: option.color},
                    ]}>
                      <Icon
                        name={option.icon}
                        size={24}
                        color={isSelected ? theme.colors.white : option.color}
                      />
                    </View>
                    <Text style={[
                      styles.roleLabel,
                      isSelected && {color: option.color},
                    ]}>
                      {option.label}
                    </Text>
                    <Text style={styles.roleDescription} numberOfLines={2}>
                      {option.description}
                    </Text>
                    {isSelected && (
                      <View style={[styles.roleCheck, {backgroundColor: option.color}]}>
                        <Icon name="checkmark" size={14} color={theme.colors.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Nombre completo</Text>
            <View style={styles.inputContainer}>
              <Icon name="person-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                value={name}
                onChangeText={text => {setName(text); setLocalError('');}}
                placeholder="Tu nombre"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.label}>Correo electrónico</Text>
            <View style={styles.inputContainer}>
              <Icon name="mail-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                value={email}
                onChangeText={text => {setEmail(text); setLocalError('');}}
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
                onChangeText={text => {setPassword(text); setLocalError('');}}
                placeholder="Mínimo 6 caracteres, 1 mayúscula, 1 número"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} activeOpacity={0.7}>
                <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Password Rules Indicator */}
            {password.length > 0 && (
              <View style={styles.passwordRulesContainer}>
                <Text style={styles.passwordRulesTitle}>
                  {allRulesMet ? 'Contraseña valida' : 'Requisitos de contraseña:'}
                </Text>
                {passwordRules.map((rule, i) => (
                  <View key={i} style={styles.passwordRuleRow}>
                    <View style={[styles.passwordRuleDot, rule.met && styles.passwordRuleDotMet]}>
                      {rule.met && <Icon name="checkmark" size={10} color={theme.colors.white} />}
                    </View>
                    <Text style={[styles.passwordRuleText, rule.met && styles.passwordRuleTextMet]}>
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.label}>Confirmar contraseña</Text>
            <View style={[
              styles.inputContainer,
              confirmPassword.length > 0 && (passwordsMatch
                ? {borderColor: theme.colors.success}
                : {borderColor: '#EF4444'}),
            ]}>
              <Icon name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
              <TextInput
                value={confirmPassword}
                onChangeText={text => {setConfirmPassword(text); setLocalError('');}}
                placeholder="Repite tu contraseña"
                placeholderTextColor={theme.colors.textLight}
                style={styles.input}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              {confirmPassword.length > 0 && (
                <Icon
                  name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={passwordsMatch ? theme.colors.success : '#EF4444'}
                />
              )}
            </View>

            <TouchableOpacity
              onPress={handleRegister}
              style={[styles.registerButton, isLoading && styles.buttonDisabled]}
              disabled={isLoading}
              activeOpacity={0.8}>
              <Text style={styles.registerButtonText}>
                {isLoading ? 'Creando cuenta...' : 'Crear cuenta'}
              </Text>
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>¿Ya tienes cuenta? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} activeOpacity={0.7}>
                <Text style={styles.loginLink}>Inicia sesión</Text>
              </TouchableOpacity>
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
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  backButton: {
    marginBottom: theme.spacing.md,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.title,
    fontWeight: '700',
    color: theme.colors.text,
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

  // Role Selection
  roleContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  roleCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    alignItems: 'center',
    position: 'relative',
    ...theme.shadows.sm,
  },
  roleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  roleLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 2,
  },
  roleDescription: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  roleCheck: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
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
  registerButton: {
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
  registerButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  loginText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  loginLink: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: primary,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  linkText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  passwordRulesContainer: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passwordRulesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  passwordRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  passwordRuleDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordRuleDotMet: {
    backgroundColor: theme.colors.success,
  },
  passwordRuleText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  passwordRuleTextMet: {
    color: theme.colors.success,
    fontWeight: '600',
  },
});

export default RegisterScreen;
