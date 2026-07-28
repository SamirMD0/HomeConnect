import { api } from '../../../services/api';
import {
  ReceivableFilters,
  ReceivablesResponse,
  ReceivablesResponseData,
} from '../types/receivables.types';
import { buildReceivableParams } from '../utils/receivables-query';

/**
 * The backend runs Express 5, whose query parser only turns *repeated* keys
 * into arrays (`tier=SEVERE&tier=CRITICAL`). Axios would otherwise emit
 * `tier[]=...`, which arrives as a literal `tier[]` key and fails validation.
 */
function serializeReceivableParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)));
    } else if (value !== undefined && value !== null) {
      search.append(key, String(value));
    }
  }

  return search.toString();
}

export const receivablesApi = {
  getReceivables: async (filters: ReceivableFilters = {}): Promise<ReceivablesResponseData> => {
    const response = await api.get<ReceivablesResponse>('/receivables', {
      params: buildReceivableParams(filters),
      paramsSerializer: serializeReceivableParams,
    });
    return response.data.data;
  },
};
