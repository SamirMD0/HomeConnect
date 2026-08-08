import { api } from '../../../services/api';
import { LocalStatus } from '../types/system.types';

export const systemApi = {
  localStatus: async (): Promise<LocalStatus> => (await api.get('/system/local-status')).data.data,
};
