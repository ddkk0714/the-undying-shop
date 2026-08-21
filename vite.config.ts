import { defineConfig, type Plugin } from 'vitest/config';

/**
 * 03-ASSET-MODULES §2 — 본 아트 자동 인식.
 *
 * 개발 서버가 도는 중에 `public/assets/packs/final/` 에 PNG 를 떨구면
 * 매니페스트를 다시 쓰고 브라우저를 새로고침한다. 사람이 할 일은 파일을 넣는 것뿐이다.
 * (한 번만 돌리려면 `npm run art`)
 */
function artWatcher(): Plugin {
  // @types/node 를 넣지 않으려고(새 의존성 금지) 스캐너를 모듈로 불러 실행한다.
  // ★ 상대경로로 부르면 안 된다 — Vite 는 이 설정 파일을 node_modules/.vite-temp/ 로
  //   번들해서 실행하므로 기준점이 거기가 된다. 서버가 알려주는 root 에서 절대 URL 을 만든다.
  // 쿼리를 붙여 모듈 캐시를 매번 비운다 — 안 그러면 첫 한 번만 돈다.
  let running = false;
  const rescan = async (root: string, stamp: number): Promise<void> => {
    if (running) return;
    running = true;
    const abs = root.split('\\').join('/').replace(/^\/+/, '');
    const href = `file:///${abs}/tools/scan-art.mjs?t=${stamp}`;
    try {
      await import(/* @vite-ignore */ href);
    } catch (e) {
      console.warn('[art] 스캔 실패 — 매니페스트는 그대로 둔다', e);
    } finally {
      running = false;
    }
  };
  return {
    name: 'undying-art-watcher',
    apply: 'serve',
    configureServer(server) {
      const dir = 'public/assets/packs/final';
      server.watcher.add(dir);
      let stamp = 0;
      const onChange = (file: string): void => {
        if (!file.split('\\').join('/').includes('assets/packs/final/')) return;
        stamp += 1;
        void rescan(server.config.root, stamp).then(() => server.ws.send({ type: 'full-reload' }));
      };
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
      server.watcher.on('change', onChange);
    },
  };
}

export default defineConfig({
  plugins: [artWatcher()],
  // 상대경로 배포 (GitHub Pages / itch.io zip 양쪽 대응) — 01-ARCHITECTURE §1, M12
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'build', // 번들 산출물과 public/assets/ 게임 에셋 트리를 분리
    assetsInlineLimit: 0, // 픽셀 에셋을 base64 로 말아넣지 않는다
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    // 01-ARCHITECTURE §8 — 테스트 대상은 core 뿐이다
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
