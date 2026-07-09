/**
 * 인증번호(OTP) SMS 파서.
 * 예) "[Web발신]\n[쿠팡] 본인확인\n인증번호 [375863]입니다.\n\"타인 노출 금지\""
 *   → service="쿠팡", code="375863"
 *
 * 서비스마다 문구가 다르므로 코드와 서비스명을 각각 관대하게 추출하고,
 * 서비스명을 못 찾아도 코드가 있으면 partial 로 저장한다(원문은 항상 보존).
 */

export interface ParsedOtpSms {
  code: string | null; // 인증번호
  service: string | null; // 서비스명 (예: 쿠팡)
  status: "parsed" | "partial" | "failed";
}

export function parseOtpSms(text: string): ParsedOtpSms {
  // 코드: "인증번호 [123456]", "인증번호는 123456", "인증번호: 123456", "인증코드 1234"
  const codeMatch = text.match(/인증\s*(?:번호|코드)[는은\s:]*\[?\s*(\d{4,8})\s*\]?/);
  const code = codeMatch ? codeMatch[1] : null;

  // 서비스명: [Web발신] 과 숫자만 든 대괄호를 제외한 첫 [대괄호] 안의 값
  let service: string | null = null;
  const brackets = text.match(/\[([^\]]+)\]/g) ?? [];
  for (const bracket of brackets) {
    const inner = bracket.slice(1, -1).trim();
    if (!inner || /web\s*발신/i.test(inner) || /^\d+$/.test(inner)) continue;
    service = inner;
    break;
  }

  const status = code ? (service ? "parsed" : "partial") : "failed";
  return { code, service, status };
}
