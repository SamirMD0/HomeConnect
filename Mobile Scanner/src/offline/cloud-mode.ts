let enabled = false;
let reader: ((url: string, init: RequestInit) => Promise<unknown>) | null = null;
const cleaners = new Set<() => Promise<void>>();
export const cloudMode = () => enabled;
export const setCloudMode = (value: boolean) => { enabled = value; };
export const configureCloudReader = (value: typeof reader) => { reader = value; };
export async function cloudRequest<T>(url: string, init: RequestInit): Promise<T> {
  if ((init.method ?? 'GET').toUpperCase() !== 'GET') throw new Error('Coming soon over the cloud. Use the shop Wi-Fi');
  if (!reader) throw new Error('Your phone data is downloading. Please try again shortly.');
  return await reader(url, init) as T;
}
export const onCloudWipe = (clean: () => Promise<void>) => { cleaners.add(clean); return () => { cleaners.delete(clean); }; };
let wipeFlight:Promise<void>|null=null;
export const wipeCloudData = () => wipeFlight??=(async()=>{for(const clean of cleaners)await clean();})().finally(()=>{wipeFlight=null;});
