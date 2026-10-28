import type { DocumentBranchData } from '../types/document.types';

export function DocumentBranchLine({ data }: { data: DocumentBranchData }) {
  if (!data.showBranchLine || !data.branch) return null;
  const line = [data.branch.name, data.branch.address, data.branch.phone].filter((part) => part?.trim()).join(' — ');
  return <p className="user-text mt-1 text-sm" dir="auto">Branch: {line}</p>;
}
