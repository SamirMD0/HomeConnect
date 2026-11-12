/** Wire contracts shared by clients. The current server issues only these roles. */
export type AccountRole = 'ADMIN' | 'EMPLOYEE';
export interface AccountUser {
  id: string;
  username: string;
  fullName: string;
  role: AccountRole;
}
export interface ClientCompatibility {
  apiVersion: string;
  minMobileVersion: string;
}
export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  branchId?: string;
  isActive: boolean;
}
