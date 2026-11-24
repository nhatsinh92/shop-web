"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessages, messageFor } from "@/lib/api";

import { login } from "../api";
import { authKeys } from "../queries";
import { loginSchema } from "../login.schema";
import type { LoginValues } from "../login.schema";
import { safeNextPath } from "../safe-next-path";
import { notifySessionHintChanged } from "../session-hint";

const FIELDS = ["email", "password"] as const;

function isLoginField(value: string): value is (typeof FIELDS)[number] {
  return (FIELDS as readonly string[]).includes(value);
}
const ERROR_TEXT = "text-sm text-destructive";

/** /login form: RHF + Zod, contract errors next to the form, safe redirect to `next`. */
export function LoginForm({ onLoggedIn }: { onLoggedIn?: () => Promise<void> }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.all });
      notifySessionHintChanged();
      try {
        await onLoggedIn?.();
      } catch (error) {
        console.warn("onLoggedIn failed; continuing to the redirect", error);
      }
      router.replace(safeNextPath(next));
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const fieldErrors = (error.errors ?? []).flatMap((e) => {
          const field = e.field.replace(/^\//, "");
          return isLoginField(field) ? [{ field, message: e.message }] : [];
        });
        if (error.status === 400 && fieldErrors.length > 0) {
          for (const e of fieldErrors) {
            setError(e.field, { message: e.message ?? errorMessages.VALIDATION_FAILED });
          }
          return;
        }
        if (error.code === "AUTH_INVALID_CREDENTIALS" || error.code === "RATE_LIMITED") {
          setFormError(errorMessages[error.code] as string);
          return;
        }
      }
      setFormError(messageFor(error));
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div role="alert" className={formError ? `${ERROR_TEXT} rounded-lg border p-3` : "sr-only"}>
        {formError}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          className="h-touch"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="login-email-error" className={ERROR_TEXT}>
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">Mật khẩu</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          className="h-touch"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "login-password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="login-password-error" className={ERROR_TEXT}>
            {errors.password.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-touch" disabled={mutation.isPending}>
        Đăng nhập
      </Button>
    </form>
  );
}
