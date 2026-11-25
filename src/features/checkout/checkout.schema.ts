import { z } from "zod";

import type { CoreComponents } from "@/lib/api";

type ShippingAddress = CoreComponents["schemas"]["ShippingAddress"];

const PHONE = /^(0|\+84)[35789][0-9]{8}$/;

const required = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Tối đa ${max} ký tự.`);

/** The address form. `note` belongs to the order request, not to the contract's ShippingAddress. */
export const shippingAddressSchema = z.object({
  fullName: required(100, "Vui lòng nhập họ và tên."),
  phone: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập số điện thoại.")
    .max(20, "Tối đa 20 ký tự.")
    .regex(PHONE, "Số điện thoại không hợp lệ"),
  line1: required(200, "Vui lòng nhập địa chỉ."),
  ward: required(100, "Vui lòng nhập phường/xã."),
  district: z.string().trim().max(100, "Tối đa 100 ký tự.").optional(),
  province: required(100, "Vui lòng chọn tỉnh/thành phố."),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự.").optional(),
});

export type ShippingAddressValues = z.infer<typeof shippingAddressSchema>;

// A contract change to ShippingAddress breaks tsc here.
type AddressFields = Omit<ShippingAddressValues, "note">;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const addressMatchesContract: Exact<AddressFields, ShippingAddress> = true;
