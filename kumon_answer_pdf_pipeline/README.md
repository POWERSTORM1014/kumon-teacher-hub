# 구몬수학 해답지 정리본 PDF 자동 생성 — 로컬(VS Code) 환경 구축 가이드

이 폴더를 VS Code 프로젝트(예: `kumon-teacher-hub`) 안에 그대로 넣고,
터미널에서 `./run_all.sh` 한 번만 실행하면 오늘 Claude와 함께 완성한
여백·부호·분수·"같은 답" 표기 규칙 그대로 PDF가 나옵니다.

## 1. 한 번만 설치하면 되는 것들

### (1) LaTeX 엔진 — xelatex
본문을 실제 수식 조판(분수 막대, 부호 크기, 이탤릭 변수)으로 그리기 위해 LaTeX을 씁니다.

- **macOS**: [MacTeX](https://tug.org/mactex/) 설치 (Homebrew: `brew install --cask mactex`)
- **Windows**: [TeX Live](https://tug.org/texlive/) 또는 [MiKTeX](https://miktex.org/) 설치
- **Linux**: `sudo apt install texlive-xetex texlive-fonts-recommended`

설치 후 터미널에서 아래 명령이 실행되면 성공입니다.
```
xelatex --version
```

### (2) 한글 폰트 — Noto Sans CJK KR
표의 한글 텍스트(문항, 정답, 같은 답 등)에 사용합니다.

- **macOS**: [Google Fonts - Noto Sans KR](https://fonts.google.com/noto/specimen/Noto+Sans+KR)에서 다운로드 후 더블클릭 설치
- **Windows**: 위 링크에서 다운로드 후 폰트 파일 우클릭 → "설치"
- **Linux**: `sudo apt install fonts-noto-cjk`

설치 후 새 터미널을 열어야 폰트가 인식됩니다.

### (3) Python 패키지
```
pip install -r requirements.txt
```
(`pip install --break-system-packages -r requirements.txt` 가 필요한 환경도 있습니다.)

## 2. 실행 방법

1. 이 폴더(`kumon_answer_pdf_pipeline`)를 VS Code 프로젝트 안 원하는 위치에 둡니다.
2. 매번 작업할 엑셀 데이터를 이 폴더에 **`source.xlsx`** 라는 이름으로 복사합니다.
   (컬럼 순서: 단계, 페이지, 면, 식별자, 문항, 정답, 비고, 원본이미지 — 기존 ans-kumon-math 파일과 동일한 형식)
3. 터미널에서:
   ```
   cd kumon_answer_pdf_pipeline
   chmod +x run_all.sh   # 최초 1회만
   ./run_all.sh
   ```
4. `output/구몬수학_I단계_해답지_정리본.pdf` 가 생성됩니다.

과목/단계가 바뀌면 `build_tex_content.py` 맨 위의 `STAGE_TITLE` 값과
`build_cover.py`의 `STAGE_TITLE` 값만 바꿔주면 표지·꼬릿말 제목이 함께 바뀝니다.

## 3. 오늘 확정된 디자인 규칙 (스크립트에 이미 반영됨)

- `-` 부호는 LaTeX 수식 모드로 그려 `+`와 같은 크기로 보이게 함
- 맨 앞에 오는 `-` 부호도 중간 부호처럼 살짝 띄어 씀
- 모든 변수는 이탤릭, 분수는 실제 분수 막대(`\dfrac`)로 표시
- "같은 답"이 있는 면은 3열 표(문항/정답/같은 답, `[ ]` 대괄호 표기), 없는 면은 2열 표
- 2열/3열 표 모두 행 간격을 넉넉하게 주어(`\arraystretch`, 셀 안쪽 strut) 답답해 보이지 않도록 함
  — **이 여백 규칙은 앞으로의 모든 풀이집 작업에 기본으로 적용되는 조건입니다.**

이 규칙들을 더 조정하고 싶으면 `build_tex_content.py`의 아래 값들을 수정하세요:
- `\ans{...}` 매크로의 strut 크기 (답 셀 위아래 여백)
- `same_answer_cell()` 함수의 strut 크기 (같은 답 칸 위아래 여백)
- `\arraystretch` 값 (표 전체 줄간격)

## 4. 참고

- `build_pdf.py`, `build_pdf2.py` 는 초기 시도(reportlab/weasyprint 기반)로, 더 이상 쓰이지 않는 구버전입니다. 가져오지 않아도 됩니다.
- 표지만 weasyprint(HTML/CSS)로 만드는 이유는 그라데이션 디자인이 HTML/CSS 쪽이 더 손쉬워서이며, 본문은 전부 LaTeX입니다.
