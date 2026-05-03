import React, {createContext, useContext, useReducer, useCallback, useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '@services/api';
import pushNotifications from '@services/notifications';
import OneSignal from 'react-native-onesignal';

const AUTH_KEY = '@jodelivery_auth';

const AuthContext = createContext(null);

const ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_RESTORING: 'SET_RESTORING',
  SET_USER: 'SET_USER',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESTORE_SESSION: 'RESTORE_SESSION',
};

const initialState = {
  user: null,
  token: null,
  refreshToken: null,
  isLoading: false,
  isRestoring: true,
  isAuthenticated: false,
  error: null,
};

const authReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.SET_LOADING:
      return {...state, isLoading: action.payload};
    case ACTIONS.SET_RESTORING:
      return {...state, isRestoring: action.payload};
    case ACTIONS.SET_USER:
      return {...state, user: action.payload, isLoading: false};
    case ACTIONS.LOGIN:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        isRestoring: false,
        error: null,
      };
    case ACTIONS.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
        isRestoring: false,
      };
    case ACTIONS.UPDATE_PROFILE:
      return {...state, user: {...state.user, ...action.payload}};
    case ACTIONS.SET_ERROR:
      return {...state, error: action.payload, isLoading: false};
    case ACTIONS.CLEAR_ERROR:
      return {...state, error: null};
    case ACTIONS.RESTORE_SESSION:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: !!action.payload.token,
        isLoading: false,
        isRestoring: false,
      };
    default:
      return state;
  }
};

export const AuthProvider = ({children}) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const saveSession = useCallback(async (data) => {
    try {
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(data));
    } catch {}
  }, []);

  const clearSession = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(AUTH_KEY);
    } catch {}
  }, []);

  // Restaurar sesión al iniciar
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          dispatch({
            type: ACTIONS.RESTORE_SESSION,
            payload: {
              user: parsed.user,
              token: parsed.token,
              refreshToken: parsed.refreshToken,
            },
          });
        } else {
          dispatch({type: ACTIONS.SET_RESTORING, payload: false});
        }
      } catch {
        dispatch({type: ACTIONS.SET_RESTORING, payload: false});
      }
    };
    restoreSession();
  }, []);

  // Login
  const login = useCallback(async (email, password) => {
    try {
      dispatch({type: ACTIONS.SET_LOADING, payload: true});
      dispatch({type: ACTIONS.CLEAR_ERROR});

      const api = await apiService.createApiClient();
      if (!api) {
        throw new Error('Configura la URL del servidor en Ajustes');
      }

      const response = await api.post('/auth/login', {email, password});
      console.log('[AuthContext] login response:', JSON.stringify(response));

      // Verificar si se requiere 2FA (OTP)
      if (response.requiresOtp) {
        console.log('[AuthContext] 2FA requerido, email:', response.email);
        dispatch({type: ACTIONS.SET_LOADING, payload: false});
        return {
          success: false,
          requiresOtp: true,
          email: response.email,
          otpCode: response.code,
          twoFactorType: response.twoFactorType || 'email',
        };
      }

      const {user, token, refreshToken} = response;

      await saveSession({user, token, refreshToken});

      dispatch({
        type: ACTIONS.LOGIN,
        payload: {user, token, refreshToken},
      });

      return {success: true};
    } catch (err) {
      console.log('[AuthContext] login error:', err.message, err.response?.data);
      let message = 'Error al iniciar sesión';
      if (err.response?.data) {
        const data = err.response.data;
        message = typeof data.error === 'string' ? data.error : (data.message || message);
      } else if (err.message) {
        message = err.message;
      }
      dispatch({type: ACTIONS.SET_ERROR, payload: message});
      return {success: false, error: message};
    }
  }, [saveSession]);

  // Login con OTP (2FA)
  const loginWithOtp = useCallback(async (email, otpCode, verifyType = 'email') => {
    try {
      dispatch({type: ACTIONS.SET_LOADING, payload: true});
      dispatch({type: ACTIONS.CLEAR_ERROR});

      const api = await apiService.createApiClient();
      if (!api) {
        throw new Error('Configura la URL del servidor en Ajustes');
      }

      console.log('[AuthContext] loginWithOtp - llamando /auth/login-verify con email:', email, 'code:', otpCode);
      const response = await api.post('/auth/login-verify', {
        email,
        code: otpCode,
        type: verifyType,
      });
      console.log('[AuthContext] loginWithOtp - response:', JSON.stringify(response));
      const {user, token, refreshToken} = response;

      await saveSession({user, token, refreshToken});

      dispatch({
        type: ACTIONS.LOGIN,
        payload: {user, token, refreshToken},
      });

      return {success: true};
    } catch (err) {
      console.log('[AuthContext] loginWithOtp - error:', err.message, err.response?.data);
      let message = 'Error al verificar el código';
      if (err.response?.data) {
        const data = err.response.data;
        message = typeof data.error === 'string' ? data.error : (data.message || message);
      } else if (err.message) {
        message = err.message;
      }
      dispatch({type: ACTIONS.SET_ERROR, payload: message});
      return {success: false, error: message};
    }
  }, [saveSession]);

  // Registro
  const register = useCallback(async (name, email, password, role = 'delivery') => {
    try {
      dispatch({type: ACTIONS.SET_LOADING, payload: true});
      dispatch({type: ACTIONS.CLEAR_ERROR});

      const api = await apiService.createApiClient();
      if (!api) {
        throw new Error('Configura la URL del servidor en Ajustes');
      }

      const response = await api.post('/auth/register', {name, email, password, role});
      const {user, token, refreshToken} = response;

      await saveSession({user, token, refreshToken});

      dispatch({
        type: ACTIONS.LOGIN,
        payload: {user, token, refreshToken},
      });

      return {success: true};
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Error al registrar';
      dispatch({type: ACTIONS.SET_ERROR, payload: message});
      return {success: false, error: message};
    }
  }, [saveSession]);

  // Logout
  const logout = useCallback(async () => {
    // Desregistrar token FCM antes de cerrar sesion
    pushNotifications.unregisterPushToken().catch(() => {});
    await clearSession();
    dispatch({type: ACTIONS.LOGOUT});
  }, [clearSession]);

  // Refrescar token
  const refreshAccessToken = useCallback(async () => {
    try {
      const api = await apiService.createApiClient();
      if (!api || !state.refreshToken) return false;

      const response = await api.post('/auth/refresh', {
        refreshToken: state.refreshToken,
      });

      const {token, refreshToken} = response;
      const newSession = {
        user: state.user,
        token,
        refreshToken,
      };

      await saveSession(newSession);
      dispatch({
        type: ACTIONS.RESTORE_SESSION,
        payload: newSession,
      });

      return true;
    } catch {
      return false;
    }
  }, [state.refreshToken, state.user, saveSession]);

  // Obtener perfil actualizado
  const fetchProfile = useCallback(async () => {
    try {
      const api = await apiService.createApiClient();
      if (!api) return;

      const profile = await api.get('/auth/me');
      dispatch({type: ACTIONS.SET_USER, payload: profile});

      // Actualizar sesión persistida
      await saveSession({
        user: profile,
        token: state.token,
        refreshToken: state.refreshToken,
      });
    } catch {}
  }, [state.token, state.refreshToken, saveSession]);

  // Actualizar token en headers del apiService
  useEffect(() => {
    if (state.token) {
      apiService.setAuthToken(state.token);
    } else {
      apiService.setAuthToken(null);
    }
  }, [state.token]);

  // Registrar token push al iniciar sesion / restaurar sesion
  // Solo se registra una vez por sesion y por usuario.
  // Tambien llama OneSignal.setExternalUserId() para que el backend pueda
  // enviar notificaciones usando include_external_user_ids.
  const lastRegisteredUserIdRef = useRef(null);
  const lastRegisteredTokenRef = useRef(null);

  const doRegisterFcmToken = useCallback(async (userId) => {
    if (!pushNotifications.isFirebaseAvailable()) return;

    try {
      const currentToken = await pushNotifications.getFCMToken();
      if (!currentToken) return;

      // Si ya esta registrado para este usuario con este token, no hacer nada
      if (lastRegisteredUserIdRef.current === userId && lastRegisteredTokenRef.current === currentToken) {
        console.log('[Auth] Token ya registrado para este usuario, omitiendo');
        return;
      }

      // ── CRITICO: Asociar el dispositivo con el usuario en OneSignal ──
      // Sin esto, el backend no puede enviar notificaciones usando include_external_user_ids
      OneSignal.setExternalUserId(String(userId), (results) => {
        if (results.push && results.push.success) {
          console.log('[Auth] OneSignal External ID set para user', userId);
        } else {
          console.warn('[Auth] OneSignal External ID fallo:', JSON.stringify(results));
        }
      });

      const api = await apiService.createApiClient();
      if (!api) {
        console.log('[Push] No hay conexion al servidor para registrar token');
        return;
      }

      await api.post('/notifications/token', {
        token: currentToken,
        platform: Platform.OS,
      });

      lastRegisteredUserIdRef.current = userId;
      lastRegisteredTokenRef.current = currentToken;
      console.log('[Auth] Token registrado exitosamente para user', userId);
    } catch (err) {
      console.error('[Auth] Error registrando token:', err.message);
      // Reintentar una vez despues de 3 segundos
      setTimeout(() => {
        if (lastRegisteredUserIdRef.current !== userId || lastRegisteredTokenRef.current !== currentToken) {
          doRegisterFcmToken(userId);
        }
      }, 3000);
    }
  }, []);

  useEffect(() => {
    if (state.isAuthenticated && state.user?.id) {
      // Registrar despues de un breve delay para asegurar que el authToken este configurado
      const timer = setTimeout(() => {
        doRegisterFcmToken(state.user.id);
      }, 1500);
      return () => clearTimeout(timer);
    }
    // Al cerrar sesion, limpiar refs
    if (!state.isAuthenticated) {
      lastRegisteredUserIdRef.current = null;
      lastRegisteredTokenRef.current = null;
    }
  }, [state.isAuthenticated, state.user?.id, doRegisterFcmToken]);

  // Escuchar refresh del token FCM y registrar el nuevo en el backend
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const unsubscribe = pushNotifications.onTokenRefresh((newToken) => {
      console.log('[Auth] Token FCM refrescado, registrando en backend:', newToken?.substring(0, 20) + '...');
      lastRegisteredTokenRef.current = null; // Invalidar cache para forzar re-registro
      if (state.user?.id) {
        doRegisterFcmToken(state.user.id);
      }
    });
    return unsubscribe;
  }, [state.isAuthenticated, state.user?.id, doRegisterFcmToken]);

  // ─── 2FA: Enviar codigo para activar/desactivar ─────────────────────
  const send2FACode = useCallback(async (action) => {
    try {
      const api = await apiService.createApiClient();
      if (!api) throw new Error('No hay conexion con el servidor');

      const response = await api.post('/auth/2fa/send-code', { action });
      return { success: true, message: response.message };
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo enviar el codigo';
      return { success: false, error: message };
    }
  }, []);

  // ─── 2FA: Verificar codigo y completar activacion/desactivacion ─────────
  const verify2FASetup = useCallback(async (code, action) => {
    try {
      const api = await apiService.createApiClient();
      if (!api) throw new Error('No hay conexion con el servidor');

      const response = await api.post('/auth/2fa/verify-setup', { code, action });

      // Actualizar el usuario en estado y storage
      if (response.user) {
        const updatedUser = response.user;
        dispatch({ type: ACTIONS.UPDATE_PROFILE, payload: { twoFactorEnabled: updatedUser.twoFactorEnabled } });

        // Actualizar session en AsyncStorage
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          await saveSession({
            user: { ...parsed.user, twoFactorEnabled: updatedUser.twoFactorEnabled },
            token: parsed.token,
            refreshToken: parsed.refreshToken,
          });
        }

        // Refrescar perfil completo
        fetchProfile();
      }

      return { success: true, twoFactorEnabled: response.twoFactorEnabled };
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo verificar el codigo';
      return { success: false, error: message };
    }
  }, [saveSession, fetchProfile]);

  // ─── 2FA: Reenviar codigo OTP durante login ────────────────────────────
  const resendOtpCode = useCallback(async (email) => {
    try {
      const api = await apiService.createApiClient();
      if (!api) throw new Error('No hay conexion con el servidor');

      await api.post('/auth/2fa/resend-code', { email });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo reenviar el codigo';
      return { success: false, error: message };
    }
  }, []);

  // ─── 2FA TOTP: Obtener QR y secret para configurar authenticator ───────
  const setupTOTP = useCallback(async () => {
    try {
      const api = await apiService.createApiClient();
      if (!api) throw new Error('No hay conexion con el servidor');

      const response = await api.get('/auth/2fa/totp/setup');
      return {
        success: true,
        qrCode: response.qrCode,
        secret: response.secret,
        otpauthUrl: response.otpauthUrl,
      };
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo generar la configuracion TOTP';
      return { success: false, error: message };
    }
  }, []);

  // ─── 2FA TOTP: Verificar codigo y activar TOTP ────────────────────────
  const enableTOTP = useCallback(async (code) => {
    try {
      const api = await apiService.createApiClient();
      if (!api) throw new Error('No hay conexion con el servidor');

      const response = await api.post('/auth/2fa/totp/enable', { code });

      // Actualizar usuario en estado
      if (response.user) {
        dispatch({ type: ACTIONS.UPDATE_PROFILE, payload: {
          twoFactorEnabled: response.user.twoFactorEnabled,
          twoFactorType: response.user.twoFactorType,
        }});
      }

      return {
        success: true,
        twoFactorEnabled: response.twoFactorEnabled,
        twoFactorType: response.twoFactorType,
        backupCodes: response.backupCodes,
      };
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudo activar TOTP';
      return { success: false, error: message };
    }
  }, []);

  // ─── 2FA: Generar nuevos codigos de recuperacion ──────────────────────
  const generateBackupCodes = useCallback(async () => {
    try {
      const api = await apiService.createApiClient();
      if (!api) throw new Error('No hay conexion con el servidor');

      const response = await api.get('/auth/2fa/backup-codes');
      return { success: true, backupCodes: response.backupCodes };
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'No se pudieron generar los codigos';
      return { success: false, error: message };
    }
  }, []);

  // ─── Helpers de permisos ───────────────────────────────────────────────────

  const permissionCodes = state.user?.permissions?.map(p => p.code) || [];
  const roleNames = state.user?.roles?.map(r => r.name) || [];

  const hasPermission = useCallback((code) => {
    return permissionCodes.includes(code);
  }, [permissionCodes]);

  const hasAnyPermission = useCallback((codes) => {
    return codes.some(c => permissionCodes.includes(c));
  }, [permissionCodes]);

  const hasRole = useCallback((roleName) => {
    return roleNames.includes(roleName);
  }, [roleNames]);

  const isAdmin = roleNames.includes('admin');

  // Obtener permisos de un módulo específico
  const getModulePermissions = useCallback((moduleName) => {
    return permissionCodes.filter(code => code.startsWith(`${moduleName}.`));
  }, [permissionCodes]);

  // Verificar si puede ver un módulo en el menú
  const canViewModule = useCallback((moduleName) => {
    return permissionCodes.includes(`${moduleName}.view_menu`);
  }, [permissionCodes]);

  const value = {
    ...state,
    login,
    loginWithOtp,
    register,
    logout,
    refreshAccessToken,
    fetchProfile,
    send2FACode,
    verify2FASetup,
    resendOtpCode,
    setupTOTP,
    enableTOTP,
    generateBackupCodes,
    isAdmin,
    hasPermission,
    hasAnyPermission,
    hasRole,
    getModulePermissions,
    canViewModule,
    clearError: () => dispatch({type: ACTIONS.CLEAR_ERROR}),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};

export default AuthContext;
