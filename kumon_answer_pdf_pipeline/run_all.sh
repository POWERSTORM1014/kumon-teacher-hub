#!/usr/bin/env bash
# 구몬 해답지 정리본 PDF 일괄 생성 스크립트
# 사용법:
#   ./run_all.sh                          이 폴더의 source.xlsx 를 그대로 사용
#   ./run_all.sh "<엑셀 파일 경로>"        그 파일을 source.xlsx 로 복사한 뒤 사용
#     예) ./run_all.sh "../kumon-page-answer-edit/math/M014-I/ans-kumon-math-014-I.xlsx"
set -e

# 인자가 있으면 그 파일을 source.xlsx 로 복사한다(원본은 건드리지 않음)
if [ $# -ge 1 ]; then
  if [ ! -f "$1" ]; then
    echo "오류: 지정한 엑셀 파일이 없습니다: $1"
    exit 1
  fi
  if [ ! "$1" -ef "source.xlsx" ]; then
    cp "$1" source.xlsx
    echo "복사: $1 -> source.xlsx"
  fi
fi

if [ ! -f "source.xlsx" ]; then
  echo "오류: source.xlsx 파일이 이 폴더에 없습니다. 엑셀 파일 경로를 인자로 주거나, source.xlsx 라는 이름으로 넣어주세요."
  exit 1
fi

# Windows에서는 python3 가 Microsoft Store 바로가기일 수 있으므로 실제로 동작하는 쪽을 고른다
PY=python3
if ! python3 -c "" >/dev/null 2>&1; then PY=python; fi

echo "[1/4] 본문 LaTeX 소스(content.tex) 생성 중..."
"$PY" build_tex_content.py

echo "[2/4] 본문 PDF(content.pdf) 조판 중 (xelatex)..."
xelatex -interaction=nonstopmode content.tex > xelatex.log 2>&1
xelatex -interaction=nonstopmode content.tex >> xelatex.log 2>&1   # 참조/카운터 안정화를 위해 2회 실행

echo "[3/4] 표지(cover.pdf) 생성 중..."
"$PY" build_cover.py

echo "[4/4] 표지 + 본문 합치는 중..."
"$PY" merge.py

echo ""
echo "완료! output/ 폴더에서 최종 PDF를 확인하세요."
