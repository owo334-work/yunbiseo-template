# 쿠팡 로컬 수집기 → Vercel 윤비서

쿠팡 로그인은 각 PC에서만 처리하고, 다운로드한 상품별 판매·재고 Excel의 업무 데이터만
Vercel 윤비서로 전송한다. 쿠팡 비밀번호와 로그인 쿠키는 전송하지 않는다.

## 준비

1. Vercel에 윤비서를 배포하고 Supabase 마이그레이션을 적용한다.
2. 윤비서 `[시스템설정] → [API 키]`에서 PC 수집기 전용 키를 발급한다.
3. 각 PC에 다음 환경변수를 둔다.
   - `YUNBISEO_URL=https://배포주소.vercel.app`
   - `YUNBISEO_API_KEY=발급받은 키`
4. 쿠팡 판매분석 조회기간을 반드시 하루로 맞춘 뒤 Excel을 다운로드한다.

## 실행 예시

```powershell
python scripts/coupang-cloud-uploader.py `
  --downloads "C:\Users\사용자\Documents\coupang_portable\downloads" `
  --date 2026-07-28
```

같은 파일을 다시 보내도 `batch_key`가 같으면 중복 반영하지 않는다.

## 저장 규칙

- 상품·옵션: 쿠팡 옵션 ID를 기준으로 갱신한다.
- 판매: 날짜+스토어+상품+옵션 기준으로 갱신한다.
- 재고: 날짜+스토어+옵션 기준의 스냅샷으로 갱신한다.
- 계정 로그인 파일은 PC에만 남는다.
- 정산·반품은 후속 수집 유형으로 별도 추가한다.
