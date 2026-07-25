import React, { useState } from 'react';
import { Customer } from '../../customers/api/customers.api';
import { AddFinancialObligationDialog } from '../../customer-financial/components/AddFinancialObligationDialog';
import { CustomerPicker } from './CustomerPicker';

interface GlobalAddObligationDialogProps {
  onSuccess: () => void;
}

export const GlobalAddObligationDialog: React.FC<GlobalAddObligationDialogProps> = ({ onSuccess }) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  if (selectedCustomer) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedCustomer(null)}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Change customer
        </button>
        <AddFinancialObligationDialog
          customer={selectedCustomer}
          onSuccess={onSuccess}
        />
      </div>
    );
  }

  return <CustomerPicker selectedCustomer={selectedCustomer} onSelect={setSelectedCustomer} />;
};
