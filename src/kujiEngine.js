// 쿠지(경품 추첨) 핵심 엔진 - 박스형(재고 차감) 방식
// kuji.py의 KujiBox 로직을 JS로 포팅한 버전. 결과 판정은 이 엔진이 전담하고,
// 화면 연출(카드팩 매대)은 이 엔진이 반환한 결과를 그대로 표현만 한다.

export class Prize {
  constructor({ grade, name, total, remaining = null, image = '', glow = '#ffffff' }) {
    this.grade = grade
    this.name = name
    this.total = total
    this.remaining = remaining === null ? total : remaining
    this.image = image
    this.glow = glow
  }
}

export class KujiBox {
  constructor({ prizes, title = '쿠지 박스', lastOnePrize = null }) {
    this.prizes = prizes
    this.title = title
    this.lastOnePrize = lastOnePrize
    this._lastOneClaimed = false
  }

  get totalRemaining() {
    return this.prizes.reduce((sum, p) => sum + p.remaining, 0)
  }

  get isEmpty() {
    return this.totalRemaining === 0
  }

  // 남은 수량에 비례한 가중치 추첨으로 한 장을 뽑는다 (재고 1 차감)
  draw() {
    const total = this.totalRemaining
    if (total <= 0) return null

    let roll = Math.random() * total
    for (const prize of this.prizes) {
      if (roll < prize.remaining) {
        prize.remaining -= 1
        return prize
      }
      roll -= prize.remaining
    }
    return null
  }

  drawMulti(n) {
    const results = []
    for (let i = 0; i < n; i += 1) {
      const prize = this.draw()
      if (!prize) break
      results.push(prize)
    }
    return results
  }

  claimLastOne() {
    if (this.isEmpty && this.lastOnePrize && !this._lastOneClaimed) {
      this._lastOneClaimed = true
      return this.lastOnePrize
    }
    return null
  }

  // 등급별 (남은/전체/실시간 확률) 뷰 - 하단 정보 영역에 그대로 노출
  status() {
    const total = this.totalRemaining
    return this.prizes.map((p) => ({
      grade: p.grade,
      name: p.name,
      remaining: p.remaining,
      total: p.total,
      glow: p.glow,
      probability: total === 0 ? 0 : Math.round((p.remaining / total) * 1000) / 10,
    }))
  }
}
