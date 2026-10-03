# -*- coding: utf-8 -*-
"""표지 1장만 weasyprint로 생성 (navy 그라데이션 디자인은 기존 승인된 디자인 유지)."""
import re
from collections import defaultdict
from openpyxl import load_workbook
import weasyprint

SRC_XLSX = "source.xlsx"
OUT_PDF = "output/cover.pdf"
STAGE_TITLE = "구몬수학 I단계 해답지"

wb = load_workbook(SRC_XLSX)
ws = wb.active
# 열 순서가 아니라 머리글 이름으로 읽는다(OCR숫자판독·판정 등 추가 열이 있어도 동작)
header = [c.value for c in ws[1]]
col = {name: header.index(name) for name in ("페이지", "면", "문항", "정답", "비고")}
rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[col["페이지"]] is not None]
pages = defaultdict(lambda: defaultdict(list))
for r in rows:
    pages[r[col["페이지"]]][r[col["면"]]].append((r[col["문항"]], r[col["정답"]], r[col["비고"]] or ""))
page_nums = sorted(pages.keys())
total_items = sum(len(v) for p in pages.values() for v in p.values())

html_doc = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 0; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: 'Noto Sans CJK KR'; }}
  .cover {{
    background: linear-gradient(135deg, #1C2541 0%, #0F1626 100%);
    color: #F5F3EC;
    width: 210mm;
    height: 297mm;
    padding: 40mm 25mm;
    position: relative;
  }}
  .cover .eyebrow {{
    color: #C9A227;
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 60mm;
  }}
  .cover h1 {{
    font-size: 30pt;
    font-weight: 700;
    margin: 0 0 4mm 0;
    line-height: 1.3;
  }}
  .cover .meta {{
    color: #D8D5C8;
    font-size: 12pt;
    margin-top: 10mm;
    line-height: 1.8;
  }}
  .cover .footer {{
    position: absolute;
    bottom: 20mm;
    left: 25mm;
    color: #9AA0B4;
    font-size: 9pt;
  }}
</style>
</head>
<body>
  <div class="cover">
    <div class="eyebrow">AI 자동 정리본 &middot; LaTeX 수식 조판</div>
    <h1>{STAGE_TITLE} 정리본</h1>
    <div class="meta">
      수록 페이지 {page_nums[0]}~{page_nums[-1]}p &middot; 총 {total_items}문항<br>
      ans-kumon-math-014-I.xlsx 기반 자동 생성
    </div>
    <div class="footer">구몬 자동화 프로젝트 · 2026.10</div>
  </div>
</body>
</html>
"""

import os
os.makedirs("output", exist_ok=True)
weasyprint.HTML(string=html_doc, base_url=".").write_pdf(OUT_PDF)
print("DONE", OUT_PDF)
