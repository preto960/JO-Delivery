import React, {useRef, useEffect} from 'react';
import {View, Text, StyleSheet, Animated, Easing} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAuth} from '@context/AuthContext';
import {useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';

// Screens
import LoginScreen from '@screens/LoginScreen';
import DeliveryOrdersScreen from '@screens/DeliveryOrdersScreen';
import ProfileScreen from '@screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Delivery Tabs ──────────────────────────────────────────────────────────
const DeliveryTabs = () => {
  const {config} = useConfig();
  const activeColor = config.primary_color || theme.colors.accent;
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({color, size}) => {
          const icons = {
            DeliveryOrders: 'bicycle-outline',
            DeliveryProfile: 'person-outline',
          };
          return <Icon name={icons[route.name] || 'circle-outline'} size={size} color={color} />;
        },
      })}>
      <Tab.Screen name="DeliveryOrders" component={DeliveryOrdersScreen} options={{tabBarLabel: 'Entregas'}} />
      <Tab.Screen name="DeliveryProfile" component={ProfileScreen} options={{tabBarLabel: 'Perfil'}} />
    </Tab.Navigator>
  );
};

// Pantalla de loading al verificar sesión
const LoadingScreen = () => {
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 360,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <View style={styles.loadingContainer}>
      <View style={styles.loaderBox}>
        <Animated.View
          style={[
            styles.loaderBorderWrap,
            {transform: [{rotate: rotateAnim.interpolate({inputRange: [0, 360], outputRange: ['0deg', '360deg']})}]},
          ]}>
          <View style={[styles.loaderBorderSeg, {borderTopColor: '#999'}]} />
          <View style={[styles.loaderBorderSeg, {borderRightColor: '#C0C0C0'}]} />
          <View style={[styles.loaderBorderSeg, {borderBottomColor: '#D8D8D8'}]} />
          <View style={[styles.loaderBorderSeg, {borderLeftColor: '#E0E0E0'}]} />
        </Animated.View>
        <View style={styles.loaderInner}>
          <Text style={styles.loaderText}>JD</Text>
        </View>
      </View>
    </View>
  );
};

// ─── Navegación principal ───────────────────────────────────────────────────
const AppNavigator = () => {
  const {isRestoring, isAuthenticated, hasRole} = useAuth();
  const isDelivery = hasRole('delivery');

  if (isRestoring) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator
      key={isAuthenticated ? 'auth' : 'guest'}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: {backgroundColor: theme.colors.background},
      }}>
      {!isAuthenticated ? (
        // ─── LOGIN ──────────────────────────────────────────────────
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        // ─── DELIVERY ───────────────────────────────────────────────
        <Stack.Screen name="DeliveryMainTabs" component={DeliveryTabs} />
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    height: 60,
    paddingTop: 6,
    paddingBottom: 8,
    ...theme.shadows.sm,
  },
  tabLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loaderBox: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  loaderBorderWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  loaderBorderSeg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  loaderInner: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E8E8E8',
  },
  loaderText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#636E72',
    letterSpacing: -0.5,
  },
});

export default AppNavigator;
