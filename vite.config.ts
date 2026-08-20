import { defineConfig } from 'vitest/config';

export default defineConfig({
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
