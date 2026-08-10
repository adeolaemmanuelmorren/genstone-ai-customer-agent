import { z } from "zod";

const stringValue = z.union([z.string(), z.number()]).transform((value) => String(value));

const customerSchema = z.object({
  id: z.string().optional(),
  first_name: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  salesforce_account_id: z.string().optional(),
  customer_io_person_id: z.string().optional(),
}).passthrough();

const orderDataSchema = z.object({
  order_id: stringValue,
  order_number: stringValue.optional(),
  opportunity_id: stringValue.optional(),
  customer_id: stringValue.optional(),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  phone: z.string().optional(),
  order_email: z.string().email().optional(),
  customer_email: z.string().email().optional(),
  building_description: z.string().optional(),
  delivery_date: stringValue.optional(),
  employee_name: z.string().optional(),
  employee_role: z.string().optional(),
  salesforce_order_id: stringValue.optional(),
  salesforce_account_id: stringValue.optional(),
  customer_io_person_id: stringValue.optional(),
}).passthrough();

export const orderCreatedPayloadSchema = z.object({
  name: z.string().optional(),
  data: orderDataSchema,
  customer: customerSchema.optional(),
  person: customerSchema.optional(),
}).passthrough();

export type OrderCreatedPayload = z.infer<typeof orderCreatedPayloadSchema>;

export type ExecutionMode = "production" | "test";

export interface TestExecutionOverrides {
  recipientEmail?: string;
  recipientName?: string;
  escalationEmail?: string;
  callbackDelaySeconds?: number;
}

export interface NormalizedOrderCreated {
  orderId: string;
  orderNumber?: string;
  executionMode?: ExecutionMode;
  testRunId?: string;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
  testOverrides?: TestExecutionOverrides;
  customerId?: string;
  customerIoPersonId?: string;
  salesforceOrderId?: string;
  salesforceAccountId?: string;
  customerName?: string;
  customerPhone: string;
  customerEmail?: string;
  buildingDescription?: string;
  buildingSize?: string;
  deliveryDate?: string;
  employeeName?: string;
  employeeRole?: string;
  salesRepId?: string;
  salesRepName?: string;
  deliveryCoordinatorId?: string;
  deliveryCoordinatorName?: string;
  projectCoordinatorId?: string;
  projectCoordinatorName?: string;
  rawPayload: unknown;
}

export function normalizeOrderCreated(payload: OrderCreatedPayload): NormalizedOrderCreated {
  const customer = payload.customer ?? payload.person;
  const data = payload.data;
  const customerPhone = data.customer_phone ?? data.phone ?? customer?.phone;

  if (!customerPhone) {
    throw new Error("Customer phone is required to create a Retell call.");
  }

  return {
    orderId: data.order_id,
    orderNumber: data.order_number,
    customerId: data.customer_id ?? customer?.id,
    customerIoPersonId: data.customer_io_person_id ?? customer?.customer_io_person_id,
    salesforceOrderId: data.salesforce_order_id,
    salesforceAccountId: data.salesforce_account_id ?? customer?.salesforce_account_id,
    customerName: data.customer_name ?? customer?.first_name ?? customer?.name,
    customerPhone,
    customerEmail: data.customer_email ?? data.order_email ?? customer?.email,
    buildingDescription: data.building_description,
    deliveryDate: data.delivery_date,
    employeeName: data.employee_name,
    employeeRole: data.employee_role,
    rawPayload: payload,
  };
}
