/**
 * 대사 타자음을 캐릭터별로 고른다.
 *
 * 원본(`아트-발주서/…/텍스트/남자·여자텍스트출력.wav`)은 「띡띡띡띡…」이 여덟 번
 * 반복되는 1초짜리라, 글자마다 재생하면 한 글자에 여덟 번 울린다.
 * `tools/cut-sfx.mjs` 로 **첫 한 방만 90ms** 잘라 `sfx.text.male` / `sfx.text.female`
 * 슬롯에 넣어 뒀다.
 *
 * ★ 성별은 `stars.json` 에 필드가 없다. 데이터에 없는 것을 씬이 추론하면 틀린다 —
 *   그래서 **사람이 정한 표를 여기 한 곳에** 둔다. 캐릭터가 늘면 이 표에 한 줄 더한다.
 */

export type Voice = 'male' | 'female';

/** 기본값 — 표에 없는 배우는 이 목소리를 쓴다 */
const FALLBACK: Voice = 'female';

const BY_STAR: Record<string, Voice> = {
  body_karin: 'female',   // 노일 세이로 — 검사 / 에고 웨폰
  body_juno: 'male',      // 펜로 루엔 — 궁수 / 스카우트
  body_sela: 'female',    // 녹스 비오레 / 크로우 — 도적 / 흡혈귀
  body_ilan: 'female',    // 미레 바인 — 마법사 / 영매사
  body_mor: 'female',     // 헤일 메르네 — 성녀 / 간호사
};

export function starVoice(starId: string | undefined): Voice {
  if (starId === undefined) return FALLBACK;
  return BY_STAR[starId] ?? FALLBACK;
}
