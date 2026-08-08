import React from 'react';
import { useLocalStatus } from '../hooks/useLocalStatus';
import { LocalStatusChips } from './LocalStatusChips';

/**
 * Container for the header strip. Kept separate from `LocalStatusChips` so the
 * chips stay a pure render of four values and can be tested without a query
 * client or a live backend.
 */
export const LocalStatusIndicator: React.FC = () => {
  const { backendConnected, database, lanScanner, internetOnline } = useLocalStatus();
  return (
    <LocalStatusChips
      backendConnected={backendConnected}
      database={database}
      lanScanner={lanScanner}
      internetOnline={internetOnline}
    />
  );
};
