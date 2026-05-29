export const DEFAULT_SMARTPOST_USER_CODE = "NO48-166";
export const DEFAULT_SMARTPOST_GETCOST_BASE_URL = "https://vip.getsmartpost.com/customer/thaipost/";
export const DEFAULT_SMARTPOST_GETCOST_PATH = "getcost.php";

const PRICE_ADJUSTMENT_BY_USER_CODE: Record<string, number> = {
  "NO48-166": 5,
};

export function getSmartpostPriceAdjustment(userCode: string): number {
  return PRICE_ADJUSTMENT_BY_USER_CODE[userCode] ?? 0;
}
