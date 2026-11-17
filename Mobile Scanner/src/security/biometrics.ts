export async function hasBiometrics(){const auth=await import('expo-local-authentication');return await auth.hasHardwareAsync()&&await auth.isEnrolledAsync();}
export async function authenticateBiometric(){
  if(!await hasBiometrics())return false;
  const auth=await import('expo-local-authentication');
  const result=await auth.authenticateAsync({promptMessage:'Unlock Home Connect',cancelLabel:'Use PIN',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
  return result.success;
}
