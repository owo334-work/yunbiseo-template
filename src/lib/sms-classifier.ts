/**
 * 수신 SMS 원문을 3종(인증번호/계좌입금/카드결제승인)으로 분류한다.
 * 어디에도 안 맞으면 'unknown' — 원문은 sms_inbox 에 그대로 남아 나중에 재분류할 수 있다.
 */

export type SmsCategory = "otp" | "deposit" | "card" | "unknown";

export function classifySms(text: string): SmsCategory {
  // 인증번호: "인증번호"/"인증코드"/"verification code"/"OTP"
  if (/인증\s*(?:번호|코드)|verification\s*code|one[-\s]?time|OTP/i.test(text)) {
    return "otp";
  }

  // 계좌입금: "입금 116,700원" 형태
  if (/입금\s*[0-9,]+\s*원|입금액/.test(text)) {
    return "deposit";
  }

  // 카드결제승인: "승인" + 금액(원)
  if (/승인/.test(text) && /[0-9,]+\s*원/.test(text)) {
    return "card";
  }

  return "unknown";
}
