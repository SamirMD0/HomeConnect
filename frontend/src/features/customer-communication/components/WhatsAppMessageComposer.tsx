import React, { useState } from 'react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { WhatsAppMessageActions, WhatsAppMessageState } from '../hooks/useWhatsAppMessage';
import { CommunicationPreview } from './CommunicationPreview';
import { MessageOverridesPanel } from './MessageOverridesPanel';
import { MessageSourceSelector } from './MessageSourceSelector';
import { MessageTemplateSelector } from './MessageTemplateSelector';
import { SelectedDataSummary } from './SelectedDataSummary';

interface WhatsAppMessageComposerProps {
  state: WhatsAppMessageState;
  actions: WhatsAppMessageActions;
}

export const WhatsAppMessageComposer: React.FC<WhatsAppMessageComposerProps> = ({
  state,
  actions,
}) => {
  // Collapsed by default: the values are already loaded, so this is for the
  // exception, not the routine.
  const [overridesOpen, setOverridesOpen] = useState(false);

  const { draft, defaults, values } = state;
  const isCustomMessage = draft.type === 'CUSTOM';

  return (
    <div className="space-y-5">
      <section aria-label={businessLabels.communication.messageSetup} className="space-y-4">
        <MessageTemplateSelector
          type={draft.type}
          language={draft.language}
          tone={draft.tone}
          onTypeChange={actions.setType}
          onLanguageChange={actions.setLanguage}
          onToneChange={actions.setTone}
        />

        <MessageSourceSelector
          source={draft.source}
          debts={state.debts}
          plans={state.plans}
          totalOutstanding={
            state.isLoadingSummary ? 'Loading… / جاري التحميل…' : state.totalOutstanding
          }
          notice={state.sourceNotice}
          onChange={actions.setSource}
        />
      </section>

      <SelectedDataSummary
        sourceKind={draft.source.kind}
        defaults={defaults}
        isLoading={state.isLoadingSummary}
      />

      <MessageOverridesPanel
        isOpen={overridesOpen}
        onToggle={() => setOverridesOpen((open) => !open)}
        overrides={draft.overrides}
        defaults={defaults}
        isCustomMessage={isCustomMessage}
        showServiceStatus={draft.type === 'SERVICE_UPDATE'}
        serviceStatus={state.serviceStatus}
        resolvedServiceStatus={values.serviceStatus}
        onOverrideChange={actions.setOverride}
        onServiceStatusChange={actions.setServiceStatus}
        onReset={actions.resetOverrides}
      />

      <CommunicationPreview
        bodies={draft.bodies}
        bodyLanguages={state.bodyLanguages}
        isCustomMessage={isCustomMessage}
        onBodyChange={actions.setBody}
        phone={state.phone}
        savedPhone={state.savedPhone}
        requiresPhoneConfirmation={state.requiresPhoneConfirmation}
        phoneConfirmed={state.phoneConfirmed}
        onPhoneConfirmedChange={actions.setPhoneConfirmed}
        gate={state.actions}
        awaitingOverwriteConfirm={state.awaitingOverwriteConfirm}
        onGenerate={actions.generate}
        onConfirmGenerate={actions.confirmGenerate}
        onCancelGenerate={actions.cancelGenerate}
        onCopy={actions.copyMessage}
        onOpenWhatsApp={actions.openWhatsApp}
      />
    </div>
  );
};
