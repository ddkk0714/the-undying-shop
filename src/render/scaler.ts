import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';

/**
 * 01-ARCHITECTURE §4-1 (v3.1) — **배율은 정수 n 또는 1/n 만** 허용한다.
 *
 * 기준이 1920x1080 이 되면서 대부분의 창은 기준보다 작다. 확대만 정수로 묶으면 화면이 잘린다.
 * 1/2·1/3 축소는 디더 격자가 정확히 2px·3px 로 병합되므로 모아레가 생기지 않는다.
 * 그 사이의 실수 배율(=`Phaser.Scale.FIT`)은 여전히 금지다.
 *
 * 추가 요구 (M01 §3):
 *  - resize 는 100ms 디바운스 (창 드래그 중 렉 방지)
 *  - 모바일 세로 화면이면 "가로로 돌려주세요" 오버레이
 */

const NOTICE_ID = 'viewport-notice';

/** 최소 배율 1/4 — 480x270. 이보다 작으면 글자를 읽을 수 없다 */
const MIN_DIVISOR = 4;

export function computeZoom(vw: number, vh: number): number {
  const raw = Math.min(vw / BASE_W, vh / BASE_H);
  if (raw >= 1) return Math.floor(raw);
  return 1 / Math.min(MIN_DIVISOR, Math.max(1, Math.ceil(1 / raw)));
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

export function applyIntegerScale(game: Phaser.Game): () => void {
  const fit = () => {
    const z = computeZoom(window.innerWidth, window.innerHeight);
    game.scale.setZoom(z);
    game.scale.refresh();
    game.registry.set('zoom', z);

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
