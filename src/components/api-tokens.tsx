"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button, Field, FormError, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";

import {
  createApiToken,
  deleteApiToken,
  revokeApiToken,
  type TokenState,
} from "@/app/(app)/settings/actions";

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const initialState: TokenState = { error: null, token: null };

export function ApiTokens({
  tokens,
  endpoint,
}: {
  tokens: ApiTokenRow[];
  endpoint: string;
}) {
  const { t, fmt } = useI18n();
  const [state, formAction, pending] = useActionState(
    createApiToken,
    initialState,
  );

  return (
    <div className="flex flex-col gap-4">
      <CopyRow label={t.settings.mcpEndpoint} value={endpoint} />

      {state.token ? (
        <div className="rounded-xl border border-accent/40 bg-surface-3 p-3">
          <p className="mb-2 text-xs text-text-muted">
            {t.settings.tokenOnceWarning}
          </p>
          <CopyRow label="" value={state.token} />
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3">
        <Field label={t.settings.tokenName}>
          <Input
            name="name"
            required
            maxLength={60}
            placeholder={t.settings.tokenNamePlaceholder}
          />
        </Field>
        <FormError message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.common.wait : t.settings.createToken}
        </Button>
      </form>

      {tokens.length === 0 ? (
        <p className="text-xs text-text-faint">{t.settings.noTokens}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center gap-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">
                  {token.name}
                  {token.revoked_at ? (
                    <span className="ml-1.5 text-xs text-negative">
                      {t.settings.tokenRevoked}
                    </span>
                  ) : null}
                </span>
                <span className="tabular block truncate text-xs text-text-faint">
                  {token.prefix}… ·{" "}
                  {token.last_used_at
                    ? t.settings.tokenLastUsed(fmt.shortDate(token.last_used_at))
                    : t.settings.tokenNeverUsed}
                </span>
              </span>

              <form
                action={token.revoked_at ? deleteApiToken : revokeApiToken}
                className="shrink-0"
              >
                <input type="hidden" name="id" value={token.id} />
                <Button type="submit" variant="ghost" size="sm">
                  {token.revoked_at
                    ? t.settings.removeToken
                    : t.settings.revoke}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the value is on screen to select.
    }
  }

  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-xs font-medium text-text-muted">
          {label}
        </span>
      ) : null}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-0 px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs text-text">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={t.settings.copy}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          {copied ? (
            <Check className="size-4 text-positive" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
