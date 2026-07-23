import React from 'react';
import { FolderSearch } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  title, 
  description, 
  action, 
  icon = <FolderSearch className="w-12 h-12 text-slate-300" /> 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl border-slate-200 bg-slate-50/50">
      <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-white shadow-sm border border-slate-100">
        {icon}
      </div>
      <h3 className="mb-1 text-lg font-semibold text-slate-800">{title}</h3>
      <p className="max-w-sm mb-6 text-sm text-slate-500">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
