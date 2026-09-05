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
  account_id: uuid.describe("An account id from list_finances"),
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
        title: "List accounts and categories",
        description:
          "The accounts, macro categories and subcategories that exist, with their ids, plus today's date. Call this before recording anything: every other tool needs real ids from here.",
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
        title: "List recent transactions",
        description:
          "The most recent entries, newest first. Useful for checking whether a receipt was already recorded before booking it again.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(200).default(20),
        }),
      },
      async ({ limit }, ctx) => {
        const result = await callRpc<unknown>("api_recent_entries", {
          p_token: ctx.http?.authInfo?.token,
          p_limit: limit,
        });
        return "error" in result ? fail(result.error) : ok(result.data);
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
