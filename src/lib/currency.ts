/** Client-safe currency catalogue + money helpers (no secrets). */
export type Currency = {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  usdRate: number; // units of this currency per 1 USD
  decimals: number;
  kind: "fiat" | "crypto";
  methods: string[];
};

export const KES_PER_USD = 129;

export const CURRENCIES: Currency[] = [
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪", usdRate: 129, decimals: 2, kind: "fiat", methods: ["M-PESA", "AIRTEL MONEY", "VISA / MASTERCARD"] },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", flag: "🇺🇬", usdRate: 3700, decimals: 0, kind: "fiat", methods: ["MTN MOMO", "AIRTEL MONEY"] },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", flag: "🇹🇿", usdRate: 2600, decimals: 0, kind: "fiat", methods: ["M-PESA", "AIRTEL MONEY"] },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", flag: "🇳🇬", usdRate: 1500, decimals: 2, kind: "fiat", methods: ["BANK TRANSFER", "USSD"] },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", flag: "🇬🇭", usdRate: 15, decimals: 2, kind: "fiat", methods: ["MTN MOMO", "VODAFONE CASH"] },
  { code: "ZAR", name: "South African Rand", symbol: "R", flag: "🇿🇦", usdRate: 18.5, decimals: 2, kind: "fiat", methods: ["EFT", "VISA / MASTERCARD"] },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", usdRate: 1, decimals: 2, kind: "fiat", methods: ["VISA / MASTERCARD", "CRYPTO (USDT)"] },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", usdRate: 0.92, decimals: 2, kind: "fiat", methods: ["VISA / MASTERCARD", "CRYPTO (USDT)"] },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧", usdRate: 0.79, decimals: 2, kind: "fiat", methods: ["VISA / MASTERCARD"] },
  { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳", usdRate: 83, decimals: 2, kind: "fiat", methods: ["UPI", "VISA / MASTERCARD"] },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "🇧🇷", usdRate: 5.5, decimals: 2, kind: "fiat", methods: ["PIX", "VISA / MASTERCARD"] },
  { code: "AED", name: "UAE Dirham", symbol: "AED", flag: "🇦🇪", usdRate: 3.67, decimals: 2, kind: "fiat", methods: ["VISA / MASTERCARD"] },
  { code: "USDT", name: "Tether", symbol: "₮", flag: "💠", usdRate: 1, decimals: 2, kind: "crypto", methods: ["CRYPTO (USDT)"] },
  { code: "BTC", name: "Bitcoin", symbol: "₿", flag: "🟠", usdRate: 1 / 68000, decimals: 6, kind: "crypto", methods: ["CRYPTO (BTC)"] },
  { code: "ETH", name: "Ethereum", symbol: "Ξ", flag: "🔷", usdRate: 1 / 2600, decimals: 5, kind: "crypto", methods: ["CRYPTO (ETH)"] },
];

export const CURRENCY_MAP: Record<string, Currency> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): Currency {
  return CURRENCY_MAP[code?.toUpperCase()] ?? CURRENCY_MAP.KES;
}

/** 1 unit of `code` expressed in KES. */
export function toKES(amount: number, code: string): number {
  return (amount / getCurrency(code).usdRate) * KES_PER_USD;
}

export function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const f = getCurrency(from);
  const t = getCurrency(to);
  return (amount / f.usdRate) * t.usdRate;
}

export function money(value: number, code: string): string {
  const c = getCurrency(code);
  const n = Number(value ?? 0);
  return `${c.symbol}${n.toLocaleString("en-US", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  })}`;
}

export function roundMoney(value: number, code: string): number {
  const c = getCurrency(code);
  const f = Math.pow(10, c.decimals);
  return Math.round(value * f) / f;
}

/** Stake limits per currency, normalised from the KES floor/ceiling. */
export function stakeLimits(code: string, minKes = 10, maxKes = 100000) {
  const c = getCurrency(code);
  const step = Math.pow(10, c.decimals);
  const min = Math.ceil((minKes / KES_PER_USD) * c.usdRate * step) / step;
  const max = Math.floor((maxKes / KES_PER_USD) * c.usdRate * step) / step;
  return { min: Math.max(min, step / 10 || 0.01), max };
}
