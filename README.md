# 숨비 (SUMBI) — 해양 다이빙 어드벤처 웹 프로토타입

제주 해녀에서 영감을 받은 2D 로그라이트 다이빙 어드벤처입니다. 웹 프로토타입으로 먼저 코어 루프를 검증하고, 이후 Unity로 이식합니다.

```bash
npm install
npm run dev
```
→ http://localhost:5173

| 문서 | 내용 |
|---|---|
| [docs/GDD.md](docs/GDD.md) | 게임 기획서 (코어 루프, 수심 구간, 생물 AI, 무기, 성장, 아트 방향, 로드맵) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 코드 구조와 Unity 이식 매핑 |
| [docs/OUTGAME_PROPOSAL.md](docs/OUTGAME_PROPOSAL.md) | 아웃게임(경영) 콘텐츠 제안 — **검토 필요** |

**조작**: WASD 이동 · Shift 가속 · 마우스 조준/클릭 공격 · 1/2/Q/휠 무기 전환 · E 채집/상자/산소 스테이션/귀환(수심 5m 이내·워프) · Esc 일시정지

**게임 데이터**: 모든 수치는 `src/data/*.json`에 있습니다. 코드를 고치지 않고 생물, 무기, 강화, 수심 구간, "오늘의 바다" 변수를 조정할 수 있습니다.

**스프라이트**: `src/data/sprites.json`의 프롬프트로 Codex CLI에서 생성해 `public/assets/sprites/`에 둡니다. 이미지가 없는 항목은 벡터 드로잉으로 대체됩니다.
