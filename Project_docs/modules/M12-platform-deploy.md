# M12 · 플랫폼 레이어 (Hive 대비) & 배포

| 항목 | 값 |
|---|---|
| 우선순위 | **P1 — 단, 배포 부분은 D0에 미리 해둔다** |
| 담당 | Claude Code 단독 |
| 의존 | M01 |
| 예상 소요 | 2시간 |
| 담당 파일 | `src/platform/*` `.github/workflows/deploy.yml` `vite.config.ts` |

---

## 1. 왜 이 모듈이 있는가

대회 심사 기준에 **「출시 잠재력 — Hive를 통해 서비스를 확장할 수 있는가」** 가 있다.
실제 Hive SDK를 붙이는 건 6일 안에 불가능하고 필요하지도 않다.
대신 **붙일 자리를 명확히 만들어두고, 문서로 보여준다.** 이게 점수를 받는 현실적인 방법이다.

---

## 2. 추상화 인터페이스

```ts
// src/platform/IPlatform.ts
export interface IPlatform {
  readonly id: 'local' | 'hive';
  init(): Promise<void>;

  /** 계정 — Hive 로그인으로 대체 가능 */
  getPlayerId(): string;

  /** 세이브 — Hive 클라우드 세이브로 대체 가능 */
  save(key: string, data: string): Promise<void>;
  load(key: string): Promise<string | null>;

  /** 랭킹 — 최고 도달 층 리더보드. Hive Leaderboard로 대체 가능 */
  submitScore(board: 'deepest_floor', value: number): Promise<void>;
  getLeaderboard(board: 'deepest_floor', limit: number): Promise<LeaderEntry[]>;

  /** 분석 — Hive Analytics로 대체 가능 */
  track(event: string, params?: Record<string, string | number>): void;

  /** 과금 자리 (데모에서는 미사용) */
  purchase?(sku: string): Promise<boolean>;
}
```

## 3. LocalPlatform (데모 구현)

| 메서드 | 데모 구현 |
|---|---|
| `getPlayerId` | localStorage에 uuid 생성/보관 |
| `save/load` | localStorage |
| `submitScore` | 로컬 최고 기록만 갱신 |
| `getLeaderboard` | **하드코딩된 가짜 랭킹 + 내 기록 삽입** |
| `track` | `console.debug` (프로덕션에서는 no-op) |

### 가짜 랭킹이 서사 장치가 된다
```
   역대 최고 도달 기록
   1.  세라        29F     ← 원본 기획서의 그 기록
   2.  당신        28F
   3.  미르        24F
   ...
```
> `역대 최고 도달: 29F — 세라`. 유일하게 영원히 남는 것.

**그리고 세라는 지금 당신 로스터에 있다.** (2대 리온이 17F에서 죽었으므로 이름이 계보에 있다)
플레이어가 이걸 눈치채면 세계가 한 겹 더 열린다. 설명하지 않는다.

## 4. 교체 방법 (문서에 명시 → 심사 자료)

```ts
// src/platform/index.ts
export const platform: IPlatform =
  import.meta.env.VITE_PLATFORM === 'hive'
    ? new HivePlatform()      // 미구현 — 인터페이스만 존재
    : new LocalPlatform();
```

`Project_Project_docs/06-SUBMISSION.md`의 "출시 로드맵" 섹션에 이 구조를 그림으로 넣는다.

---

## 5. 배포 — D0에 미리 끝내라

**첫날에 빈 게임이라도 배포 URL을 만들어둔다.** 마감 당일에 배포를 처음 시도하는 것이 가장 흔한 실패다.

### 옵션 A · GitHub Pages (추천)
```yaml
# .github/workflows/deploy.yml
name: deploy
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: github-pages
    steps: [{ uses: actions/deploy-pages@v4 }]
```
`vite.config.ts`에 `base: './'` **필수.**

### 옵션 B · Vercel
`vercel --prod` 한 줄. 커스텀 도메인이 예쁘게 나온다. 심사 링크로는 이쪽이 조금 낫다.

### 배포 체크
- [ ] 시크릿 창에서 URL을 열어 **로그인·설치 없이** 바로 플레이됨
- [ ] 모바일 사파리/크롬에서 최소한 화면이 뜨고 "가로로 돌려주세요"가 표시됨
- [ ] 첫 로드 3초 이내 (번들 gzip 1.5MB 이하)
- [ ] `?seed=1234` 로 결정적 시연 가능
- [ ] 404 시 index로 폴백 (SPA 설정)

## 수용 기준
- [ ] `src/` 전체에서 `localStorage`를 직접 호출하는 곳이 `LocalPlatform.ts` 한 곳뿐
- [ ] `VITE_PLATFORM=hive`로 빌드해도 컴파일은 통과한다 (스텁)
- [ ] 배포 URL이 D0에 존재하고 이후 push마다 자동 갱신
