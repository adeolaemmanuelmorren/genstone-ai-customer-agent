import type { Queryable } from "./db";

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface ContactReference {
  token: string;
  salesforceContactId: string;
  name?: string;
  phone?: string;
  email?: string;
}

export interface OrderReference {
  token: string;
  wooOrderId: string;
  orderNumber: string;
  orderEmail?: string;
  orderPhone?: string;
  maskedEmail?: string;
  items: Array<{ name: string; quantity: number }>;
}

export async function storeContactReference(
  db: Queryable,
  input: Omit<ContactReference, "token"> & { companyId: string; callId: string },
): Promise<ContactReference> {
  const token = crypto.randomUUID();
  await db.query(
    `
      insert into genstone_customer_agent.contact_references (
        token,
        company_id,
        call_id,
        salesforce_contact_id,
        contact_name,
        confirmed_phone,
        confirmed_email,
        expires_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      token,
      input.companyId,
      input.callId,
      input.salesforceContactId,
      input.name ?? null,
      input.phone ?? null,
      input.email ?? null,
      new Date(Date.now() + TOKEN_LIFETIME_MS),
    ],
  );

  return { token, salesforceContactId: input.salesforceContactId, name: input.name, phone: input.phone, email: input.email };
}

export async function getContactReference(
  db: Queryable,
  companyId: string,
  callId: string,
  token: string,
): Promise<ContactReference | undefined> {
  const result = await db.query<{
    token: string;
    salesforce_contact_id: string;
    contact_name: string | null;
    confirmed_phone: string | null;
    confirmed_email: string | null;
  }>(
    `
      select token, salesforce_contact_id, contact_name, confirmed_phone, confirmed_email
      from genstone_customer_agent.contact_references
      where company_id = $1
        and call_id = $2
        and token = $3
        and expires_at > now()
    `,
    [companyId, callId, token],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }

  return {
    token: row.token,
    salesforceContactId: row.salesforce_contact_id,
    name: row.contact_name ?? undefined,
    phone: row.confirmed_phone ?? undefined,
    email: row.confirmed_email ?? undefined,
  };
}

export async function storeOrderReference(
  db: Queryable,
  input: Omit<OrderReference, "token"> & { companyId: string; callId: string },
): Promise<OrderReference> {
  const token = crypto.randomUUID();
  await db.query(
    `
      insert into genstone_customer_agent.order_candidates (
        token,
        company_id,
        call_id,
        woo_order_id,
        order_number,
        order_email,
        order_phone,
        masked_email,
        caller_safe_items,
        expires_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
    `,
    [
      token,
      input.companyId,
      input.callId,
      input.wooOrderId,
      input.orderNumber,
      input.orderEmail ?? null,
      input.orderPhone ?? null,
      input.maskedEmail ?? null,
      JSON.stringify(input.items),
      new Date(Date.now() + TOKEN_LIFETIME_MS),
    ],
  );

  return {
    token,
    wooOrderId: input.wooOrderId,
    orderNumber: input.orderNumber,
    orderEmail: input.orderEmail,
    orderPhone: input.orderPhone,
    maskedEmail: input.maskedEmail,
    items: input.items,
  };
}

export async function getOrderReference(
  db: Queryable,
  companyId: string,
  callId: string,
  token: string,
): Promise<OrderReference | undefined> {
  const result = await db.query<{
    token: string;
    woo_order_id: string;
    order_number: string;
    order_email: string | null;
    order_phone: string | null;
    masked_email: string | null;
    caller_safe_items: Array<{ name: string; quantity: number }>;
  }>(
    `
      select token, woo_order_id, order_number, order_email, order_phone,
             masked_email, caller_safe_items
      from genstone_customer_agent.order_candidates
      where company_id = $1
        and call_id = $2
        and token = $3
        and expires_at > now()
    `,
    [companyId, callId, token],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }

  return {
    token: row.token,
    wooOrderId: row.woo_order_id,
    orderNumber: row.order_number,
    orderEmail: row.order_email ?? undefined,
    orderPhone: row.order_phone ?? undefined,
    maskedEmail: row.masked_email ?? undefined,
    items: row.caller_safe_items,
  };
}
