import React from 'react';
import {View, Text, StyleSheet, Animated, Easing} from 'react-native';
import {useConfig} from '@context/ConfigContext';
import theme from '@theme/styles';

const ThemeLoader = () => {
  const {config, loading} = useConfig();
  const shopName = config.shop_name || 'JO-Delivery';
  const initials = shopName.slice(0, 2).toUpperCase();

  // Animated border rotation
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

  if (!loading) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.logoBox}>
        <Animated.View
          style={[
            styles.borderWrapper,
            {
              transform: [{rotate: rotateAnim.interpolate({inputRange: [0, 360], outputRange: ['0deg', '360deg']})}],
            },
          ]}>
          <View style={[styles.borderSegment, {borderTopColor: '#999'}]} />
          <View style={[styles.borderSegment, {borderRightColor: '#C0C0C0'}]} />
          <View style={[styles.borderSegment, {borderBottomColor: '#D8D8D8'}]} />
          <View style={[styles.borderSegment, {borderLeftColor: '#E0E0E0'}]} />
        </Animated.View>
        <View style={styles.logoInner}>
          <Text style={styles.logoText}>{initials}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  borderWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  borderSegment: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  logoInner: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E8E8E8',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#636E72',
    letterSpacing: -0.5,
  },
});

export default ThemeLoader;
