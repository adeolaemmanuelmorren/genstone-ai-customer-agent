import { z } from "zod";

const callId = z.string().trim().min(1).max(200);
const idempotencyKey = z.string().trim().min(8).max(200);
const phone = z.string().trim().min(7).max(40);
const email = z.email().max(320);
const shortText = z.string().trim().min(1).max(500);
const summary = z.string().trim().min(1).max(3000);
const existingOrderRoute = z.literal("existing_order");
const newProjectRoute = z.literal("new_project");

function normalizeOptionalDynamicValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || /^\{\{[^{}]+\}\}$/u.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function optionalDynamic<TSchema extends z.ZodType>(schema: TSchema) {
  return z.preprocess(normalizeOptionalDynamicValue, schema.optional());
}

function normalizeBoolean(value: unknown): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
}

const dynamicBoolean = z.preprocess(normalizeBoolean, z.boolean());
const confirmedDynamicBoolean = z.preprocess(normalizeBoolean, z.literal(true));

export const callerTypeSchema = z.enum([
  "customer",
  "contractor",
  "distributor",
  "retail_partner",
  "other",
]);

export const callerCountrySchema = z.enum([
  "united_states",
  "canada",
  "other_country",
]);

export const contactLookupSchema = z.object({
  call_id: callId,
  phone: optionalDynamic(phone),
  email: optionalDynamic(email),
}).refine((value) => value.phone || value.email, {
  message: "A confirmed phone or email is required.",
});

export const employeeLookupSchema = z.object({
  call_id: callId,
  employee_name: shortText,
});

export const orderLookupSchema = z.object({
  call_id: callId,
  identifier_type: z.enum(["caller_phone", "alternate_phone", "order_number"]),
  identifier: shortText,
});

export const verifiedOrderSchema = z.object({
  call_id: callId,
  order_candidate_token: z.string().trim().min(1).max(200),
  order_items_confirmed: dynamicBoolean,
  order_email_confirmed: dynamicBoolean,
  order_verified: dynamicBoolean,
});

export const callbackScheduleSchema = z.object({
  call_id: callId,
  idempotency_key: idempotencyKey,
  primary_route: newProjectRoute,
  customer_name: shortText,
  callback_subject: shortText,
  callback_summary: summary,
  callback_date: z.iso.date(),
  callback_time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
  callback_phone: phone,
  callback_confirmed: confirmedDynamicBoolean,
  communication_preference: optionalDynamic(z.string().trim().max(200)),
  urgency_context: optionalDynamic(z.string().trim().max(1000)),
});

export const prospectFollowUpSchema = z.object({
  call_id: callId,
  idempotency_key: idempotencyKey,
  primary_route: newProjectRoute,
  customer_name: shortText,
  confirmed_phone: phone,
  customer_email: optionalDynamic(email),
  project_summary: summary,
  postal_code: optionalDynamic(z.string().trim().max(30)),
  prospect_confirmed: confirmedDynamicBoolean,
});

export const shipmentEmailSchema = verifiedOrderSchema.extend({
  idempotency_key: idempotencyKey,
  shipment_email_requested: confirmedDynamicBoolean,
});

export const supportCaseCreateSchema = z.object({
  call_id: callId,
  idempotency_key: idempotencyKey,
  primary_route: existingOrderRoute,
  order_candidate_token: optionalDynamic(z.string().trim().min(1).max(200)),
  order_items_confirmed: optionalDynamic(dynamicBoolean),
  order_email_confirmed: optionalDynamic(dynamicBoolean),
  order_verified: optionalDynamic(dynamicBoolean),
  customer_name: shortText,
  confirmed_phone: phone,
  customer_email: optionalDynamic(email),
  caller_type: callerTypeSchema,
  caller_country: optionalDynamic(callerCountrySchema),
  support_summary: summary,
  support_summary_confirmed: confirmedDynamicBoolean,
  communication_preference: optionalDynamic(z.string().trim().max(200)),
  urgency_context: optionalDynamic(z.string().trim().max(1000)),
  photo_context: optionalDynamic(z.string().trim().max(1000)),
}).superRefine((value, context) => {
  if (
    value.order_candidate_token
    && (!value.order_items_confirmed || !value.order_email_confirmed || !value.order_verified)
  ) {
    context.addIssue({
      code: "custom",
      path: ["order_verified"],
      message: "Order context requires both confirmations and order_verified=true.",
    });
  }
});

export const dncSuppressSchema = z.object({
  call_id: callId,
  idempotency_key: idempotencyKey,
  dnc_phone: phone,
  dnc_confirmed: confirmedDynamicBoolean,
});

export type ContactLookupInput = z.infer<typeof contactLookupSchema>;
export type EmployeeLookupInput = z.infer<typeof employeeLookupSchema>;
export type OrderLookupInput = z.infer<typeof orderLookupSchema>;
export type VerifiedOrderInput = z.infer<typeof verifiedOrderSchema>;
export type CallbackScheduleInput = z.infer<typeof callbackScheduleSchema>;
export type ProspectFollowUpInput = z.infer<typeof prospectFollowUpSchema>;
export type ShipmentEmailInput = z.infer<typeof shipmentEmailSchema>;
export type SupportCaseCreateInput = z.infer<typeof supportCaseCreateSchema>;
export type DncSuppressInput = z.infer<typeof dncSuppressSchema>;
