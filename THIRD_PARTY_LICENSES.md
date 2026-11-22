# 오픈소스 출처 · 라이선스

모든 라이브러리와 에셋은 저장소 안(`assets/`)에 들어 있습니다. 실행 중 외부 CDN·외부 링크를 호출하지 않으므로 **오프라인에서도 동작**합니다.
(`index.html`의 importmap이 `assets/vendor/…` 로컬 파일을 가리킵니다.)

## 코드 라이브러리

| 라이브러리 | 버전 | 용도 | 라이선스 | 출처 | 로컬 위치 |
|---|---|---|---|---|---|
| three.js | 0.160.0 | 렌더러 코어 | MIT | https://github.com/mrdoob/three.js | `assets/vendor/three/build/three.module.js` |
| three/examples/jsm | 0.160.0 | `GLTFLoader`, `SkeletonUtils`, `BufferGeometryUtils`, `Sky`, 후처리(`EffectComposer`·`RenderPass`·`UnrealBloomPass`·`OutputPass` 및 의존 셰이더) | MIT | 위와 동일 (`examples/jsm`) | `assets/vendor/three/examples/jsm/` |
| simplex-noise | 4.0.3 | 지형 색 얼룩·절벽·하부 암반 노이즈 | MIT | https://github.com/jwagner/simplex-noise.js | `assets/vendor/simplex-noise/simplex-noise.js` |
| @pixiv/three-vrm | 2.1.0 | `.vrm` 주인공 로더 · SpringBone 물리 · 표정(눈 깜빡임) · 정규화 휴머노이드 뼈대 | MIT | https://github.com/pixiv/three-vrm | `assets/vendor/three-vrm/three-vrm.module.min.js` |
| Lucide | (기존 포함본) | HUD·메뉴 아이콘 | ISC (일부 Feather 유래 아이콘은 MIT) | https://github.com/lucide-icons/lucide | `assets/vendor/lucide.min.js` |

각 라이선스 전문: `assets/vendor/three/LICENSE.txt`, `assets/vendor/simplex-noise/LICENSE.txt`, `assets/vendor/three-vrm/LICENSE.txt`, `assets/vendor/LUCIDE_LICENSE.txt`

npm 레지스트리 공식 배포본(tarball)에서 필요한 파일만 꺼내 수정 없이 넣었습니다 (소스맵 주석 한 줄만 제거).
Vite로 실행할 때를 위해 같은 버전을 `package.json` 의 dependencies 에도 적어 두었습니다.

## 3D 모델 (모두 CC0 1.0 — 저작자 표시 의무 없음)

| 제작자 | 팩 | 사용처 |
|---|---|---|
| Quaternius | Ultimate Monsters · Ultimate Animated Animals · Cute Animated Monsters · Ultimate Modular Women | 몬스터 9종, CC0 주인공(비교용), 정령사·상인 NPC |
| Kay Lousberg (KayKit) | Adventurers · Skeletons · Halloween Bits 외 | 소환수 4종, 대장장이 NPC, 스켈레톤 기사, 나무·가구 일부 |
| Kenney | Fantasy Town Kit 외 | 나무·바위·기둥·울타리·가로등 등 소품 |
| Isa Lousberg | Pretty Park · Homely House | 공원 나무·덤불, 오두막 |

파일별 원본 URL·작가: `assets/models/CREDITS.json` (게임 내 가방 → 설정 하단에도 표시)

## 주인공 VRM 모델

| 파일 | 원본 | 저작권 | 라이선스 |
|---|---|---|---|
| `assets/models/hero.vrm` | pixiv 공식 샘플 `VRM1_Constraint_Twist_Sample.vrm` (https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm/examples/models) | (c) 2022 pixiv Inc. | VRM Public License 1.0 (https://vrm.dev/licenses/1.0/) — 재배포·수정·상업 이용 허용, 크레딧 표기 불필요 (모델 메타데이터 기준) |

## 직접 제작한 부분

게임 로직, 셰이더(검기 아크·빛기둥·물·하늘·파티클·잔상), Canvas 절차 텍스처, UI/CSS 는 이 프로젝트에서 작성한 코드입니다.
`models/eco-hero-girl.glb` 는 프로젝트 소유자가 제공한 주인공 모델입니다.
