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
  lookupId?: string;
  candidateRank?: number;
  wooOrderId: string;
  orderNumber: string;
  orderEmail?: string;
  orderPhone?: string;
  orderTypeSummary?: string;
  orderStatusSummary?: string;
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

export async function storeOrderReferences(
  db: Queryable,
  input: {
    companyId: string;
    callId: string;
    orders: Array<Omit<OrderReference, "token" | "lookupId" | "candidateRank">>;
  },
): Promise<OrderReference[]> {
  if (input.orders.length === 0) {
    return [];
  }

  const lookupId = crypto.randomUUID();
  const references = input.orders.map((order, candidateRank) => ({
    ...order,
    token: crypto.randomUUID(),
    lookupId,
    candidateRank,
  }));

  const values: unknown[] = [];
  const rows = references.map((reference, index) => {
    const offset = index * 13;
    values.push(
      reference.token,
      input.companyId,
      input.callId,
      reference.lookupId,
      reference.candidateRank,
      reference.wooOrderId,
      reference.orderNumber,
      reference.orderEmail ?? null,
      reference.orderPhone ?? null,
      reference.orderTypeSummary ?? null,
      reference.orderStatusSummary ?? null,
      JSON.stringify(reference.items),
      new Date(Date.now() + TOKEN_LIFETIME_MS),
    );

    const placeholders = Array.from(
      { length: 13 },
      (_, valueIndex) => `$${offset + valueIndex + 1}`,
    );
    placeholders[11] = `${placeholders[11]}::jsonb`;
    return `(${placeholders.join(", ")})`;
  });

  await db.query(
    `
      insert into genstone_customer_agent.order_candidates (
        token,
        company_id,
        call_id,
        lookup_id,
        candidate_rank,
        woo_order_id,
        order_number,
        order_email,
        order_phone,
        order_type_summary,
        order_status_summary,
        caller_safe_items,
        expires_at
      ) values ${rows.join(", ")}
    `,
    values,
  );

  return references;
}

export async function getOrderReference(
  db: Queryable,
  companyId: string,
  callId: string,
  token: string,
): Promise<OrderReference | undefined> {
  const result = await db.query<{
    token: string;
    lookup_id: string | null;
    candidate_rank: number | null;
    woo_order_id: string;
    order_number: string;
    order_email: string | null;
    order_phone: string | null;
    order_type_summary: string | null;
    order_status_summary: string | null;
    caller_safe_items: Array<{ name: string; quantity: number }>;
  }>(
    `
      select token, lookup_id, candidate_rank, woo_order_id, order_number,
             order_email, order_phone, order_type_summary, order_status_summary,
             caller_safe_items
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
    lookupId: row.lookup_id ?? undefined,
    candidateRank: row.candidate_rank ?? undefined,
    wooOrderId: row.woo_order_id,
    orderNumber: row.order_number,
    orderEmail: row.order_email ?? undefined,
    orderPhone: row.order_phone ?? undefined,
    orderTypeSummary: row.order_type_summary ?? undefined,
    orderStatusSummary: row.order_status_summary ?? undefined,
    items: row.caller_safe_items,
  };
}

export async function confirmOrderReference(
  db: Queryable,
  companyId: string,
  callId: string,
  token: string,
): Promise<OrderReference | undefined> {
  const result = await db.query<{ token: string }>(
    `
      update genstone_customer_agent.order_candidates
      set order_verified = true,
          updated_at = now()
      where company_id = $1
        and call_id = $2
        and token = $3
        and expires_at > now()
      returning token
    `,
    [companyId, callId, token],
  );

  if (!result.rows[0]) {
    return undefined;
  }

  return getOrderReference(db, companyId, callId, token);
}

export async function getVerifiedOrderReference(
  db: Queryable,
  companyId: string,
  callId: string,
  token: string,
): Promise<OrderReference | undefined> {
  const result = await db.query<{ token: string }>(
    `
      select token
      from genstone_customer_agent.order_candidates
      where company_id = $1
        and call_id = $2
        and token = $3
        and order_verified = true
        and expires_at > now()
    `,
    [companyId, callId, token],
  );

  if (!result.rows[0]) {
    return undefined;
  }

  return getOrderReference(db, companyId, callId, token);
}

export async function getNextOrderReference(
  db: Queryable,
  companyId: string,
  callId: string,
  previousToken: string,
): Promise<OrderReference | undefined> {
  const previous = await getOrderReference(db, companyId, callId, previousToken);
  if (!previous?.lookupId || previous.candidateRank === undefined) {
    return undefined;
  }

  const result = await db.query<{
    token: string;
    lookup_id: string;
    candidate_rank: number;
    woo_order_id: string;
    order_number: string;
    order_email: string | null;
    order_phone: string | null;
    order_type_summary: string | null;
    order_status_summary: string | null;
    caller_safe_items: Array<{ name: string; quantity: number }>;
  }>(
    `
      select token, lookup_id, candidate_rank, woo_order_id, order_number,
             order_email, order_phone, order_type_summary, order_status_summary,
             caller_safe_items
      from genstone_customer_agent.order_candidates
      where company_id = $1
        and call_id = $2
        and lookup_id = $3
        and candidate_rank = $4
        and expires_at > now()
    `,
    [companyId, callId, previous.lookupId, previous.candidateRank + 1],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }

  return {
    token: row.token,
    lookupId: row.lookup_id,
    candidateRank: row.candidate_rank,
    wooOrderId: row.woo_order_id,
    orderNumber: row.order_number,
    orderEmail: row.order_email ?? undefined,
    orderPhone: row.order_phone ?? undefined,
    orderTypeSummary: row.order_type_summary ?? undefined,
    orderStatusSummary: row.order_status_summary ?? undefined,
    items: row.caller_safe_items,
  };
}
