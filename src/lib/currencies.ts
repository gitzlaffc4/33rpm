/** ISO 4217 codes offered for "default currency". Extend freely. */
export const CURRENCIES = [
  ["USD", "US Dollar"],
  ["EUR", "Euro"],
  ["GBP", "British Pound"],
  ["CAD", "Canadian Dollar"],
  ["AUD", "Australian Dollar"],
  ["NZD", "New Zealand Dollar"],
  ["JPY", "Japanese Yen"],
  ["CHF", "Swiss Franc"],
  ["SEK", "Swedish Krona"],
  ["NOK", "Norwegian Krone"],
  ["DKK", "Danish Krone"],
  ["PLN", "Polish Złoty"],
  ["CZK", "Czech Koruna"],
  ["HUF", "Hungarian Forint"],
  ["BRL", "Brazilian Real"],
  ["MXN", "Mexican Peso"],
  ["ZAR", "South African Rand"],
  ["INR", "Indian Rupee"],
  ["KRW", "South Korean Won"],
  ["SGD", "Singapore Dollar"],
  ["HKD", "Hong Kong Dollar"],
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number][0];

export const CURRENCY_CODES = CURRENCIES.map(([code]) => code) as [CurrencyCode, ...CurrencyCode[]];
