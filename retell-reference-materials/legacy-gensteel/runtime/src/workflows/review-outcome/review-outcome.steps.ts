export const REVIEW_OUTCOME_STEP_NAMES = [
  "resolveOutcomeContext",
  "selectReviewEmailTemplate",
  "sendReviewEmail",
  "sendAdminReviewEmail",
  "waitUntilCallbackTime",
  "notifySlack",
  "markWorkflowComplete",
] as const;

export type ReviewOutcomeStepName = typeof REVIEW_OUTCOME_STEP_NAMES[number];

export const PROVIDER_STEP_CONFIG = {
  retries: {
    limit: 6,
    delay: "10 seconds",
    backoff: "exponential" as const,
  },
  timeout: "5 minutes",
} as const;

export const DB_STEP_CONFIG = {
  retries: {
    limit: 3,
    delay: "5 seconds",
    backoff: "exponential" as const,
  },
  timeout: "2 minutes",
} as const;
