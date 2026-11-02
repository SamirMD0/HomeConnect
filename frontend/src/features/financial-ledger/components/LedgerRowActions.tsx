import React from 'react';
import { Eye, HandCoins, XCircle, type LucideIcon } from 'lucide-react';
import { RowMenu, type RowMenuItem } from '../../../components/ui/RowMenu';

export const LEDGER_CORRECTION_ENABLED = false;

export interface LedgerActionItem {
  label: string;
  onClick: () => void;
  tone?: 'pay' | 'cancel' | 'view';
}

interface LedgerRowActionsProps {
  menuKey: string;
  openMenuKey: string | null;
  actions: LedgerActionItem[];
  immutableHint?: string;
  onOpenChange: (menuKey: string | null) => void;
}

const TONE_STYLE: Record<NonNullable<LedgerActionItem['tone']>, { icon: LucideIcon; tone: RowMenuItem['tone'] }> = {
  pay: { icon: HandCoins, tone: 'primary' },
  cancel: { icon: XCircle, tone: 'danger' },
  view: { icon: Eye, tone: 'default' },
};

export const LedgerRowActions: React.FC<LedgerRowActionsProps> = ({
  menuKey,
  openMenuKey,
  actions,
  immutableHint,
  onOpenChange,
}) => (
  <RowMenu
    open={openMenuKey === menuKey}
    onOpenChange={(open) => onOpenChange(open ? menuKey : null)}
    emptyHint={immutableHint}
    items={actions.map((action) => ({
      label: action.label,
      onSelect: action.onClick,
      ...TONE_STYLE[action.tone ?? 'view'],
    }))}
  />
);
