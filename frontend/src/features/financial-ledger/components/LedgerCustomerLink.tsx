import React from 'react';
import { Link } from 'react-router-dom';

interface LedgerCustomerLinkProps {
  customer: { id: string; name: string };
  className?: string;
}

export const LedgerCustomerLink: React.FC<LedgerCustomerLinkProps> = ({ customer, className = '' }) => (
  <Link
    to={`/customers/${customer.id}`}
    onClick={(event) => event.stopPropagation()}
    className={`user-text relative inline-block max-w-full rounded-sm text-slate-900 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-yellow-300 after:transition-transform after:duration-200 hover:text-yellow-300 hover:[text-shadow:0_0_8px_rgba(250,204,21,0.8)] hover:after:scale-x-100 focus:outline-none focus:ring-2 focus:ring-yellow-300/50 focus:after:scale-x-100 group-hover:text-yellow-300 ${className}`}
    dir="auto"
    aria-label={`Open profile for ${customer.name}`}
  >
    {customer.name}
  </Link>
);
