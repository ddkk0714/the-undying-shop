# 03 · 에셋 모듈 시스템 (갈아끼우기 쉬운 구조)

> 목표: **아트가 없어도 게임이 완성되고, 아트가 도착하면 JSON 한 파일만 바꿔서 전체가 바뀐다.**
> 6일 일정에서 코드와 아트를 병렬로 진행하기 위한 가장 중요한 장치다.

---

## 1. 원칙 3줄

1. 코드는 **파일 경로를 모른다.** 논리 키(`star.portrait.rion`)만 안다.
2. 키 → 파일 매핑은 `content/manifest.json` 한 곳에만 있다.
3. 매핑 묶음을 **팩(pack)** 단위로 통째로 교체할 수 있다.

---

## 2. 매니페스트 구조

```jsonc
// content/manifest.json
{
  "activePack": "placeholder",     // ← 이 한 줄만 바꾸면 전체 아트가 교체된다
  "packs": {
    "placeholder": {
      "root": "assets/packs/placeholder/",
      "entries": {
        "ui.panel.9s":        { "type": "nineslice", "file": "ui/panel.png", "slice": [4,4,4,4] },
        "ui.button.9s":       { "type": "nineslice", "file": "ui/button.png", "slice": [3,3,3,3] },
        "ui.seal":            { "type": "spritesheet", "file": "ui/seal.png", "frameWidth": 48, "frameHeight": 48 },
        "bg.shop":            { "type": "image", "file": "bg/shop.png" },
        "bg.revive":          { "type": "image", "file": "bg/revive.png" },
        "bg.tower":           { "type": "image", "file": "bg/tower.png" },
        "bg.autopsy":         { "type": "image", "file": "bg/autopsy.png" },
        "bg.studio":          { "type": "image", "file": "bg/studio.png" },
        "star.portrait.karin":{ "type": "image", "file": "star/karin.png" },
        "star.silhouette":    { "type": "spritesheet", "file": "star/silhouette.png", "frameWidth": 96, "frameHeight": 120 },
        "sfx.stamp":          { "type": "audio", "file": "sfx/stamp.ogg" },
        "sfx.superchat":      { "type": "audio", "file": "sfx/superchat.ogg" }
      }
    },
    "final": {
      "root": "assets/packs/final/",
      "inherit": "placeholder",      // ← 정의 안 된 키는 placeholder에서 가져온다
      "entries": {
        "bg.shop": { "type": "image", "file": "bg/shop.png" }
      }
    }
  }
}
```

### `inherit`가 핵심이다
최종 아트를 **하나씩 도착하는 대로** 넣을 수 있다. `final` 팩에 정의된 것만 새 그림, 나머지는 자동으로 더미. 아트 진행률이 30%여도 게임은 100% 돌아간다.

---

## 3. 코드 인터페이스

```ts
// src/render/assets.ts
export type AssetKey = string;

/** Phaser loader에 팩 전체를 등록 (PreloadScene에서 1회) */
export function queuePack(loader: Phaser.Loader.LoaderPlugin): void;

/** 논리 키 → Phaser 텍스처 키. 없으면 개발빌드에서 경고 + 자홍색 더미 반환 */
export function key(k: AssetKey): string;

/** nineslice 슬라이스 값 조회 */
export function slice(k: AssetKey): [number, number, number, number];
```

사용:
```ts
// ❌ 금지
this.add.image(0, 0, 'assets/packs/final/bg/shop.png');

// ✅ 필수
this.add.image(0, 0, Assets.key('bg.shop'));
```

### 미싱 에셋 정책
- 개발 빌드: **자홍색(#FF00FF) 체크무늬 더미** + 콘솔 경고 `[assets] missing: bg.foo`
- 프로덕션 빌드: `soot` 색 빈 사각형 (조용히)
- **절대 throw 하지 않는다.** 아트 하나 빠졌다고 심사 중 게임이 죽으면 안 된다.

---

## 4. 플레이스홀더 팩 생성 (D0에 30분 안에)

Node 스크립트 `tools/gen-placeholder.mjs`로 자동 생성한다. 손으로 그리지 않는다.

| 키 패턴 | 더미 형태 |
|---|---|
| `bg.*` | 480×244 단색 `clay` + 좌상단에 키 이름 텍스트 |
| `ui.*.9s` | `ash` 채움 + `line` 1px 테두리 9-slice |
| `star.portrait.*` | 96×120 `dust` 실루엣 + 이니셜 |
| `sfx.*` | 0.2초 무음 ogg |

**중요**: 플레이스홀더도 **팔레트 9색만** 쓴다. 그래야 아트 교체 시 레이아웃 충격이 없다.

---

## 5. 콘텐츠 데이터도 같은 원리로 모듈화

에셋뿐 아니라 **밸런스·대사도 갈아끼울 수 있어야 한다.**

```
content/
  balance.json       ← M10이 소유. 여기 숫자만 고치면 난이도가 바뀐다
  chat.ko.json       ← 채팅 코퍼스. 톤별 배열
  radio.ko.json
  narrative.ko.json
```

### 로케일 확장 지점 (Hive 글로벌 출시 대비 — 심사 항목)
파일명 규칙 `*.{locale}.json`. `content.ts`가 `locale` 파라미터로 선택.
데모는 `ko`만 채우되 **구조만 열어둔다.** `Project_Project_docs/modules/M12-platform-deploy.md`의 Hive 섹션과 연결되는 근거가 된다.

---

## 6. 사운드 모듈

```jsonc
"sfx.stamp":     { "type": "audio", "file": "sfx/stamp.ogg" },
"bgm.day":       { "type": "audio", "file": "bgm/day.ogg", "loop": true }
```

- 전부 옵셔널. 파일 없으면 무음으로 진행 (`Sfx.play()`가 조용히 리턴)
- **P2 항목**이지만 매니페스트 자리는 D1에 미리 만든다. 나중에 파일만 떨구면 소리가 난다.

---

## 7. 체크리스트

- [ ] `content/manifest.json` 존재, `activePack: "placeholder"`
- [ ] `tools/gen-placeholder.mjs` 실행 시 모든 키에 대응하는 더미 파일 생성
- [ ] `Assets.key()` 외의 경로 참조가 `src/` 전체에 0건 (`grep -r "assets/" src/`로 확인)
- [ ] `activePack`을 `final`로 바꿔도 크래시 없음 (inherit 폴백 동작)
- [ ] 미싱 키 1개를 일부러 만들어도 게임이 끝까지 플레이됨
