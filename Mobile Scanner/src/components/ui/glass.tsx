import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

/**
 * The PC's glass shell, on the phone (frontend/src/styles/index.css
 * `.app-backdrop` and `.glass-panel`): a cool grey gradient with soft light
 * beams and a blue glow behind everything, frosted bars above it, and solid
 * white panels for content.
 */
export function GlassBackdrop({ children }: PropsWithChildren) {
  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={['#dde1e6', '#c5cbd2', '#b0b8c1']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Light beams, as on the PC backdrop. */}
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
        start={{ x: 0, y: 0.15 }}
        end={{ x: 1, y: 0.45 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View pointerEvents="none" style={[styles.glow, styles.blue]} />
      <View pointerEvents="none" style={[styles.glow, styles.slate]} />
      {children}
    </View>
  );
}

/**
 * Frosted glass: blurred, translucent white, bright top edge. Used for the
 * header and the tab bar. Android blurs with the Dimezis method.
 */
export function GlassPanel({ children, style, ...props }: ViewProps & { style?: ViewStyle | ViewStyle[] }) {
  return (
    <View style={[styles.panel, style]} {...props}>
      <BlurView
        intensity={40}
        tint="light"
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.38)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#c8cdd4' },
  glow: { position: 'absolute', borderRadius: 999 },
  blue: { width: 420, height: 420, left: -120, bottom: 60, backgroundColor: 'rgba(43,134,224,0.16)' },
  slate: { width: 460, height: 360, right: -160, top: 40, backgroundColor: 'rgba(71,85,105,0.18)' },
  panel: {
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.7)',
  },
});
