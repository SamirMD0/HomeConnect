export interface SecretStorage { get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;remove(key:string):Promise<void> }
let tail:Promise<unknown>=Promise.resolve();
const serial=<T>(work:()=>Promise<T>)=>{const next=tail.then(work);tail=next.catch(()=>{});return next;};
export const secretStorage:SecretStorage={
  get:key=>serial(async()=>{const store=await import('expo-secure-store');return store.getItemAsync(key,{keychainAccessible:store.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}),
  set:(key,value)=>serial(async()=>{const store=await import('expo-secure-store');await store.setItemAsync(key,value,{keychainAccessible:store.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}),
  remove:key=>serial(async()=>{const store=await import('expo-secure-store');await store.deleteItemAsync(key);}),
};
export const PIN_KEY='homeconnect.pin.v1';
export const DB_KEY='homeconnect.cipher-key.v1';
