/**
 * 계좌입금 SMS 파서.
 * 예) "[Web발신]\n2026/07/09 11:12\n입금 116,700원\nKCP[오픈마켓]\n403***13604027\n기업"
 *   → depositDate="2026-07-09", amount=116700, depositorName="KCP[오픈마켓]",
 *     accountLast4="4027", bankName="기업"
 *
 * 은행마다 문구가 달라 필드별로 관대하게 추출한다. 계좌번호는 가운데가 마스킹(*)돼 있어도
 * 보이는 숫자의 끝 4자리를 계좌 구분 키로 쓴다. 빠진 필드가 있어도 금액이 있으면 저장한다.
 */

export interface ParsedDepositSms {
  depositDate: string | null; // YYYY-MM-DD (KST 기준)
  depositAt: Date | null; // 입금 일시
  amount: number; // 입금액 (원)
  depositorName: string | null; // 입금자/적요
  accountLast4: string | null; // 입금 계좌 끝 4자리
  bankName: string | null; // 은행
  status: "parsed" | "partial" | "failed";
}

// 은행 키워드 (문자 본문에 흔히 나오는 짧은 표기)
const BANK_KEYWORDS = [
  "기업",
  "국민",
  "신한",
  "우리",
  "하나",
  "농협",
  "NH",
  "SC",
  "씨티",
  "카카오뱅크",
  "토스뱅크",
  "새마을",
  "신협",
  "우체국",
  "부산",
  "대구",
  "경남",
  "광주",
  "전북",
  "제주",
  "산업",
  "수협",
];

function extractDepositAt(text: string): { date: string | null; at: Date | null } {
  // YYYY/MM/DD HH:mm 또는 YYYY-MM-DD HH:mm (입금 SMS 시각은 한국 시간)
  const m = text.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return { date: null, at: null };
  const [, y, mo, d, hh, mi] = m;
  const yyyy = y;
  const MM = mo.padStart(2, "0");
  const dd = d.padStart(2, "0");
  const HH = hh.padStart(2, "0");
  const date = `${yyyy}-${MM}-${dd}`;
  const at = new Date(`${date}T${HH}:${mi}:00+09:00`);
  return { date, at: Number.isNaN(at.getTime()) ? null : at };
}

function extractAmount(text: string): number {
  // "입금 116,700원" — 입금 키워드 뒤 금액 우선
  const withKeyword = text.match(/입금\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\s*원/);
  const target = withKeyword ?? text.match(/([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\s*원/);
  if (!target) return 0;
  const n = parseInt(target[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// 마스킹된 계좌번호 라인(예: 403***13604027)에서 보이는 숫자의 끝 4자리
function extractAccountLast4(lines: string[]): { last4: string | null; lineIndex: number } {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("*")) continue;
    const digits = line.replace(/[^0-9]/g, "");
    if (digits.length >= 4) return { last4: digits.slice(-4), lineIndex: i };
  }
  return { last4: null, lineIndex: -1 };
}

function extractBank(text: string): string | null {
  for (const bank of BANK_KEYWORDS) {
    if (text.includes(bank)) return bank;
  }
  return null;
}

export function parseDepositSms(text: string): ParsedDepositSms {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const { date, at } = extractDepositAt(text);
  const amount = extractAmount(text);
  const { last4, lineIndex: accountIdx } = extractAccountLast4(lines);
  const bankName = extractBank(text);

  // 입금자/적요: [Web발신]·날짜·금액·계좌·은행 라인을 제외한 첫 라인
  let depositorName: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (i === accountIdx) continue;
    const line = lines[i];
    if (/^\[?web\s*발신\]?$/i.test(line)) continue;
    if (/\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}/.test(line)) continue; // 날짜 라인
    if (/입금|출금|잔액/.test(line)) continue; // 입출금·잔액 키워드 라인
    if (/[0-9][\s,]*원/.test(line)) continue; // 금액(숫자+원) 라인 — '송원' 같은 이름은 통과
    if (BANK_KEYWORDS.includes(line)) continue; // 은행 단독 라인
    depositorName = line;
    break;
  }

  let status: ParsedDepositSms["status"];
  if (amount <= 0) status = "failed";
  else if (!depositorName || !last4) status = "partial";
  else status = "parsed";

  return { depositDate: date, depositAt: at, amount, depositorName, accountLast4: last4, bankName, status };
}
