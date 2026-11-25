"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ShippingAddressValues } from "../checkout.schema";
import type { UseFormReturn } from "react-hook-form";

const ERROR_TEXT = "text-sm text-destructive";
const FIELD_CLASS = "h-touch";

/** DOM id of the address form, so a submit button elsewhere can reference it (`form=` attribute). */
export const ADDRESS_FORM_ID = "checkout-address-form";

type FieldName = keyof ShippingAddressValues;

const FIELDS: ReadonlyArray<{
  name: Exclude<FieldName, "note">;
  label: string;
  autoComplete: string;
  type?: string;
  optional?: boolean;
}> = [
  { name: "fullName", label: "Họ và tên", autoComplete: "name" },
  { name: "phone", label: "Số điện thoại", autoComplete: "tel", type: "tel" },
  { name: "line1", label: "Địa chỉ", autoComplete: "address-line1" },
  { name: "ward", label: "Phường/Xã", autoComplete: "address-level3" },
  { name: "district", label: "Quận/Huyện", autoComplete: "address-level2", optional: true },
  { name: "province", label: "Tỉnh/Thành phố", autoComplete: "address-level1" },
];

/** The shipping address fields; the values stay in the React Hook Form state of the parent. */
export function AddressForm({
  form,
  onSubmit,
}: {
  form: UseFormReturn<ShippingAddressValues>;
  onSubmit?: (values: ShippingAddressValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const describe = (name: FieldName) => ({
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `address-${name}-error` : undefined,
  });
  const error = (name: FieldName) =>
    errors[name] ? (
      <p id={`address-${name}-error`} className={ERROR_TEXT}>
        {errors[name].message}
      </p>
    ) : null;

  return (
    <form
      id={ADDRESS_FORM_ID}
      noValidate
      onSubmit={handleSubmit((values) => onSubmit?.(values))}
      className="flex flex-col gap-4"
    >
      {FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label htmlFor={`address-${field.name}`}>
            {field.label}
            {field.optional ? (
              <>
                {" "}
                <span className="font-normal text-stone-600">Không bắt buộc</span>
              </>
            ) : null}
          </Label>
          <Input
            id={`address-${field.name}`}
            type={field.type}
            autoComplete={field.autoComplete}
            className={FIELD_CLASS}
            {...describe(field.name)}
            {...register(field.name)}
          />
          {error(field.name)}
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Label htmlFor="address-note">Ghi chú</Label>
        <textarea
          id="address-note"
          rows={3}
          className="min-h-touch rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-base text-ink outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50 aria-invalid:border-destructive md:text-sm"
          {...describe("note")}
          {...register("note")}
        />
        {error("note")}
      </div>
    </form>
  );
}
