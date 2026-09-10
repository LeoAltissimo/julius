import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { createApiClient, describeApiError } from "@/lib/supabase/api";

/**
 * The Julius tool set, shared by both transports.
 *
 * The division of labour: the agent reads the photograph — it is the thing
 * with eyes — and this is the typed, validated way to write what it read.
 * There is no OCR here and no guessing about categories; the agent must fetch
 * the real ids with `list_finances` before it can book anything.
 *
 * Nothing here can reach the database on its own. Every call passes the
 * caller's token to a database function that resolves the owner from it, so an
 * agent holding a token gets exactly one person's data and no more.
 */
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCents(cents: number) {
  return money.format(cents / 100);
}

function ok(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Runs an `api_*` function, turning a Postgres error into a tool error. */
async function callRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T } | { error: string }> {
  const supabase = createApiClient();
  // The generated types do not describe these dynamically-named calls.
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )(fn, args);

  if (error) return { error: describeApiError(error.message) };
  return { data: data as T };
}

const uuid = z.string().uuid();

const paymentMethod = z.enum([
  "debit",
  "credit",
  "pix",
  "cash",
  "boleto",
  "transfer",
  "other",
]);

const accountType = z.enum([
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "other",
]);

/** Patrimony is carried at a value, so zero is meaningful where an entry's amount never is. */
const valueCents = z
  .number()
  .int()
  .min(0)
  .describe("A value as an INTEGER NUMBER OF CENTS. R$ 1.234,56 is 123456.");

const entrySchema = z.object({
  kind: z
    .enum(["expense", "income", "transfer"])
    .describe("expense for money out, income for money in, transfer between own accounts"),
  amount_cents: z
    .number()
    .int()
    .positive()
    .describe(
      "Amount as an INTEGER NUMBER OF CENTS, always positive. R$ 87,90 is 8790, R$ 1.234,56 is 123456. Never send a decimal.",
    ),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Date on the receipt, YYYY-MM-DD"),
  description: z.string().max(200).default("").describe("What it was, in the user's words"),
  notes: z.string().max(2000).optional(),
  account_id: uuid.describe(
    "An account id from list_finances. For a credit purchase this is the CARD; for debit, pix or cash it is the bank account or wallet the money left.",
  ),
  payment_method: paymentMethod
    .optional()
    .describe(
      "How it was paid. Omit on a card and it is filled in as credit, which is the only thing a card purchase can be. 'credit' is rejected on anything that is not a card.",
    ),
  counter_account_id: uuid.optional().describe("Destination account, transfers only"),
  category_id: uuid.optional().describe("A macro category id from list_finances"),
  subcategory_id: uuid
    .optional()
    .describe("A subcategory id from list_finances; must belong to category_id"),
  installments: z
    .number()
    .int()
    .min(1)
    .max(72)
    .default(1)
    .describe(
      "Number of monthly instalments. Send the FULL price as amount_cents; it is split across the months, starting on occurred_on.",
    ),
  external_ref: z
    .string()
    .max(200)
    .optional()
    .describe(
      "A stable id for this line, such as the receipt number plus the item. Sending it again is ignored instead of duplicating, so the same photo can be processed twice safely.",
    ),
});

export function registerJuliusTools(server: McpServer) {
    server.registerTool(
      "list_finances",
      {
        title: "List accounts, cards, categories and patrimony",
        description:
          "The accounts and cards, macro categories, subcategories and patrimony positions that exist, with their ids, plus today's date and the payment methods you may use. Each account says whether it is a card (`is_card`), its limit and statement days, and which account settles its bill. Call this before recording anything: every other tool needs real ids from here. For the values and history behind the patrimony, call list_investments.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        const token = ctx.http?.authInfo?.token;
        const result = await callRpc<unknown>("api_snapshot", {
          p_token: token,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "list_recent_transactions",
      {
        title: "List and total transactions",
        description:
          "Entries newest first, narrowed by any combination of date range, category, subcategory and account, with the totals already summed. Use it to check whether a receipt was booked before booking it again, and to answer \"quanto gastei com X neste mês\" without adding anything up yourself. The totals cover everything matching the filters, not just the page `limit` returns, and spending and income are totalled apart because adding them together would mean nothing.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .default(20)
            .describe("How many entries to return. The totals ignore this."),
          from_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe("Only entries on or after this date, YYYY-MM-DD"),
          to_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe("Only entries on or before this date, YYYY-MM-DD"),
          category_id: uuid
            .optional()
            .describe("A macro category id from list_finances"),
          subcategory_id: uuid
            .optional()
            .describe(
              "A subcategory id from list_finances. Independent of category_id: narrowing to one subcategory does not need the category as well.",
            ),
          account_id: uuid.optional().describe("An account or card id from list_finances"),
        }),
      },
      async (args, ctx) => {
        const result = await callRpc<{
          matching: number;
          total_cents: number;
          expense_cents: number;
          income_cents: number;
        }>("api_recent_entries", {
          p_token: ctx.http?.authInfo?.token,
          p_limit: args.limit,
          p_from_date: args.from_date ?? null,
          p_to_date: args.to_date ?? null,
          p_category_id: args.category_id ?? null,
          p_subcategory_id: args.subcategory_id ?? null,
          p_account_id: args.account_id ?? null,
        });

        if ("error" in result) return fail(result.error);

        return ok({
          ...result.data,
          total: formatCents(result.data.total_cents),
          expense_total: formatCents(result.data.expense_cents),
          income_total: formatCents(result.data.income_cents),
        });
      },
    );

    server.registerTool(
      "record_transactions",
      {
        title: "Record transactions",
        description:
          "Books one or more entries. A supermarket receipt can be a single entry with the total, or several entries split by category when that is more useful — ask the user which they want if it is not obvious. A credit card statement is usually many entries.",
        inputSchema: z.object({
          entries: z.array(entrySchema).min(1).max(100),
        }),
      },
      async ({ entries }, ctx) => {
        const result = await callRpc<{
          created: number;
          ids: string[];
          duplicates_ignored: string[];
        }>("api_create_entries", {
          p_token: ctx.http?.authInfo?.token,
          p_entries: entries,
        });

        if ("error" in result) return fail(result.error);

        // Echoing the amounts back formatted is the cheapest guard against the
        // one mistake that really hurts here: sending reais where cents were
        // expected, and booking a hundred times the real value.
        const total = entries.reduce((sum, e) => sum + e.amount_cents, 0);

        return ok({
          ...result.data,
          total_recorded: formatCents(total),
          confirm_with_the_user: entries.map(
            (e) => `${e.description || "(sem descrição)"}: ${formatCents(e.amount_cents)}`,
          ),
        });
      },
    );

    server.registerTool(
      "update_transaction",
      {
        title: "Correct a transaction already booked",
        description:
          "Fixes an entry that was recorded wrong — wrong amount, wrong category, wrong account, wrong date. Send only the fields that change: anything you leave out stays as it is, and sending a field as null clears it. Two traps. On an instalment purchase this edits ONLY the instalment you point at unless you pass apply_to_series, and with apply_to_series an amount_cents is the price of the WHOLE purchase, re-split across the instalments, while a date moves the whole series by the same shift. And a card settles its own payment method: booking against a credit card forces `credit` whatever you ask for, which the answer reports back.",
        inputSchema: z.object({
          transaction_id: uuid.describe(
            "An entry id, from list_recent_transactions or from what record_transactions returned",
          ),
          kind: z.enum(["expense", "income", "transfer"]).optional(),
          amount_cents: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              "New amount as an INTEGER NUMBER OF CENTS. R$ 87,90 is 8790. With apply_to_series this is the total of the whole purchase, not of one instalment.",
            ),
          occurred_on: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe("YYYY-MM-DD"),
          account_id: uuid.optional().describe("An account or card id from list_finances"),
          counter_account_id: uuid
            .nullable()
            .optional()
            .describe("Destination account, transfers only. null clears it."),
          category_id: uuid
            .nullable()
            .optional()
            .describe(
              "A macro category id from list_finances; must match the entry's kind. null clears it.",
            ),
          subcategory_id: uuid
            .nullable()
            .optional()
            .describe(
              "A subcategory id that belongs to category_id. null clears it. Clearing a category clears this too, so send both.",
            ),
          description: z.string().max(200).optional(),
          notes: z.string().max(2000).nullable().optional(),
          payment_method: paymentMethod.nullable().optional(),
          apply_to_series: z
            .boolean()
            .default(false)
            .describe(
              "Apply the change to every instalment of the purchase instead of just the one pointed at. Ignored on an entry that is not an instalment.",
            ),
        }),
      },
      async ({ transaction_id, apply_to_series, ...fields }, ctx) => {
        // Only the keys the agent actually sent reach the patch. That is what
        // lets an absent field mean "leave it" and an explicit null mean
        // "clear it" — a distinction a column of nullable arguments cannot
        // make, and the reason the database takes jsonb here.
        const patch = Object.fromEntries(
          Object.entries(fields).filter(([, value]) => value !== undefined),
        );

        if (Object.keys(patch).length === 0) {
          return fail(
            "Nada para alterar: envie ao menos um campo além de transaction_id.",
          );
        }

        const result = await callRpc<{
          entry: { amount_cents: number; description: string };
          applied_to: string;
          entries_changed: number;
          payment_method_forced_to_credit: boolean;
        }>("api_update_entry", {
          p_token: ctx.http?.authInfo?.token,
          p_id: transaction_id,
          p_patch: patch,
          p_apply_to_series: apply_to_series,
        });

        if ("error" in result) return fail(result.error);

        return ok({
          ...result.data,
          confirm_with_the_user: `${result.data.entry.description || "(sem descrição)"}: ${formatCents(result.data.entry.amount_cents)}`,
        });
      },
    );

    server.registerTool(
      "delete_transaction",
      {
        title: "Delete a transaction",
        description:
          "Removes an entry for good. Irreversible, so confirm with the user first — there is no archive to restore it from, and correcting a mistake is usually update_transaction rather than this. On one instalment of a purchase the call is refused until you say which you meant: delete_series false removes that instalment alone, true removes every instalment of the purchase.",
        inputSchema: z.object({
          transaction_id: uuid.describe(
            "An entry id, from list_recent_transactions or from what record_transactions returned",
          ),
          delete_series: z
            .boolean()
            .optional()
            .describe(
              "Required on an instalment: true wipes the whole purchase, false removes only the instalment pointed at. Leave it out on an ordinary entry.",
            ),
        }),
      },
      async ({ transaction_id, delete_series }, ctx) => {
        const result = await callRpc<unknown>("api_delete_entry", {
          p_token: ctx.http?.authInfo?.token,
          p_id: transaction_id,
          p_delete_series: delete_series ?? null,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "create_category",
      {
        title: "Create a macro category",
        description:
          "Creates a macro category if one with that name does not already exist; otherwise returns the existing one. Prefer an existing category over a near-synonym: two categories meaning the same thing break the month-over-month comparison.",
        inputSchema: z.object({
          name: z.string().min(1).max(60),
          kind: z.enum(["expense", "income"]).default("expense"),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .default("#64748b"),
          description: z.string().max(500).optional(),
        }),
      },
      async ({ name, kind, color, description }, ctx) => {
        const result = await callRpc<unknown>("api_upsert_category", {
          p_token: ctx.http?.authInfo?.token,
          p_name: name,
          p_kind: kind,
          p_color: color,
          p_description: description ?? null,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "create_subcategory",
      {
        title: "Create a subcategory",
        description:
          "Creates a subcategory inside a macro category if that name is not already there; otherwise returns the existing one.",
        inputSchema: z.object({
          category_id: uuid,
          name: z.string().min(1).max(60),
          description: z.string().max(500).optional(),
        }),
      },
      async ({ category_id, name, description }, ctx) => {
        const result = await callRpc<unknown>("api_upsert_subcategory", {
          p_token: ctx.http?.authInfo?.token,
          p_category_id: category_id,
          p_name: name,
          p_description: description ?? null,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "update_category",
      {
        title: "Rename or restyle a macro category",
        description:
          "Changes a macro category's name, colour or description. Omitted fields are left alone.",
        inputSchema: z.object({
          category_id: uuid,
          name: z.string().min(1).max(60).optional(),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          description: z.string().max(500).optional(),
        }),
      },
      async ({ category_id, name, color, description }, ctx) => {
        const result = await callRpc<unknown>("api_update_category", {
          p_token: ctx.http?.authInfo?.token,
          p_id: category_id,
          p_name: name ?? null,
          p_color: color ?? null,
          p_description: description ?? null,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "move_subcategory",
      {
        title: "Move a subcategory to another macro category",
        description:
          "Moves a subcategory under a different macro category and carries every existing entry with it, so past months stay consistent. Reports how many entries were repointed.",
        inputSchema: z.object({
          subcategory_id: uuid,
          target_category_id: uuid,
        }),
      },
      async ({ subcategory_id, target_category_id }, ctx) => {
        const result = await callRpc<unknown>("api_move_subcategory", {
          p_token: ctx.http?.authInfo?.token,
          p_subcategory_id: subcategory_id,
          p_target_category_id: target_category_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "merge_subcategories",
      {
        title: "Merge one subcategory into another",
        description:
          "Moves every entry from one subcategory into another and archives the emptied one. This is the way to clean up duplicates like 'Supermercado' and 'Mercado'. Irreversible in one step, so confirm with the user first.",
        inputSchema: z.object({
          from_subcategory_id: uuid.describe("The one that disappears"),
          into_subcategory_id: uuid.describe("The one that survives"),
        }),
      },
      async ({ from_subcategory_id, into_subcategory_id }, ctx) => {
        const result = await callRpc<unknown>("api_merge_subcategories", {
          p_token: ctx.http?.authInfo?.token,
          p_from_id: from_subcategory_id,
          p_into_id: into_subcategory_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "archive_subcategory",
      {
        title: "Archive a subcategory",
        description:
          "Hides a subcategory from the forms. Past entries keep pointing at it, so old reports do not change shape.",
        inputSchema: z.object({ subcategory_id: uuid }),
      },
      async ({ subcategory_id }, ctx) => {
        const result = await callRpc<unknown>("api_archive_subcategory", {
          p_token: ctx.http?.authInfo?.token,
          p_id: subcategory_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "create_account",
      {
        title: "Register a bank account or a card",
        description:
          "Registers somewhere money moves through: a bank account, a wallet, or a credit card. A card is an account with type 'credit_card' — that is what makes it a card, and what lets a purchase be booked as credit. If an account with that name already exists it is updated instead of duplicated, because two accounts meaning the same thing split every balance in half.",
        inputSchema: z.object({
          name: z.string().min(1).max(80).describe("What you call it, e.g. 'Nubank' or 'Nubank Ultravioleta'"),
          type: accountType
            .default("checking")
            .describe("Use 'credit_card' for a card, 'checking' for a bank account, 'cash' for a wallet"),
          institution: z.string().max(80).optional().describe("The bank behind it"),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          opening_balance_cents: z
            .number()
            .int()
            .optional()
            .describe("What was already there when you started tracking, in CENTS. Not for cards."),
          credit_limit_cents: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Cards only, in CENTS. R$ 15.000,00 is 1500000."),
          statement_closing_day: z
            .number()
            .int()
            .min(1)
            .max(31)
            .optional()
            .describe("Cards only: day of the month the statement closes"),
          statement_due_day: z
            .number()
            .int()
            .min(1)
            .max(31)
            .optional()
            .describe("Cards only: day of the month the bill is due"),
          settlement_account_id: uuid
            .optional()
            .describe(
              "Cards only: the bank account that pays this card's bill. Must not itself be a card.",
            ),
        }),
      },
      async (args, ctx) => {
        const result = await callRpc<unknown>("api_upsert_account", {
          p_token: ctx.http?.authInfo?.token,
          p_name: args.name,
          p_type: args.type,
          p_institution: args.institution ?? null,
          p_color: args.color ?? null,
          p_opening_balance_cents: args.opening_balance_cents ?? null,
          p_credit_limit_cents: args.credit_limit_cents ?? null,
          p_statement_closing_day: args.statement_closing_day ?? null,
          p_statement_due_day: args.statement_due_day ?? null,
          p_settlement_account_id: args.settlement_account_id ?? null,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "update_account",
      {
        title: "Edit a bank account or card",
        description:
          "Changes an account's name, type, institution, colour, or a card's limit, statement days and settling account. Omitted fields are left alone. Turning an account into a card, or a card back into an account, is done here by changing the type.",
        inputSchema: z.object({
          account_id: uuid.describe("An account id from list_finances"),
          name: z.string().min(1).max(80).optional(),
          type: accountType.optional(),
          institution: z
            .string()
            .max(80)
            .optional()
            .describe("Send an empty string to clear it"),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          credit_limit_cents: z.number().int().min(0).optional().describe("Cards only, in CENTS"),
          statement_closing_day: z.number().int().min(1).max(31).optional(),
          statement_due_day: z.number().int().min(1).max(31).optional(),
          settlement_account_id: uuid
            .optional()
            .describe("Cards only: the bank account that pays this card's bill"),
        }),
      },
      async (args, ctx) => {
        const result = await callRpc<unknown>("api_update_account", {
          p_token: ctx.http?.authInfo?.token,
          p_id: args.account_id,
          p_name: args.name ?? null,
          p_type: args.type ?? null,
          p_institution: args.institution ?? null,
          p_color: args.color ?? null,
          p_credit_limit_cents: args.credit_limit_cents ?? null,
          p_statement_closing_day: args.statement_closing_day ?? null,
          p_statement_due_day: args.statement_due_day ?? null,
          p_settlement_account_id: args.settlement_account_id ?? null,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "archive_account",
      {
        title: "Remove a bank account or card",
        description:
          "Hides an account or card from the forms. Entries already booked against it keep pointing at it, so past months do not change shape. Reversible with restore_account.",
        inputSchema: z.object({ account_id: uuid }),
      },
      async ({ account_id }, ctx) => {
        const result = await callRpc<unknown>("api_archive_account", {
          p_token: ctx.http?.authInfo?.token,
          p_id: account_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "restore_account",
      {
        title: "Bring an archived account or card back",
        description:
          "Puts an archived account or card back on the forms so it can be used again.",
        inputSchema: z.object({ account_id: uuid }),
      },
      async ({ account_id }, ctx) => {
        const result = await callRpc<unknown>("api_restore_account", {
          p_token: ctx.http?.authInfo?.token,
          p_id: account_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "list_investments",
      {
        title: "List patrimony positions",
        description:
          "Every position that makes up the patrimony (patrimônio): ids, what each is worth in cents, when it was last updated, plus the total and the recent net worth curve. Call this before editing or removing anything here.",
        inputSchema: z.object({
          include_archived: z
            .boolean()
            .default(false)
            .describe("Also list positions that were archived, so one can be restored"),
          history_limit: z
            .number()
            .int()
            .min(0)
            .max(400)
            .default(30)
            .describe("How many points of the net worth curve to return, newest last. 0 for none."),
        }),
      },
      async ({ include_archived, history_limit }, ctx) => {
        const result = await callRpc<{ total_cents: number }>("api_investments", {
          p_token: ctx.http?.authInfo?.token,
          p_include_archived: include_archived,
          p_history_limit: history_limit,
        });

        if ("error" in result) return fail(result.error);

        return ok({
          ...result.data,
          total: formatCents(result.data.total_cents),
        });
      },
    );

    server.registerTool(
      "add_investment",
      {
        title: "Add a patrimony position",
        description:
          "Adds a position to the patrimony — an account at a broker, a fund, a property, anything carried at a value you keep up to date. If a position with that name already exists it is updated instead of duplicated, because two lines meaning the same thing split the net worth curve in half.",
        inputSchema: z.object({
          name: z.string().min(1).max(80).describe("What you call it, e.g. 'Tesouro Selic'"),
          value_cents: valueCents.describe(
            "What it is worth today, as an INTEGER NUMBER OF CENTS. R$ 12.500,00 is 1250000. Never send a decimal.",
          ),
          institution: z.string().max(80).optional().describe("Broker or bank holding it"),
          kind: z
            .string()
            .max(40)
            .optional()
            .describe("Free text, e.g. 'Renda fixa', 'Ações', 'Imóvel'"),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          notes: z.string().max(2000).optional(),
        }),
      },
      async ({ name, value_cents, institution, kind, color, notes }, ctx) => {
        const result = await callRpc<{
          id: string;
          created: boolean;
          restored: boolean;
          current_value_cents: number;
        }>("api_upsert_investment", {
          p_token: ctx.http?.authInfo?.token,
          p_name: name,
          p_value_cents: value_cents,
          p_institution: institution ?? null,
          p_kind: kind ?? null,
          p_color: color ?? null,
          p_notes: notes ?? null,
        });

        if ("error" in result) return fail(result.error);

        return ok({
          ...result.data,
          confirm_with_the_user: `${name}: ${formatCents(result.data.current_value_cents)}`,
        });
      },
    );

    server.registerTool(
      "update_investment",
      {
        title: "Edit a patrimony position",
        description:
          "Changes what a position is worth, or its name, institution, kind, colour or notes. Omitted fields are left alone. A new value is appended to the history, so the net worth curve moves exactly as it would had you typed it into the app.",
        inputSchema: z.object({
          investment_id: uuid.describe("A position id from list_investments"),
          name: z.string().min(1).max(80).optional(),
          value_cents: valueCents
            .optional()
            .describe(
              "The new value, as an INTEGER NUMBER OF CENTS. This is the total the position is worth now, not the amount it moved by.",
            ),
          institution: z
            .string()
            .max(80)
            .optional()
            .describe("Send an empty string to clear it"),
          kind: z.string().max(40).optional().describe("Send an empty string to clear it"),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          notes: z.string().max(2000).optional().describe("Send an empty string to clear it"),
        }),
      },
      async (
        { investment_id, name, value_cents, institution, kind, color, notes },
        ctx,
      ) => {
        const result = await callRpc<{
          previous_value_cents: number;
          current_value_cents: number;
        }>("api_update_investment", {
          p_token: ctx.http?.authInfo?.token,
          p_id: investment_id,
          p_name: name ?? null,
          p_value_cents: value_cents ?? null,
          p_institution: institution ?? null,
          p_kind: kind ?? null,
          p_color: color ?? null,
          p_notes: notes ?? null,
        });

        if ("error" in result) return fail(result.error);

        return ok({
          ...result.data,
          confirm_with_the_user: `${formatCents(result.data.previous_value_cents)} → ${formatCents(result.data.current_value_cents)}`,
        });
      },
    );

    server.registerTool(
      "update_investment_values",
      {
        title: "Update several patrimony values at once",
        description:
          "The periodic ritual: whatever each position is worth today, in one call. Values that did not move are reported rather than written, so the history stays a record of real movements. Send the new total for each position, never the amount it changed by.",
        inputSchema: z.object({
          values: z
            .array(
              z.object({
                investment_id: uuid,
                value_cents: valueCents,
              }),
            )
            .min(1)
            .max(100),
        }),
      },
      async ({ values }, ctx) => {
        const result = await callRpc<{ total_cents: number }>(
          "api_update_investment_values",
          {
            p_token: ctx.http?.authInfo?.token,
            p_values: values,
          },
        );

        if ("error" in result) return fail(result.error);

        return ok({
          ...result.data,
          total: formatCents(result.data.total_cents),
        });
      },
    );

    server.registerTool(
      "archive_investment",
      {
        title: "Remove a patrimony position",
        description:
          "The way to remove a position: it stops counting towards the total and leaves the app, but its history stays, so the past shape of the net worth curve does not change. Reversible with restore_investment.",
        inputSchema: z.object({ investment_id: uuid }),
      },
      async ({ investment_id }, ctx) => {
        const result = await callRpc<unknown>("api_archive_investment", {
          p_token: ctx.http?.authInfo?.token,
          p_id: investment_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "restore_investment",
      {
        title: "Bring an archived position back",
        description:
          "Puts an archived position back on the board, counting towards the total again. Find its id with list_investments and include_archived.",
        inputSchema: z.object({ investment_id: uuid }),
      },
      async ({ investment_id }, ctx) => {
        const result = await callRpc<unknown>("api_restore_investment", {
          p_token: ctx.http?.authInfo?.token,
          p_id: investment_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "delete_investment",
      {
        title: "Delete a patrimony position for good",
        description:
          "Erases a position and its whole value history, rewriting the net worth curve as though it had never existed. That is right for one opened by mistake and wrong for one you simply closed — for that use archive_investment. Irreversible, so confirm with the user first.",
        inputSchema: z.object({ investment_id: uuid }),
      },
      async ({ investment_id }, ctx) => {
        const result = await callRpc<unknown>("api_delete_investment", {
          p_token: ctx.http?.authInfo?.token,
          p_id: investment_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );

    server.registerTool(
      "archive_category",
      {
        title: "Archive a macro category",
        description:
          "Hides a macro category and its subcategories from the forms. Past entries are untouched.",
        inputSchema: z.object({ category_id: uuid }),
      },
      async ({ category_id }, ctx) => {
        const result = await callRpc<unknown>("api_archive_category", {
          p_token: ctx.http?.authInfo?.token,
          p_id: category_id,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
      },
    );
  }
