import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { AlertTriangle } from 'lucide-react';

interface CustomerDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  customerName: string;
  isDeleting?: boolean;
}

export const CustomerDeleteModal: React.FC<CustomerDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  customerName,
  isDeleting
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Customer">
      <div className="flex flex-col items-center justify-center p-4 text-center">
        <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-red-100">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-800">Are you absolutely sure?</h3>
        <p className="mb-6 text-slate-600">
          This action will delete the customer <span className="font-semibold text-slate-800">"{customerName}"</span>. 
          While this is a soft-delete, they will no longer appear in active searches or lists.
        </p>

        <div className="flex items-center justify-center w-full space-x-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-500/20 transition-all disabled:opacity-50 flex items-center justify-center"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Deleting...
              </>
            ) : (
              'Delete Customer'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
