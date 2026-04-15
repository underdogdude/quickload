import type { Address } from "thailand-address-database";
import {
  searchAddressByAmphoe,
  searchAddressByProvince,
  searchAddressByTambon,
  searchAddressByZipcode,
} from "thailand-address-database";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchThaiAddresses(raw: string, maxResult = 25): Address[] {
  const q = raw.trim();
  if (!q) return [];
  const safe = escapeRegExp(q);
  const seen = new Set<string>();
  const out: Address[] = [];

  const add = (items: Address[]) => {
    for (const item of items) {
      if (out.length >= maxResult) return;
      const key = `${item.tambon}|${item.amphoe}|${item.province}|${item.zipcode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  };

  add(searchAddressByTambon(safe, maxResult));
  add(searchAddressByAmphoe(safe, maxResult));
  add(searchAddressByProvince(safe, maxResult));
  add(searchAddressByZipcode(safe, maxResult));
  return out;
}
