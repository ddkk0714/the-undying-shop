/** 01-ARCHITECTURE §5 — 한글 픽셀 폰트는 웹폰트(WOFF) + Phaser add.text 로 간다. */
export const FONT_FAMILY = 'NeoDunggeunmo, monospace';

/**
 * v3.1 — 캔버스가 1920x1080 이 되면서 3단계.
 * 전부 네오둥근모 native 16px 의 정수배다. 24px·40px 같은 값은 폰트를 뭉갠다.
 * resolution:1 필수 — 기본값(devicePixelRatio)이면 흐려진다.
 */
export const FONT_PX = { label: 16, body: 32, title: 48 } as const;
export type FontSize = keyof typeof FONT_PX;

/** 본문 32px — 기본값. `FONT` 를 그대로 쓰면 본문이다. */
export const FONT = {
  fontFamily: FONT_FAMILY,
  fontSize: '32px',
  resolution: 1,
  padding: { x: 0, y: 4 },
} as const;

export const FONT_LABEL = {
  fontFamily: FONT_FAMILY,
  fontSize: '16px',
  resolution: 1,
  padding: { x: 0, y: 2 },
} as const;

export const FONT_TITLE = {
  fontFamily: FONT_FAMILY,
  fontSize: '48px',
  resolution: 1,
  padding: { x: 0, y: 6 },
} as const;

export function fontOf(size: FontSize): typeof FONT | typeof FONT_LABEL | typeof FONT_TITLE {
  return size === 'label' ? FONT_LABEL : size === 'title' ? FONT_TITLE : FONT;
}

/**
 * M01 §4 — 폰트가 준비될 때까지 기다린다. 3초 안에 안 오면 monospace 폴백으로 진행한다.
 * 폰트 파일이 없거나 404 여도 여기서 멈추지 않는다.
 */
export async function waitForFont(timeoutMs = 3000): Promise<boolean> {
  if (!('fonts' in document)) return false;
  try {
    const load = document.fonts
      .load('32px NeoDunggeunmo', '가A0')
      .then(() => document.fonts.ready)
      .then(() => true);
    const timeout = new Promise<false>((r) => window.setTimeout(() => r(false), timeoutMs));
    const ok = await Promise.race([load, timeout]);
    if (!ok) {
      console.warn('[font] NeoDunggeunmo 로딩 3초 초과 — monospace 폴백');
      return false;
    }
    return document.fonts.check('32px NeoDunggeunmo');
  } catch (e) {
    console.warn('[font] 로딩 실패 — monospace 폴백', e);
    return false;
  }
}
