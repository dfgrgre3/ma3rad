export interface FirstRunSetupEvidence {
  completed: boolean;
  hasBusinessData: boolean;
  hasLegacyConfiguration: boolean;
}

export function shouldShowFirstRunSetup(evidence: FirstRunSetupEvidence): boolean {
  return !evidence.completed
    && !evidence.hasBusinessData
    && !evidence.hasLegacyConfiguration;
}
