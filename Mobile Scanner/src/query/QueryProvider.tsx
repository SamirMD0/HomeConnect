import { useEffect, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './client';
export function QueryProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
    });
    // The shop LAN can work without public internet. NetInfo's internet probe
    // must not pause requests to the PC when Wi-Fi itself is connected.
    const unsubscribe = NetInfo.addEventListener((state) =>
      onlineManager.setOnline(state.isConnected !== false)
    );
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
