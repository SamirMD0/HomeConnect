import { api } from '../../../services/api';
import { CreatePricingPresetInput, LabelSecretConfiguration, LabelSecretEncodingInput, LabelSecretEncodingPreset, PricingAudit, PricingCalculateInput, PricingCalculationResult, PricingPagination, PricingPasswordAction, PricingPreset, PricingPresetFilters, PricingProtectedAction, UpdateLabelSecretSettingsInput, UpdatePricingPresetInput } from '../types/pricing.types';

const params=(values:object)=>Object.fromEntries(Object.entries(values).filter(([,value])=>value!==undefined&&value!==null&&value!==''));
export const pricingApi={
  list:async(filters:PricingPresetFilters={}):Promise<{items:PricingPreset[];pagination:PricingPagination}>=>{const response=await api.get('/pricing-presets',{params:params(filters)});return{items:response.data.data,pagination:response.data.meta.pagination};},
  get:async(id:string):Promise<PricingPreset>=>(await api.get(`/pricing-presets/${id}`)).data.data,
  create:async(input:CreatePricingPresetInput):Promise<PricingPreset>=>(await api.post('/pricing-presets',input)).data.data,
  update:async(id:string,input:UpdatePricingPresetInput):Promise<PricingPreset>=>(await api.patch(`/pricing-presets/${id}`,input)).data.data,
  archive:async(id:string,input:PricingProtectedAction):Promise<PricingPreset>=>(await api.post(`/pricing-presets/${id}/archive`,input)).data.data,
  restore:async(id:string,input:PricingProtectedAction):Promise<PricingPreset>=>(await api.post(`/pricing-presets/${id}/restore`,input)).data.data,
  setDefault:async(id:string,input:PricingProtectedAction):Promise<PricingPreset>=>(await api.post(`/pricing-presets/${id}/set-default`,input)).data.data,
  setLabelSecret:async(id:string,input:PricingPasswordAction):Promise<PricingPreset>=>(await api.post(`/pricing-presets/${id}/set-label-secret`,input)).data.data,
  clearLabelSecret:async(id:string,input:PricingPasswordAction):Promise<PricingPreset>=>(await api.post(`/pricing-presets/${id}/clear-label-secret`,input)).data.data,
  labelSecretConfiguration:async():Promise<LabelSecretConfiguration>=>(await api.get('/pricing-presets/label-secret-settings')).data.data,
  updateLabelSecretSettings:async(input:UpdateLabelSecretSettingsInput):Promise<LabelSecretConfiguration>=>(await api.patch('/pricing-presets/label-secret-settings',input)).data.data,
  createLabelSecretEncoding:async(input:LabelSecretEncodingInput):Promise<LabelSecretEncodingPreset>=>(await api.post('/pricing-presets/label-secret-encodings',input)).data.data,
  updateLabelSecretEncoding:async(id:string,input:LabelSecretEncodingInput):Promise<LabelSecretEncodingPreset>=>(await api.patch(`/pricing-presets/label-secret-encodings/${id}`,input)).data.data,
  audit:async(id:string):Promise<PricingAudit[]>=>{const response=await api.get(`/pricing-presets/${id}/audit`);return response.data.data;},
  calculate:async(input:PricingCalculateInput):Promise<PricingCalculationResult>=>(await api.post('/pricing/calculate',input)).data.data,
};
