import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Customer } from '../customers/api/customers.api';
import { CustomerSearch } from './components/CustomerSearch';
import { InlineCustomerForm } from './components/InlineCustomerForm';
import { DebtForm } from './components/DebtForm';
import toast from 'react-hot-toast';

type PanelStep = 'SEARCH' | 'CREATE' | 'RECORD_DEBT';

interface QuickActionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickActionPanel: React.FC<QuickActionPanelProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<PanelStep>('SEARCH');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [initialSearchTerm, setInitialSearchTerm] = useState('');

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep('SEARCH');
      setSelectedCustomer(null);
      setInitialSearchTerm('');
    }
  }, [isOpen]);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setStep('RECORD_DEBT');
  };

  const handleCreateNew = (searchTerm: string) => {
    setInitialSearchTerm(searchTerm);
    setStep('CREATE');
  };

  const handleCreatedCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setStep('RECORD_DEBT');
  };

  const handleDebtRecorded = () => {
    toast.success('Debt recorded successfully');
    // Reset to search step for rapid successive entries without closing panel
    setStep('SEARCH');
    setSelectedCustomer(null);
    setInitialSearchTerm('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-40"
            aria-hidden="true"
          />

          {/* Slide-out Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
          >
            {/* Close Button (Absolute Top Right) */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-50 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content Area with Step Transitions */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait" initial={false}>
                {step === 'SEARCH' && (
                  <CustomerSearch
                    key="search"
                    onSelectCustomer={handleSelectCustomer}
                    onCreateNew={handleCreateNew}
                  />
                )}
                {step === 'CREATE' && (
                  <InlineCustomerForm
                    key="create"
                    initialSearchTerm={initialSearchTerm}
                    onSuccess={handleCreatedCustomer}
                    onBack={() => setStep('SEARCH')}
                  />
                )}
                {step === 'RECORD_DEBT' && selectedCustomer && (
                  <DebtForm
                    key="record"
                    customer={selectedCustomer}
                    onSuccess={handleDebtRecorded}
                    onBack={() => setStep('SEARCH')}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
