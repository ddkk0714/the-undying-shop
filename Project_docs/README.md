# 문서 안내

| 파일 | 내용 | 누가 읽나 |
|---|---|---|
| `00-OVERVIEW.md` | **메인 기획서.** 최우선 진실 원천 | 전원 |
| `01-ARCHITECTURE.md` | 기술 스택, 폴더 구조, 코어/렌더 분리 | 개발 |
| `02-DATA-SCHEMA.md` | 전체 타입 정의 (`src/core/types.ts`의 원본) | 개발 |
| `03-ASSET-MODULES.md` | 에셋 갈아끼우기 시스템 | 개발 + 아트 |
| `04-UI-KIT.md` | 레이아웃 상수, UI 컴포넌트, 연출 프리셋 | 개발 + 아트 |
| `05-PRIORITY.md` | **P0~P3 우선순위 + 6일 일별 계획** | 전원 (매일) |
| `06-SUBMISSION.md` | 제출물 체크리스트, 데모 영상 시나리오 | 전원 (D6) |
| `07-PARALLEL-DEV.md` | **Claude Code × Codex 병렬 개발 규약 · 파일 소유권** | 전원 (매일) |
| `08-AGENT-COMMANDS.md` | **에이전트에게 던질 명령 대본 (복붙용)** | 전원 (매일 아침) |
| `HANDOFF.md` | 에이전트 간 인계 요청 대장 | 전원 (동기화 때) |
| `CODEX_LOG.md` | Codex 활용 기록 (가산점 제출물) | 전원 (매일) |
| `lore/WORLD.md` | 세계관 확정본 v2 (원문 보존) | 전원 |
| `modules/M01~M12` | 모듈별 개발 계획서 | 개발 |

## 읽는 순서 (처음 합류하는 사람)
`00-OVERVIEW` → `05-PRIORITY` → **`07-PARALLEL-DEV`** → **`08-AGENT-COMMANDS`** → `01-ARCHITECTURE` → 담당 모듈 문서

## 개발 에이전트용
- Codex → 레포 루트 `AGENTS.md` (+ `Project_Project_docs/07-PARALLEL-DEV.md` 필수)
- Claude Code → 레포 루트 `CLAUDE.md` (+ `Project_Project_docs/07-PARALLEL-DEV.md` 필수)

**두 에이전트를 동시에 돌리기 전에 `07-PARALLEL-DEV.md`를 반드시 읽혀라.** 소유권 표를 모르면 충돌한다.
