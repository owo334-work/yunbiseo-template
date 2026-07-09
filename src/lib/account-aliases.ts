// 입금 계좌 별칭
// system_settings 테이블에 key='deposit_account_aliases' 로 { 계좌끝4자리: "별칭" } JSON 을 저장한다.
// 한 번 지정하면 그 계좌 끝자리를 가진 모든 입금에 자동으로 별칭이 표시된다.

export const ACCOUNT_ALIASES_KEY = "deposit_account_aliases";

export type AccountAliasMap = Record<string, string>; // last4 → 별칭

/** system_settings.value(문자열)에서 계좌 별칭 맵을 파싱한다. */
export function parseAccountAliases(value: string | null | undefined): AccountAliasMap {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed as AccountAliasMap;
  } catch {
    /* 손상된 값은 빈 맵으로 */
  }
  return {};
}

/** 계좌 끝4자리에 지정된 별칭을 돌려준다(없으면 null). */
export function aliasForAccount(
  last4: string | null | undefined,
  aliases: AccountAliasMap,
): string | null {
  const key = (last4 ?? "").trim();
  if (!key) return null;
  return aliases[key] ?? null;
}
