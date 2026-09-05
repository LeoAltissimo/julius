"use client";

import { useActionState, useState } from "react";

import { Button, Field, FormError, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";

import {
  resendConfirmation,
  signIn,
  signUp,
  type AuthState,
} from "./actions";

const initialState: AuthState = { error: null, notice: null };

export function LoginForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");

  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <Field label={t.login.email}>
          <Input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder={t.login.emailPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field
          label={t.login.password}
          hint={mode === "signup" ? t.login.passwordHint : undefined}
        >
          <Input
            name="password"
            type="password"
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            required
            minLength={8}
          />
        </Field>

        <FormError message={state.error} />

        {state.notice ? (
          <p className="rounded-xl border border-border bg-surface-3 px-3 py-2 text-sm text-text-muted">
            {state.notice}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending
            ? t.common.wait
            : mode === "signin"
              ? t.login.signIn
              : t.login.signUp}
        </Button>
      </form>

      {state.needsConfirmation ? <ResendConfirmation email={email} /> : null}

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="text-center text-xs text-text-muted underline underline-offset-4 hover:text-text"
      >
        {mode === "signin" ? t.login.noAccount : t.login.haveAccount}
      </button>
    </div>
  );
}

/** Its own form, so resending does not disturb the sign-in form's state. */
function ResendConfirmation({ email }: { email: string }) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(
    resendConfirmation,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.common.wait : t.login.resendConfirmation}
      </Button>
      <FormError message={state.error} />
      {state.notice ? (
        <p className="rounded-xl border border-border bg-surface-3 px-3 py-2 text-sm text-text-muted">
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
