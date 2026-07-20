# -*- coding: utf-8 -*-
"""
쿠지(경품 추첨) 핵심 엔진 - 박스형(재고 차감) 방식
------------------------------------------------------------
동작 원리
  - 박스 안에 상품을 미리 정해진 '수량'만큼 넣어 둡니다. (예: 1등 1장, 2등 5장 ...)
  - 한 번 뽑으면 그 상품이 박스에서 1장 빠집니다. (= '남은 의자'가 줄어듭니다)
  - 확률은 따로 고정하는 게 아니라 '남은 수량 / 남은 전체 장수'로 그때그때 계산됩니다.
  - 그래서 "남은 1등 3개 -> 2개 -> 1개" 처럼 재고가 실제로 줄어듭니다.

이 파일 하나만으로 로직이 완결되며, 나중에 어드민/화면/서버가 이 엔진을 불러 씁니다.
"""

import random
from dataclasses import dataclass, field


@dataclass
class Prize:
    """상품 한 종류를 표현합니다."""
    grade: str            # 등급 (예: "S", "A", "B" 또는 "1등", "2등")
    name: str             # 상품명 (예: "한정 피규어")
    total: int            # 박스에 처음 넣은 수량
    remaining: int = None # 남은 수량 (지정 안 하면 total과 동일하게 시작)
    image: str = ""       # 상품 이미지 경로/URL (선택 사항)

    def __post_init__(self):
        # remaining을 따로 안 넣으면 처음엔 total과 같게 맞춰 줍니다.
        if self.remaining is None:
            self.remaining = self.total


class KujiBox:
    """쿠지 박스 하나를 관리하는 엔진."""

    def __init__(self, prizes, title="쿠지 박스", last_one_prize=None, seed=None):
        """
        prizes         : Prize 객체들의 리스트
        title          : 박스 이름 (예: "3천원 쿠지")
        last_one_prize : 마지막 장을 뽑은 사람에게 주는 보장 상품(구제 기능). 없으면 None
        seed           : 테스트용. 같은 seed를 넣으면 결과가 재현됩니다. 실제 운영에선 None
        """
        self.prizes = prizes
        self.title = title
        self.last_one_prize = last_one_prize
        self._last_one_claimed = False
        # seed를 넣으면 재현 가능한 난수, 안 넣으면 매번 진짜 랜덤
        self._rng = random.Random(seed)

    # ----- 현재 상태 조회용 -----

    @property
    def total_remaining(self):
        """박스에 남은 전체 장수."""
        return sum(p.remaining for p in self.prizes)

    @property
    def is_empty(self):
        """박스가 비었는지 여부."""
        return self.total_remaining == 0

    def probabilities(self):
        """지금 이 순간의 등급별 실시간 확률(%)을 딕셔너리로 돌려줍니다."""
        total = self.total_remaining
        if total == 0:
            return {p.grade: 0.0 for p in self.prizes}
        return {p.grade: round(p.remaining / total * 100, 2) for p in self.prizes}

    def status(self):
        """
        '남은 의자' 뷰용 데이터.
        각 상품의 (등급, 이름, 남은수량, 초기수량, 현재확률%)을 리스트로 돌려줍니다.
        """
        probs = self.probabilities()
        return [
            (p.grade, p.name, p.remaining, p.total, probs[p.grade])
            for p in self.prizes
        ]

    # ----- 핵심: 뽑기 -----

    def draw(self):
        """
        한 장 뽑습니다.
        - 남은 수량을 가중치로 삼아 랜덤 선택 (재고가 많은 등급이 더 잘 나옵니다)
        - 뽑힌 상품의 남은 수량을 1 줄입니다
        - 뽑을 게 없으면 None을 돌려줍니다
        """
        available = [p for p in self.prizes if p.remaining > 0]
        if not available:
            return None  # 박스가 비었음

        weights = [p.remaining for p in available]
        picked = self._rng.choices(available, weights=weights, k=1)[0]
        picked.remaining -= 1
        return picked

    def draw_multi(self, n):
        """
        n연 뽑기 (예: 5연은 draw_multi(5), 10연은 draw_multi(10)).
        박스에 남은 게 n보다 적으면 남은 만큼만 뽑고 멈춥니다.
        뽑힌 상품들의 리스트를 돌려줍니다.
        """
        results = []
        for _ in range(n):
            prize = self.draw()
            if prize is None:
                break  # 도중에 박스가 비면 중단
            results.append(prize)
        return results

    # ----- 구제 기능: 라스트원상 -----

    def claim_last_one(self):
        """
        박스가 완전히 비었고, 라스트원상이 설정돼 있으면 딱 한 번 돌려줍니다.
        (마지막 장을 뽑은 사람에게 보장 상품을 주는 용도)
        조건이 안 맞으면 None.
        """
        if self.is_empty and self.last_one_prize and not self._last_one_claimed:
            self._last_one_claimed = True
            return self.last_one_prize
        return None


# ============================================================
# 실행 예시 - 이 파일을 직접 실행하면 아래 부분이 돌아갑니다.
#   터미널에서:  python kuji_engine.py
# ============================================================
if __name__ == "__main__":

    def print_status(box):
        """남은 의자 뷰를 보기 좋게 출력."""
        print(f"\n[{box.title}] 남은 전체: {box.total_remaining}장")
        print(" 등급 | 상품명              | 남은/전체 | 현재확률")
        print("-" * 52)
        for grade, name, remaining, total, prob in box.status():
            bar = "■" * remaining + "□" * (total - remaining)  # 남은/사용된 의자 시각화
            print(f"  {grade:<3} | {name:<18} | {remaining:>2}/{total:<2}   | {prob:>5}%  {bar}")

    # 1) 3천원 쿠지 박스를 하나 정의합니다. (전체 200장)
    box = KujiBox(
        title="3천원 쿠지",
        prizes=[
            Prize(grade="1등", name="한정 대형 피규어",  total=1),
            Prize(grade="2등", name="아크릴 스탠드",     total=9),
            Prize(grade="3등", name="포토카드 세트",     total=40),
            Prize(grade="4등", name="랜덤 뱃지",        total=150),
        ],
        last_one_prize=Prize(grade="LAST", name="라스트원 특전 색지", total=1),
        seed=42,  # 예시라 결과 고정. 실제 운영에선 이 줄을 지우세요.
    )

    print("=" * 52)
    print("뽑기 시작 전 상태")
    print("=" * 52)
    print_status(box)

    # 2) 10연 뽑기를 해봅니다.
    print("\n" + "=" * 52)
    print("10연 뽑기 결과")
    print("=" * 52)
    results = box.draw_multi(10)
    for i, prize in enumerate(results, start=1):
        print(f"  {i:>2}번째 -> [{prize.grade}] {prize.name}")

    # 3) 뽑고 난 뒤 남은 의자를 확인합니다.
    print_status(box)

    # 4) (선택) 박스를 끝까지 비우면 라스트원상이 나오는지 확인.
    box.draw_multi(box.total_remaining)  # 남은 걸 전부 뽑아 박스를 비움
    last_one = box.claim_last_one()
    print("\n" + "=" * 52)
    if last_one:
        print(f"박스 소진! 마지막 장 보장(라스트원상): [{last_one.grade}] {last_one.name}")
    print("=" * 52)