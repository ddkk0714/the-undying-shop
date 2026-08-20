/** 01-ARCHITECTURE §5 — 한글 픽셀 폰트는 웹폰트(WOFF) + Phaser add.text 로 간다. */
export const FONT_FAMILY = 'NeoDunggeunmo, monospace';

/**
 * 16px 단일 크기. 위계는 색과 여백으로 만든다 (04-UI-KIT §3).
 * resolution:1 필수 — 기본값(devicePixelRatio)이면 흐려진다.
 */
export const FONT = {
  fontFamily: FONT_FAMILY,
  fontSize: '16px',
  resolution: 1,
  padding: { x: 0, y: 2 },
} as const;

/**
 * M01 §4 — 폰트가 준비될 때까지 기다린다. 3초 안에 안 오면 monospace 폴백으로 진행한다.
 * 폰트 파일이 없거나 404 여도 여기서 멈추지 않는다.
 */
export async function waitForFont(timeoutMs = 3000): Promise<boolean> {
  if (!('fonts' in document)) return false;
  try {
    const load = document.fonts
      .load('16px NeoDunggeunmo', '가A0')
      .then(() => document.fonts.ready)
      .then(() => true);
    const timeout = new Promise<false>((r) => window.setTimeout(() => r(false), timeoutMs));
    const ok = await Promise.race([load, timeout]);
    if (!ok) {
      console.warn('[font] NeoDunggeunmo 로딩 3초 초과 — monospace 폴백');
      return false;
    }
    return document.fonts.check('16px NeoDunggeunmo');
  } catch (e) {
    console.warn('[font] 로딩 실패 — monospace 폴백', e);
    return false;
  }
}
