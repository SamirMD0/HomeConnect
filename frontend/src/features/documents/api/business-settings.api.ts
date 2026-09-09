import { api } from '../../../services/api';
import type { BusinessSettings, UpdateBusinessSettingsInput } from '../types/document.types';

export const businessSettingsApi = {
  get: async (): Promise<BusinessSettings> => (await api.get('/business-settings')).data.data,
  update: async (input: UpdateBusinessSettingsInput): Promise<BusinessSettings> =>
    (await api.put('/business-settings', input)).data.data,
};
