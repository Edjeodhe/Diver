# 아키텍처 & Unity 이식 가이드

웹 프로토타입(Vite + TypeScript + Canvas 2D)은 **Unity로 1:1 옮기기 쉬운 구조**를 목표로 짰다.
렌더링과 브라우저 의존 코드를 로직과 분리했기 때문에, `data/`, `model/`, 엔티티 로직은 거의 그대로 C#으로 번역할 수 있다.

## 폴더 구조

```
src/
├─ data/           정적 데이터 (JSON = 단일 진실 공급원) + 타입 + Database
│  ├─ fish.json, items.json, weapons.json, upgrades.json
│  ├─ zones.json, modifiers.json, balance.json
│  └─ sprites.json  스프라이트 목록 + Codex CLI 생성 프롬프트
├─ core/           게임 루프, 씬 전환, 입력, 난수/노이즈, 세이브
├─ model/          순수 로직 (DOM/Canvas 의존 없음): 진행 상태, 스탯, 다이브 세션
├─ world/          절차 생성 지형
├─ entities/       Diver, Fish(AI), Pickup/ResourceNode/Crate, Particles
├─ systems/        WeaponSystem (무기·탄약·발사체·타격 판정)
├─ render/         Camera, Sprites(그리기), WorldRenderer(배경/지형/조명), SpriteAtlas
├─ ui/             Hud (캔버스 HUD)
└─ scenes/         DiveScene(인게임), BoatScene(배 위 정비)
public/assets/sprites/   Codex CLI로 생성한 PNG (없으면 벡터 드로잉으로 대체)
```

## 의존 방향

```
scenes ──▶ systems ──▶ entities ──▶ world ──▶ core
   │          │           │
   ├──▶ render (그리기 전용, 로직 참조만)
   ├──▶ ui
   └──▶ model ──▶ data
```
- `model/`과 `data/`는 아무것도 그리지 않는다. Unity에서는 그대로 **plain C# 클래스**로 옮기고 EditMode 테스트를 붙인다.
- `render/`는 상태를 읽기만 한다. Unity에서는 SpriteRenderer, Animator, Light2D가 이 역할을 맡는다.

## Unity 매핑

| 웹 (현재) | Unity |
|---|---|
| `data/*.json` | `Assets/Data/*.json`을 그대로 복사한 뒤, 에디터 임포터로 **ScriptableObject**(FishDef, WeaponDef …)를 생성. 기획 수정은 계속 JSON에서 |
| `Database` | `GameDatabase : ScriptableObject` (id → def 딕셔너리), Addressables로 로드 |
| `Game` (루프, 씬 레지스트리) | `GameManager` (DontDestroyOnLoad) + `SceneManager.LoadScene("Dive")` |
| `Game.lastDiveResult` | GameManager의 필드 또는 정적 `SceneBridge` |
| `Scene` 인터페이스 / `DiveScene`, `BoatScene` | `Dive.unity`, `Boat.unity` + 씬 루트 컨트롤러 MonoBehaviour |
| `Input` | **Input System** Action Map (Move, Boost, Fire, Aim, SwitchWeapon, Interact, Pause) |
| `Rng`(mulberry32), `Noise1D` | `System.Random(seed)` 래퍼 + 동일 알고리즘 포팅 (시드 재현성 유지) |
| `Terrain` (벽/해저 함수) | 같은 함수로 포인트를 샘플링해 **EdgeCollider2D**와 **SpriteShape** 생성 |
| `Diver` | `DiverController` + Rigidbody2D(중력 0, Linear Drag) + CircleCollider2D |
| `Fish` 상태 머신 | `FishController` + 행동별 전략 클래스(`WanderBehaviour`, `ChargeBehaviour` …) |
| `WeaponSystem` / `Projectile` | `WeaponController` + `WeaponDef` SO, 발사체는 ObjectPool, 판정은 `Physics2D.CircleCast` |
| `Pickup` 자석 이동 | `PickupMagnet` 컴포넌트 (트리거 + 속도 조향) |
| `Particles` | ParticleSystem (거품, 피격, 먼지) |
| `Camera` 추적·흔들림 | **Cinemachine** 2D Virtual Camera + Impulse Source |
| `WorldRenderer.drawLighting` (어둠 + 구멍) | **URP 2D Renderer**: Global Light 강도를 수심으로 조절 + 잠수부/발광 생물에 Point Light2D |
| `drawBackground` (수심 그라디언트) | 카메라 고정 배경 스프라이트 + 수심 → 색 Gradient 커브 |
| `Hud` (캔버스) | UI Toolkit 또는 uGUI (Screen Space Overlay) |
| `BoatScene` DOM 패널 | UI Toolkit (UXML/USS) |
| `SaveSystem` (localStorage) | `Application.persistentDataPath/save.json` (JsonUtility/Newtonsoft). 스키마는 `GameState`와 동일 |
| `SpriteAtlas` + 절차 드로잉 대체 | Sprite Atlas + Addressables. 누락 에셋은 placeholder 스프라이트 |

## 이식 시 지켜야 할 규칙 (지금부터)
1. **수치는 JSON에만** 둔다. 코드에 밸런스 상수를 하드코딩하지 않는다. 연출용 상수는 예외.
2. **로직은 `update(dt)`로만** 진행한다. `dt`는 1/20초로 클램프되므로, Unity의 `Update`/`FixedUpdate`로 바로 옮길 수 있다.
3. 게임플레이에 영향을 주는 난수는 **반드시 `Rng`**를 쓴다. `Math.random`은 연출(파티클, 흔들림)에만 허용한다. 그래야 시드 재현과 리플레이 디버깅이 가능하다.
4. 엔티티 간 상호작용은 콜백 인터페이스(`FishContext`, `CombatHost`)로 주입한다. Unity에서는 C# event나 인터페이스로 옮긴다.
5. 좌표계: +y가 아래(수심 증가)이고 1m = 16px(`balance.pxPerMeter`)다. Unity에서는 **1 unit = 1m**로 바꾸고 y를 반전한다.

## 데이터 흐름 (다이브 1회)

```
BoatScene ── game.loadScene('dive') ──▶ DiveScene 생성
  computeStats(state)                   ← 업그레이드 레벨 → 스탯
  Rng(seed) → modifier, Terrain, populate()
  매 프레임: Diver → 산소 → WeaponSystem → Fish AI → Pickup → 상호작용 → 카메라
  종료: DiveSession.toResult() → applyDiveResult(state) → save() → loadScene('boat')
```

## 실행
```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # dist/ 정적 배포
```
디버그: 브라우저 콘솔에서 `game.state`, `game.scene`에 접근할 수 있다(예: `game.state.money = 99999`).
