export const CLOUD_WRITE_NOTE = 'Coming soon over the cloud. Use the shop Wi-Fi';
const writeLabels = new Set(['new order', 'new customer', 'take payment', 'payment', 'pay supplier', 'supplier payment', 'bill photo', 'capture bill', 'receive', 'count', 'receive stock', 'count stock', 'adjust stock', 'add to order', 'prepaid item', 'new purchase']);
export const isCloudWriteLabel = (label: string) => writeLabels.has(label.toLowerCase());
