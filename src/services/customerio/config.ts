export const CUSTOMERIO_MESSAGES = {
  callbackRequest: {
    transactionalMessageId: 5,
    recipient: "appt@genstone.com",
  },
  unmatchedProspect: {
    transactionalMessageId: 6,
    recipient: "travis.m@genstone.com",
  },
  shipmentDetails: {
    transactionalMessageId: 7,
    recipient: "adeolamorren@gmail.com",
    blindCopyRecipient: "travis.m@generalsteel.com",
  },
  supportCaseCreated: {
    transactionalMessageId: 8,
    recipient: "appt@genstone.com",
  },
} as const;

export function resolveShipmentEmailRecipient(
  _callerConfirmedRecipient: string,
): string {
  return CUSTOMERIO_MESSAGES.shipmentDetails.recipient;
}
