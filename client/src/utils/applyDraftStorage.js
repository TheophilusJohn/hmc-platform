// Shared localStorage keys for the public application draft session.
// Used by ApplyStart (set on Start/Resume, cleared on Submit) and
// ApplyContinue (set on successful lookup before navigating to
// /apply/start). Extracted to keep the two consumers from drifting
// apart — the keys are part of the public-form contract.
export const LS_CODE  = 'hmc_apply_draft_code';
export const LS_EMAIL = 'hmc_apply_draft_email';
