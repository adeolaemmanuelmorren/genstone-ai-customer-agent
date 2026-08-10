export const CALL_CUSTOMER_STEP_NAMES = [
  "recordCallCustomerRequest",
  "fetchSalesforceOrder",
  "fetchSalesforceOpportunity",
  "buildReviewOrder",
  "startReviewFollowup",
] as const;

export type CallCustomerStepName = typeof CALL_CUSTOMER_STEP_NAMES[number];

export const CALL_CUSTOMER_DB_STEP_CONFIG = {
  retries: {
    limit: 3,
    delay: "5 seconds",
    backoff: "exponential" as const,
  },
  timeout: "2 minutes",
} as const;

export const CALL_CUSTOMER_SALESFORCE_STEP_CONFIG = {
  retries: {
    limit: 6,
    delay: "10 seconds",
    backoff: "exponential" as const,
  },
  timeout: "2 minutes",
} as const;

export const CALL_CUSTOMER_RETELL_STEP_CONFIG = {
  retries: {
    limit: 2,
    delay: "10 seconds",
    backoff: "exponential" as const,
  },
  timeout: "5 minutes",
} as const;
