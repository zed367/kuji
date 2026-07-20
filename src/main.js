import './style.css'
import { animate, stagger } from 'motion'
import { KujiBox, Prize } from './kujiEngine.js'

// 갤럭시 탭 S6 Lite 가로 기준 (10.4형, 2000×1200 = 5:3, 논리 해상도 약 1200×720)
// 상단 배너를 추가한 만큼 매대는 3줄로 줄임 (줄당 5개 = 15개, 스크롤 없음)
const STAND_COLS = 5
const STAND_ROWS = 3

// 카드팩 실제 이미지 비율(가로/세로) - public/packs/ 이미지들의 크롭 크기 기준
// (매대/개봉 크기 계산에 쓰이므로, 새 이미지를 추가할 때도 이 비율에 맞춰 크롭할 것)
const PACK_ASPECT = 386 / 751

// 매대에 올라갈 카드팩 이미지 목록 - 파일을 public/packs/ 에 추가하고 여기 경로만
// 추가하면 매대에 무작위로 섞여서 진열된다 (개봉 스테이지도 선택된 팩의 이미지를 그대로 이어받음)
const PACK_IMAGES = [
  '/packs/pack-2.webp',
  '/packs/pack-3.webp',
  '/packs/pack-4.webp',
  '/packs/pack-5.webp',
  '/packs/pack-6.webp',
]

// 절취선을 이 비율 이상 슬라이스하면 개봉으로 인정
const SLICE_OPEN_THRESHOLD = 0.9

// card_action2(스택 스와이프)에서 카드를 이 거리(px) 이상 위로 밀면 넘긴 것으로 인정
const SWIPE_DISMISS_DY = 70

const PACK_GAP = 14

function createBox() {
  return new KujiBox({
    title: '3천원 쿠지',
    prizes: [
      new Prize({ grade: '1등', name: '한정 대형 피규어', total: 1, glow: '#ffd23f' }),
      new Prize({ grade: '2등', name: '아크릴 스탠드', total: 9, glow: '#b565f5' }),
      new Prize({ grade: '3등', name: '포토카드 세트', total: 40, glow: '#4d9bff' }),
      new Prize({ grade: '4등', name: '랜덤 뱃지', total: 150, glow: '#4ade80' }),
    ],
    lastOnePrize: new Prize({ grade: 'LAST', name: '라스트원 특전 색지', total: 1, glow: '#ffffff' }),
  })
}

let box = createBox()
let selectedCount = 1
let nextPackId = 0
let pendingPackId = null
let standPacks = createNewPacks()

function createNewPacks() {
  return Array.from({ length: STAND_COLS * STAND_ROWS }, () => ({
    id: nextPackId++,
    img: PACK_IMAGES[Math.floor(Math.random() * PACK_IMAGES.length)],
    state: 'available',
  }))
}

function shufflePacks(packs) {
  const shuffled = [...packs]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

const app = document.querySelector('#app')

app.innerHTML = `
  <div class="main-col">
    <header class="command-header">
      <div class="wordmark">
        <span class="wordmark-dot"></span>
        <span>LUCKY DRAW</span>
      </div>
      <div class="session-state"><span></span> LIVE COLLECTION</div>
    </header>

    <div class="top-banner">
      <img src="/banner.webp" alt="이벤트 배너" />
      <div class="banner-shade"></div>
      <div class="banner-copy">
        <span>LIMITED SIGNAL</span>
        <strong>오늘의 행운을<br />포착하세요.</strong>
      </div>
      <div class="banner-orbit" aria-hidden="true"></div>
    </div>

    <div class="stand-wrap">
      <div class="stand-header">
        <div>
          <span class="section-kicker">SELECT A SIGNAL</span>
          <h2>원하는 팩을 골라보세요</h2>
        </div>
        <button class="reload-btn" id="reload-btn"><span>↻</span> PACK SHUFFLE</button>
      </div>
      <div class="stand-outer">
        <div class="grid-label grid-label-left">SECTOR 07</div>
        <div class="grid-label grid-label-right">15 SIGNALS</div>
        <div class="stand-floor" id="stand"></div>
      </div>
    </div>
  </div>

  <div class="side-col">
    <div class="draw-status">
      <div class="status-ring"><span>◎</span></div>
      <div>
        <span class="section-kicker">DRAW MODE</span>
        <strong>LUCKY<br />DRAW</strong>
      </div>
      <div class="status-code">NO.<br />2407</div>
    </div>

    <div class="tabs" id="tabs">
      <div class="tab active" data-n="1"><small>01</small>1회</div>
      <div class="tab" data-n="5"><small>05</small>5회</div>
      <div class="tab" data-n="10"><small>10</small>10회</div>
    </div>

    <p class="hint"><span>+</span> 팩을 탭하면 드로우 시퀀스가 시작됩니다</p>

    <div class="info-panel">
      <div class="panel-heading">
        <h2>PRIZE SIGNAL</h2>
        <span>LIVE ODDS</span>
      </div>
      <div id="info-rows"></div>
    </div>

    <p class="side-foot">MAKE A WISH, THEN DRAW.</p>
  </div>
`

const standOuterEl = document.querySelector('.stand-outer')
const standEl = document.querySelector('#stand')
const tabsEl = document.querySelector('#tabs')
const reloadBtn = document.querySelector('#reload-btn')
const infoRows = document.querySelector('#info-rows')

standEl.style.setProperty('--stand-cols', String(STAND_COLS))

// stand-outer가 실제로 화면에서 차지하는 크기(뷰포트/기기에 따라 달라짐)를 측정해서,
// 매대 전체가 스크롤 없이 딱 맞도록 카드팩 한 장의 너비(--pack-w)를 역산한다.
// (계단식 원근감 없이 평평하게 나열되므로 단 간 겹침/스케일 보정이 필요 없음)
function fitStandSize() {
  const style = getComputedStyle(standOuterEl)
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const availW = standOuterEl.clientWidth - padX
  const availH = standOuterEl.clientHeight - padY

  const packWidthByWidth = (availW - PACK_GAP * (STAND_COLS - 1)) / STAND_COLS
  const packHeightByHeight = (availH - PACK_GAP * (STAND_ROWS - 1)) / STAND_ROWS
  const packWidthByHeight = packHeightByHeight * PACK_ASPECT

  const packWidth = Math.max(40, Math.min(packWidthByWidth, packWidthByHeight))
  standEl.style.setProperty('--pack-w', `${packWidth}px`)
}

function renderStand({ animateIn = false } = {}) {
  standEl.innerHTML = ''
  for (let r = 0; r < STAND_ROWS; r += 1) {
    const row = document.createElement('div')
    row.className = 'shelf-row'
    for (let c = 0; c < STAND_COLS; c += 1) {
      const packData = standPacks[r * STAND_COLS + c]
      const pack = document.createElement('div')
      pack.className = `pack${packData.state !== 'available' ? ' is-dimmed' : ''}${packData.state === 'pending' ? ' is-pending' : ''}`
      pack.dataset.packId = String(packData.id)
      pack.dataset.img = packData.img
      pack.style.setProperty('--pack-img', `url('${packData.img}')`)
      row.appendChild(pack)
    }
    standEl.appendChild(row)
  }
  if (animateIn) {
    const availablePacks = Array.from(standEl.querySelectorAll('.pack:not(.is-dimmed)'))
    const dimmedPacks = Array.from(standEl.querySelectorAll('.pack.is-dimmed'))
    if (availablePacks.length) {
      animate(availablePacks, { opacity: [0, 1], y: [10, 0] }, { duration: 0.35, delay: stagger(0.015) })
    }
    if (dimmedPacks.length) {
      animate(dimmedPacks, { opacity: [0, 0.3], y: [10, 0] }, { duration: 0.35, delay: stagger(0.015) })
    }
  }
}

function updateReloadButton() {
  const allPacksDimmed = standPacks.every((pack) => pack.state === 'dimmed')
  reloadBtn.innerHTML = allPacksDimmed
    ? '<span>+</span> NEW PACKS'
    : '<span>↻</span> PACK SHUFFLE'
}

function findStandPack(packId) {
  return standPacks.find((pack) => pack.id === packId)
}

window.addEventListener('resize', () => {
  fitStandSize()
})

function renderInfo() {
  const rows = box.status()
  infoRows.innerHTML = rows
    .map(
      (r) => `
      <div class="info-row">
        <div class="info-grade" style="color:${r.glow}">
          <span class="dot" style="background:${r.glow}"></span>${r.grade}
        </div>
        <div class="info-name">${r.name}</div>
        <div class="info-stock">남은 ${r.remaining}/${r.total}</div>
        <div class="info-prob">${r.probability}%</div>
      </div>`
    )
    .join('')
}

tabsEl.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab')
  if (!tab) return
  tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
  tab.classList.add('active')
  selectedCount = Number(tab.dataset.n)
})

// 선택한 팩은 딤 상태를 유지한다. 전부 소진된 경우에만 새 팩으로 전체 보충하고,
// 그 전에는 팩 객체를 섞어 딤 수를 유지한 채 위치만 바꾼다.
reloadBtn.addEventListener('click', () => {
  if (pendingPackId !== null) return
  const allPacksDimmed = standPacks.every((pack) => pack.state === 'dimmed')
  standPacks = allPacksDimmed ? createNewPacks() : shufflePacks(standPacks)
  fitStandSize()
  renderStand({ animateIn: true })
  updateReloadButton()
})

standEl.addEventListener('click', (e) => {
  const pack = e.target.closest('.pack')
  if (!pack) return
  selectPack(pack)
})

async function selectPack(packEl) {
  const packId = Number(packEl.dataset.packId)
  const packData = findStandPack(packId)
  if (box.isEmpty || pendingPackId !== null || !packData || packData.state !== 'available') return

  // 팩을 누른 즉시 예약 처리한다. 개봉 전 취소하면 되돌리지만, 절취선을 끝까지 열면
  // 매대에 딤 상태로 남아 같은 팩을 다시 고를 수 없게 된다.
  pendingPackId = packId
  packData.state = 'pending'
  packEl.classList.add('is-dimmed', 'is-pending')

  // 카드팩 선택 시, 확대되어 매대 앞으로 나오는 연출 (선택 피드백)
  await animate(packEl, { scale: [1, 1.3], y: [0, -12] }, { duration: 0.22, easing: 'ease-out' }).finished
  animate(packEl, { scale: 1, y: 0 }, { duration: 0.18 })

  openUnboxStage(selectedCount, packEl.dataset.img, {
    onCancel: () => {
      const selectedPack = findStandPack(packId)
      if (!selectedPack || selectedPack.state !== 'pending') return
      selectedPack.state = 'available'
      pendingPackId = null
      renderStand()
      updateReloadButton()
    },
    onOpened: () => {
      const selectedPack = findStandPack(packId)
      if (!selectedPack || selectedPack.state !== 'pending') return
      selectedPack.state = 'dimmed'
      pendingPackId = null
      updateReloadButton()
    },
  })
}

function openUnboxStage(count, packImg, callbacks) {
  const overlay = document.createElement('div')
  overlay.className = 'overlay unbox-overlay'
  overlay.innerHTML = `
    <button class="cancel-unbox-btn" id="cancel-unbox-btn">← 선택 취소</button>
    <button class="reveal-all-btn" id="reveal-all-btn" style="display:none">전체 공개</button>
    <div class="overlay-title">절취선을 옆으로 밀어서 카드팩을 뜯어보세요</div>
    <div class="unbox-pack" id="unbox-pack" style="--pack-img: url('${packImg}')">
      <div class="unbox-pack-top" id="unbox-pack-top"></div>
      <div class="perf-track" id="perf-track">
        <div class="perf-line"></div>
        <div class="slice-handle" id="slice-handle" aria-label="빛나는 절취선을 오른쪽으로 밀어 개봉"></div>
      </div>
      <div class="unbox-pack-bottom"></div>
    </div>
    <div class="reveal-tray" id="reveal-tray"></div>
    <div class="overlay-actions" id="overlay-actions" style="display:none">
      <button class="btn-close" id="close-btn">닫기</button>
    </div>
    <div class="result-summary" id="result-summary"></div>
  `
  document.body.appendChild(overlay)
  setupSlice(overlay, count, callbacks)
}

function setupSlice(overlay, count, { onCancel, onOpened } = {}) {
  const track = overlay.querySelector('#perf-track')
  const title = overlay.querySelector('.overlay-title')
  const cancelBtn = overlay.querySelector('#cancel-unbox-btn')
  let dragging = false
  let opened = false

  function setProgress(p) {
    const clamped = Math.max(0, Math.min(1, p))
    track.style.setProperty('--progress', clamped)
  }

  function onPointerDown(e) {
    if (opened) return
    dragging = true
    track.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!dragging || opened) return
    const rect = track.getBoundingClientRect()
    const p = (e.clientX - rect.left) / rect.width
    setProgress(p)
    if (p >= SLICE_OPEN_THRESHOLD) {
      dragging = false
      opened = true
      setProgress(1)
      openPack()
    }
  }

  function onPointerUp() {
    if (opened || !dragging) return
    dragging = false
    setProgress(0) // 임계값 전에 놓으면 절취선이 원래대로 되돌아감
  }

  track.addEventListener('pointerdown', onPointerDown)
  track.addEventListener('pointermove', onPointerMove)
  track.addEventListener('pointerup', onPointerUp)
  track.addEventListener('pointercancel', onPointerUp)

  cancelBtn.addEventListener('click', () => {
    if (!opened) {
      onCancel?.()
      overlay.remove()
    }
  })

  async function openPack() {
    onOpened?.()
    cancelBtn.style.display = 'none'
    title.textContent = '카드팩이 열리는 중...'
    const packTop = overlay.querySelector('#unbox-pack-top')
    const packEl = overlay.querySelector('#unbox-pack')

    // 절취선이 슬라이스되며 상단이 뜯겨 나가는 연출
    await animate(
      packTop,
      { y: [0, -70], rotate: [0, -14], opacity: [1, 0] },
      { duration: 0.45, easing: 'ease-in' }
    ).finished
    // WAAPI 기본 fill 동작상 애니메이션 종료 후 스타일이 되돌아갈 수 있어 확실히 숨긴다
    packTop.style.display = 'none'
    track.style.display = 'none'

    let results = box.drawMulti(count)
    const lastOne = box.claimLastOne()
    if (lastOne) results = [...results, lastOne]

    // 결과 카드를 보여줄 땐 카드팩(뜯긴 나머지)이 자리를 차지할 필요가 없으므로 치운다
    // - 카드가 더 크게 보일 공간을 확보한다
    await animate(packEl, { opacity: [1, 0], scale: [1, 0.92] }, { duration: 0.22, easing: 'ease-in' }).finished
    packEl.style.display = 'none'

    cardActionForCount(count)(overlay, results)
    renderInfo()
  }
}

// 결과 카드를 어떤 연출(card_action1 / card_action2)로 보여줄지 여기서 정한다.
// 자유롭게 바꿔서 실험 가능 - 예: `() => cardAction2`로 항상 액션2만 쓰게 하거나,
// count별로 다른 조합을 시도해볼 수 있다.
function cardActionForCount(count) {
  return count === 1 ? cardAction1 : cardAction2
}

// 1등/2등/LAST만 희귀 등급으로 취급한다.
function isRareGrade(grade) {
  return ['1등', '2등', 'LAST'].includes(grade)
}

// card_action2에서 희귀 카드가 공개되는 순간에만 강화 글로우를 켠다.
// 3등/4등은 전체 결과 화면이 될 때까지 무발광을 유지한다.
function revealGlow(slot) {
  if (!isRareGrade(slot.dataset.grade)) return
  slot.querySelector('.card-glow').classList.add('is-on', 'is-rare')
}

// card_action2의 희귀 카드만 더 천천히, 스케일감 있게 뒤집혀 임팩트를 준다.
const RARE_FLIP_DURATION = 0.85

function stackFlipTiming(grade) {
  const rare = isRareGrade(grade)
  return {
    keyframes: rare ? { rotateY: [0, 180], scale: [1, 1.15, 1] } : { rotateY: [0, 180] },
    options: { duration: rare ? RARE_FLIP_DURATION : 0.32, easing: rare ? 'ease-in-out' : 'ease-out' },
  }
}

// 뽑기 결과 확정 시(카드 다 확인 후) 공통으로 쓰이는 마무리 처리 -
// 제목/버튼/결과 요약 노출 + 모든 카드에 기본 글로우를 켜서 "전리품 진열" 느낌을 준다.
// card_action1, card_action2 둘 다 여기서 마무리한다.
function finishReveal(overlay, results) {
  const title = overlay.querySelector('.overlay-title')
  const revealAllBtn = overlay.querySelector('#reveal-all-btn')
  title.textContent = '뽑기 결과'
  revealAllBtn.style.display = 'none'
  overlay.querySelectorAll('.card-glow').forEach((glow) => glow.classList.add('is-on'))
  overlay.querySelector('#overlay-actions').style.display = 'flex'
  overlay.querySelector('#result-summary').textContent = results
    .map((p) => `[${p.grade}] ${p.name}`)
    .join('  ·  ')
}

// card_action1: 뽑은 카드가 뒷면 상태로 흩뿌려진 배치로 한 번에 등장하고,
// 사용자가 한 장씩 탭해서 뒤집어 확인하거나 "전체 공개"로 한번에 확인한다.
// (1뽑기처럼 장수가 적을 때 쓰기 좋은 연출)
function cardAction1(overlay, results) {
  const tray = overlay.querySelector('#reveal-tray')
  const title = overlay.querySelector('.overlay-title')
  const revealAllBtn = overlay.querySelector('#reveal-all-btn')
  let revealedCount = 0

  results.forEach((prize) => {
    const tiltDeg = (Math.random() * 16 - 8).toFixed(1)
    const jitterY = Math.round(Math.random() * 14 - 7)
    const slot = document.createElement('div')
    slot.className = 'card-slot'
    slot.dataset.revealed = 'false'
    slot.style.transform = `rotate(${tiltDeg}deg) translateY(${jitterY}px)`
    slot.innerHTML = `
      <div class="card-glow is-on" style="background: radial-gradient(circle, ${prize.glow} 0%, transparent 70%)"></div>
      <div class="card-flip">
        <div class="card-face card-back">✦</div>
        <div class="card-face card-front" style="color:${prize.glow}; background:linear-gradient(160deg, ${prize.glow}45, var(--panel-2) 65%)">
          <div class="grade">${prize.grade}</div>
          <div class="name">${prize.name}</div>
        </div>
      </div>
    `
    tray.appendChild(slot)
  })

  function revealOne(slot) {
    if (slot.dataset.revealed === 'true') return
    slot.dataset.revealed = 'true'
    revealedCount += 1
    const finished = animate(slot.querySelector('.card-flip'), { rotateY: [0, 180] }, { duration: 0.45, easing: 'ease-out' })
      .finished
    // 마지막으로 트리거된 카드의 애니메이션까지 끝난 뒤에 결과 확정(닫기 버튼 노출)
    if (revealedCount === results.length) finished.then(() => finishReveal(overlay, results))
  }

  title.textContent = '카드를 눌러 확인하세요'
  revealAllBtn.style.display = 'inline-flex'
  revealAllBtn.onclick = () => {
    Array.from(tray.querySelectorAll('.card-slot'))
      .filter((slot) => slot.dataset.revealed !== 'true')
      .forEach((slot, i) => setTimeout(() => revealOne(slot), i * 60))
  }

  tray.addEventListener('click', (e) => {
    const slot = e.target.closest('.card-slot')
    if (!slot) return
    revealOne(slot)
  })
}

// card_action2: 뽑은 카드 전부가 한 장 밑에 다음 장이 겹쳐진 "스택" 상태로 등장한다.
// 전부 뒷면(미스터리) 상태로 시작하고, 뒤로 갈수록 조금씩 삐져나와 보이게 쌓인다.
// 카드를 위로 슬라이스해서 넘기는 그 순간에만 해당 카드가 뒷면 → 앞면으로 뒤집히며
// 결과가 공개된다 - 아직 넘기지 않은 카드는 삐져나온 부분까지도 전부 뒷면이라
// 등급 색이 미리 새어나오지 않는다. 스택을 다 넘기고 나면 전체 카드가 한 번에
// (흩뿌려진 배치로) 노출된다. (5/10뽑기처럼 장수가 많을 때 쓰기 좋은 연출)
function cardAction2(overlay, results) {
  const tray = overlay.querySelector('#reveal-tray')
  const title = overlay.querySelector('.overlay-title')
  const revealAllBtn = overlay.querySelector('#reveal-all-btn')

  tray.classList.add('is-stack')

  const cardEls = results.map((prize, i) => {
    const slot = document.createElement('div')
    slot.className = 'card-slot stack-card'
    slot.dataset.grade = prize.grade
    slot.style.zIndex = String(results.length - i)
    slot.style.setProperty('--stack-offset', `${i * 4}px`)
    slot.style.setProperty('--stack-scale', String(1 - i * 0.015))
    slot.innerHTML = `
      <div class="card-glow" style="background: radial-gradient(circle, ${prize.glow} 0%, transparent 70%)"></div>
      <div class="card-flip">
        <div class="card-face card-back">✦</div>
        <div class="card-face card-front" style="color:${prize.glow}; background:linear-gradient(160deg, ${prize.glow}45, var(--panel-2) 65%)">
          <div class="grade">${prize.grade}</div>
          <div class="name">${prize.name}</div>
        </div>
      </div>
    `
    tray.appendChild(slot)
    return slot
  })

  let cursor = 0 // 스택에서 아직 안 넘긴 맨 위 카드의 인덱스
  let dragging = false
  let startY = 0

  function updateTitle() {
    title.textContent = `카드를 위로 밀어서 확인하세요 (${cursor}/${results.length})`
  }

  function dismiss(slot) {
    // 모든 카드가 넘겨지는 이 순간에 비로소 뒷면 → 앞면으로 뒤집히며 결과가 공개된다
    // (그 전까지는 스택 속에서 삐져나온 부분까지도 전부 뒷면 상태라 등급이 새어나오지 않는다)
    cursor += 1
    updateTitle()

    // 카드가 살짝 들어오며 뒤집힌다. 일반 등급은 빠르게 넘기고,
    // 희귀 등급만 더 길게 머물며 강화 글로우를 보여 준다.
    slot.style.transform = `translate(-50%, calc(var(--stack-offset) - 36px)) scale(var(--stack-scale))`
    const rare = isRareGrade(slot.dataset.grade)
    const { keyframes, options } = stackFlipTiming(slot.dataset.grade)
    const flipped = animate(slot.querySelector('.card-flip'), keyframes, options).finished
    revealGlow(slot)

    flipped.then(() => {
      // 일반 카드는 리듬을 유지하도록 곧바로 넘기고, 희귀 카드만 읽을 시간을 준다.
      setTimeout(() => {
        slot.style.transform = `translate(-50%, -520px) scale(var(--stack-scale))`
        setTimeout(() => {
          slot.style.display = 'none'
          if (cursor >= results.length) finishStack()
        }, 280)
      }, rare ? 550 : 80)
    })
  }

  function finishStack() {
    // 스택을 다 넘기면 카드 전부를 한 번에 흩뿌려진 배치(card_action1과 동일한 느낌)로 공개한다
    tray.classList.remove('is-stack')
    cardEls.forEach((slot) => {
      slot.removeAttribute('style')
      const tiltDeg = (Math.random() * 16 - 8).toFixed(1)
      const jitterY = Math.round(Math.random() * 14 - 7)
      slot.style.transform = `rotate(${tiltDeg}deg) translateY(${jitterY}px)`
      slot.querySelector('.card-flip').style.transform = 'rotateY(180deg)'
    })
    finishReveal(overlay, results)
  }

  // 이벤트 위임: tray에 한 번만 붙이고, 매번 "지금 맨 위 카드(cardEls[cursor])"인지만 확인한다
  // (카드마다 리스너를 새로 달고 떼는 것보다 단순하고, 이미 넘긴 카드가 실수로 다시 반응할 일도 없다)
  tray.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.stack-card')
    if (!slot || cursor >= results.length || slot !== cardEls[cursor]) return
    dragging = true
    startY = e.clientY
    slot.style.transition = 'none'
    slot.setPointerCapture(e.pointerId)
  })

  tray.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const slot = cardEls[cursor]
    const dy = Math.min(0, e.clientY - startY)
    slot.style.transform = `translate(-50%, calc(var(--stack-offset) + ${dy}px)) scale(var(--stack-scale))`
  })

  function onPointerUp(e) {
    if (!dragging) return
    dragging = false
    const slot = cardEls[cursor]
    slot.style.transition = ''
    const dy = Math.min(0, e.clientY - startY)
    if (-dy >= SWIPE_DISMISS_DY) {
      dismiss(slot)
    } else {
      slot.style.transform = '' // 임계값 전에 놓으면 스택 제자리로 스냅백
    }
  }

  tray.addEventListener('pointerup', onPointerUp)
  tray.addEventListener('pointercancel', onPointerUp)

  updateTitle()
  revealAllBtn.style.display = 'inline-flex'
  revealAllBtn.onclick = () => {
    // 스와이프 도중 건너뛰고 싶을 때 - 남은 카드를 한번에 다 넘긴다
    for (let i = cursor; i < results.length; i += 1) {
      cardEls[i].style.display = 'none'
    }
    cursor = results.length
    finishStack()
  }
}

document.body.addEventListener('click', (e) => {
  if (e.target.id === 'close-btn') {
    e.target.closest('.overlay').remove()
  }
})

fitStandSize()
renderStand()
renderInfo()
