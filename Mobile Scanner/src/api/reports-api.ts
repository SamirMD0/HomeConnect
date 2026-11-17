import { reportRequest, type ReportChoice, type ReportFilters, type ReportRead } from '@shared/report-request';
export { reportRequest, type ReportChoice, type ReportFilters, type ReportRead } from '@shared/report-request';
import type { AuthedClient } from './hc-client';
import { lookupGet } from './lookup-http';
export function getReport(
  client: AuthedClient,
  definition: ReportChoice,
  filters: ReportFilters,
  page = 1
) {
  const request = reportRequest(definition, filters, page);
  return lookupGet<ReportRead>(client, request.path, request.params);
}
