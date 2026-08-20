import Phaser from 'phaser';
import { BASE_W, BASE_H } from '../config';

/**
 * 01-ARCHITECTURE §4-1 + M01 §3 — 정수배 스케일만 허용한다.
 * FIT 모드는 반픽셀을 만들어 픽셀 폰트를 뭉갠다. 절대 쓰지 않는다.
 *
 * 추가 요구 (M01 §3):
 *  - resize 는 100ms 디바운스 (창 드래그 중 렉 방지)
 *  - 모바일 세로 화면이면 "가로로 돌려주세요" 오버레이
 *
 * 뷰포트가 480x270 보다 작으면 정수배(최소 1배)로도 캔버스가 잘린다.
 * 흐리게 줄이는 것(=FIT)은 금지이므로, 잘린 화면을 보여주는 대신
 * 세로 폰과 같은 방식으로 오버레이를 덮는다. 창을 키우면 즉시 복귀한다.
 */

const NOTICE_ID = 'viewport-notice';

export function computeZoom(vw: number, vh: number): number {
  return Math.max(1, Math.floor(Math.min(vw / BASE_W, vh / BASE_H)));
}

/** 1배조차 다 못 담는 창인가 */
export function isTooSmall(vw: number, vh: number): boolean {
  return vw < BASE_W || vh < BASE_H;
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
${BASE_W}x${BASE_H} 이상으로 키워주세요`;
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
