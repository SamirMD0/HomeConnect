import type { PropsWithChildren } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { theme } from '../theme';
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scrollable = true,
}: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void; scrollable?: boolean }>) {
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close sheet"
        />
        <SafeAreaView
          edges={['bottom']}
          style={[styles.sheet, { maxHeight: height * 0.85 }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          </View>
          {scrollable ? <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={{ flexShrink: 1 }}>{children}</View>}
          <View style={styles.footer}>
            <AppButton label="Close" variant="secondary" onPress={onClose} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#1B212480' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  header: { padding: theme.spacing.lg, borderBottomWidth: 1, borderColor: theme.colors.border },
  title: { fontSize: theme.type.title, fontWeight: '700', color: theme.colors.text },
  footer: { padding: theme.spacing.lg },
});
