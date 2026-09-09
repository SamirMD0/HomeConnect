export interface BusinessSettings {
  id: string;
  shopName: string | null;
  address: string | null;
  phone: string | null;
  taxNumber: string | null;
  logoUrl: string | null;
  email: string | null;
  updatedAt: string | null;
}

export type UpdateBusinessSettingsInput = Pick<
  BusinessSettings,
  'shopName' | 'address' | 'phone' | 'taxNumber' | 'logoUrl' | 'email'
>;

export interface DocumentPdfOptions {
  suggestedName: string;
  paper: 'A4' | 'LETTER';
  orientation: 'portrait' | 'landscape';
}
