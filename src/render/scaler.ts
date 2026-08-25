import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';

/**
 * 창을 **꽉 채운다.** 16:9 비율은 유지하고, 짧은 쪽에 맞춰 그대로 늘린다.
 *
 * ── 왜 바꿨나 (사용자 확정) ─────────────────────────────────
 * 원래는 01-ARCHITECTURE §4-1 대로 **정수 n 또는 1/n 만** 썼다. 디더 격자가 정확히
 * 2px·3px 로 병합되어 모아레가 안 생기기 때문이다. 그런데 기준이 1920x1080 이라
 * **1배와 1/2배 사이에 아무것도 없었다.** raw 가 0.5~0.999 면 전부 1/2 로 떨어져서,
 * 1080p 모니터라도 브라우저 창 모드(주소창·북마크바)면 높이가 1040 근처가 되어
 * 게임이 960x540 으로 쪼그라들었다. 1픽셀 차이로 화면이 반토막 났다 (실측):
 *
 *     1920x1080 -> 1920x1080      1920x1079 -> 960x540
 *
 * dev 서버와 빌드는 **같은 창에서 픽셀 단위로 동일했다.** 차이는 창 높이였다.
 * 심사자가 F11 을 누른다는 보장이 없으므로 채우는 쪽을 택했다.
 *
 * ── 대신 치르는 값 ─────────────────────────────────────────
 * 배율이 정수도 1/n 도 아닐 때 최근접 확대/축소를 쓰면 디더에 모아레가 낀다.
 * 그래서 **배율에 따라 보간을 바꾼다** — `imageRenderingFor()` 참조.
 * 캔버스 내부 해상도는 언제나 1920x1080 이다. 배율은 CSS 단계에서만 걸리므로
 * 씬 좌표·레이아웃(`L`)은 아무것도 바뀌지 않는다.
 *
 * 추가 요구 (M01 §3):
 *  - resize 는 100ms 디바운스 (창 드래그 중 렉 방지)
 *  - 모바일 세로 화면이면 "가로로 돌려주세요" 오버레이
 */

const NOTICE_ID = 'viewport-notice';

/** 최소 배율 1/4 — 480x270. 이보다 작으면 글자를 읽을 수 없다 */
const MIN_DIVISOR = 4;

/** 부동소수 오차를 감안한 정수·1/n 판정 여유 */
const SNAP = 0.001;

export function computeZoom(vw: number, vh: number): number {
  const raw = Math.min(vw / BASE_W, vh / BASE_H);
  return Math.max(1 / MIN_DIVISOR, raw);
}

/** 정수배(1,2,3…)이거나 정확히 1/n(1/2,1/3…)인가 — 디더가 깨지지 않는 배율 */
export function isCleanZoom(z: number): boolean {
  if (z >= 1) return Math.abs(z - Math.round(z)) < SNAP;
  const n = 1 / z;
  return Math.abs(n - Math.round(n)) < SNAP;
}

/**
 * 깨끗한 배율에서는 최근접(`pixelated`)이 정답이다 — 도트 경계가 살아 있다.
 * 어중간한 배율에서 최근접을 쓰면 어떤 픽셀은 1px, 어떤 픽셀은 2px 이 되어
 * 디더 격자에 줄무늬(모아레)가 뜬다. 그때는 브라우저 보간에 맡기는 편이 낫다 —
 * 디더 램프는 원래 멀리서 회색으로 읽히라고 그린 것이라 부드러워져도 의도가 산다.
 */
export function imageRenderingFor(z: number): string {
  return isCleanZoom(z) ? 'pixelated' : 'auto';
}

/** 최소 배율로도 다 못 담는 창인가 */
export function isTooSmall(vw: number, vh: number): boolean {
  return vw < BASE_W / MIN_DIVISOR || vh < BASE_H / MIN_DIVISOR;
}

/** 세로로 든 폰인가 — 데스크톱 세로 창은 제외한다 */
function isPortraitPhone(): boolean {
  const narrow = window.innerWidth < window.innerHeight;
  const small = Math.min(window.innerWidth, window.innerHeight) < 480;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  return narrow && (small || touch);
}

function notice(): HTMLElement {
  let el = document.getElementById(NOTICE_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = NOTICE_ID;
  document.body.appendChild(el);
  return el;
}

export function applyFitScale(game: Phaser.Game): () => void {
  const fit = () => {
    const z = computeZoom(window.innerWidth, window.innerHeight);
    game.scale.setZoom(z);
    game.scale.refresh();
    game.registry.set('zoom', z);
    // index.html 은 `image-rendering: pixelated` 를 깔아 둔다. 어중간한 배율일 때만
    // 인라인 스타일로 덮는다 (인라인이 시트를 이긴다)
    if (game.canvas !== null) game.canvas.style.imageRendering = imageRenderingFor(z);

    const el = notice();
    if (isPortraitPhone()) {
      el.textContent = '가로로 돌려주세요';
      el.style.display = 'grid';
    } else if (isTooSmall(window.innerWidth, window.innerHeight)) {
      el.textContent = `창이 너무 작습니다
${BASE_W / MIN_DIVISOR}x${BASE_H / MIN_DIVISOR} 이상으로 키워주세요`;
      el.style.whiteSpace = 'pre-line';
      el.style.display = 'grid';
    } else {
      el.style.display = 'none';
    }
  };

  fit();

  // 디바운스 100ms — 창을 드래그하는 동안 매 프레임 refresh 하지 않는다
  let timer = 0;
  const onResize = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fit, 100);
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
  };
}
