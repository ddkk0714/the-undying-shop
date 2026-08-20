/** 01-ARCHITECTURE §5 — 한글 픽셀 폰트는 웹폰트(TTF/WOFF) + Phaser add.text 로 간다. */
export const FONT_FAMILY = 'NeoDunggeunmo, monospace';

/** 16px 단일 크기. 위계는 색과 여백으로 만든다 (04-UI-KIT §3). */
export const FONT = {
  fontFamily: FONT_FAMILY,
  fontSize: '16px',
  resolution: 1, // 기본값(devicePixelRatio)이면 흐려진다
  padding: { x: 0, y: 2 },
} as const;

/**
 * 폰트가 준비될 때까지 기다린다. 3초 안에 안 오면 monospace 폴백으로 그냥 진행한다.
 * 게임이 멈추는 것보다 못생긴 게 낫다.
 */
export async function waitForFont(timeoutMs = 3000): Promise<boolean> {
  if (!('fonts' in document)) return false;
  const load = document.fonts.load('16px NeoDunggeunmo', '가A0').then(() => document.fonts.ready);
  const timeout = new Promise<'timeout'>((r) => window.setTimeout(() => r('timeout'), timeoutMs));
  const result = await Promise.race([load, timeout]);
  if (result === 'timeout') {
    console.warn('[font] NeoDunggeunmo 로딩 3초 초과 — monospace 폴백');
    return false;
  }
  return document.fonts.check('16px NeoDunggeunmo');
}
