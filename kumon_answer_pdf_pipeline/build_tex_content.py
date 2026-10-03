# -*- coding: utf-8 -*-
"""
ans-kumon-math-014-I.xlsx 의 해답 데이터를 xelatex으로 조판한다.
원본 교재와 동일한 수식 표기(실제 분수 막대, 올바른 부호 크기, 이탤릭 변수)를
LaTeX 수식 모드가 자동으로 처리하므로 더 이상 수작업 CSS 보정이 필요 없다.
"""
import re
import subprocess
from collections import defaultdict
from openpyxl import load_workbook

SRC_XLSX = "source.xlsx"
TEX_FILE = "content.tex"
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


def qkey(q):
    s = str(q)
    m = re.match(r"^(\d+)-(\d+)$", s)
    if m:
        return (int(m.group(1)), int(m.group(2)))
    try:
        return (int(s), 0)
    except ValueError:
        return (9999, 0)


for p in pages:
    for face in pages[p]:
        pages[p][face].sort(key=lambda t: qkey(t[0]))

page_nums = sorted(pages.keys())
total_items = sum(len(v) for p in pages.values() for v in p.values())

# ---------- 정답/비고 문자열 -> LaTeX 수식 변환 ----------
SUP_MAP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
SUP_RE = re.compile(r"([A-Za-z\)])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)")
SQRT_RE = re.compile(r"([+-]?\d*)√\[?(\d+)\]?")
FRAC_RE = re.compile(
    r"\((?P<pinner>[^()]+)\)/(?P<pden>\d+)"
    r"|\((?P<snum>\d+)/(?P<sden>\d+)\)"
    r"|(?P<bsign>[+-]?)(?P<bnum>\d+)/(?P<bden>\d+)"
)


def conv_exponent(s):
    return SUP_RE.sub(lambda m: f"{m.group(1)}^{{{m.group(2).translate(SUP_MAP)}}}", s)


def conv_sqrt(s):
    def repl(m):
        coeff = m.group(1) or ""
        rad = m.group(2)
        return f"{coeff}\\sqrt{{{rad}}}"
    return SQRT_RE.sub(repl, s)


def conv_frac(s):
    out = []
    pos = 0
    for m in FRAC_RE.finditer(s):
        out.append(s[pos:m.start()])
        gd = m.groupdict()
        if gd["pinner"] is not None:
            out.append(f"\\dfrac{{{gd['pinner']}}}{{{gd['pden']}}}")
        elif gd["snum"] is not None:
            out.append(f"\\dfrac{{{gd['snum']}}}{{{gd['sden']}}}")
        else:
            sign = gd["bsign"] or ""
            out.append(f"{sign}\\dfrac{{{gd['bnum']}}}{{{gd['bden']}}}")
        pos = m.end()
    out.append(s[pos:])
    return "".join(out)


def to_latex_math(raw):
    s = str(raw)
    s = conv_exponent(s)
    s = conv_sqrt(s)
    s = conv_frac(s)
    # 원본 교재는 맨 앞에 오는 - 부호도 뒤 글자와 살짝 띄어 쓴다(일반 LaTeX 기본값은
    # 맨 앞 부호를 단항으로 보고 붙여 쓰므로, 중간 부호와 똑같이 보이도록 간격을 강제한다).
    if s.startswith("-"):
        s = "-\\," + s[1:]
    return s


def format_answer(raw):
    return f"\\ans{{${to_latex_math(raw)}$}}"


def parse_note(raw):
    """비고 -> ('same', [latex식, ...]) | ('plain', 원문) | None."""
    s = str(raw).strip()
    if not s:
        return None
    m = re.match(r"^같은\s*답\s*(.*)$", s)
    if m:
        parts = [p.strip() for p in m.group(1).split(",") if p.strip()]
        return ("same", [to_latex_math(p) for p in parts])
    return ("plain", s)


def same_answer_cell(exprs):
    """원본 교재처럼 [ ] 로 감싼 동치식을 세로로 쌓는다.
    위아래에 strut를 직접 넣어 왼쪽(같은 답 없는) 표와 행 높이가 맞도록 한다."""
    boxed = [f"$\\left[{{{e}}}\\right]$" for e in exprs]
    joined = "\\newline\n".join(boxed)
    return f"\\rule{{0pt}}{{4.6ex}}{joined}\\rule[-2.4ex]{{0pt}}{{0pt}}"


def tex_escape(s):
    rep = {
        "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
        "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}", "\\": r"\textbackslash{}",
    }
    return "".join(rep.get(c, c) for c in s)


# ---------- 표/페이지블록 ----------
def face_table(items):
    if not items:
        return "\\textit{\\small\\color{mutedc}(해당 없음)}"

    parsed = [(q, a, parse_note(note)) for (q, a, note) in items]
    has_same = any(p and p[0] == "same" for _, _, p in parsed)

    if has_same:
        lines = [
            "\\renewcommand{\\arraystretch}{1.6}",
            "\\begin{tabular}{Q B T}",
            "\\rowcolor{navy}",
            "\\textcolor{white}{\\bfseries 문항} & \\textcolor{white}{\\bfseries 정답} "
            "& \\textcolor{white}{\\bfseries 같은 답} \\\\",
            "\\hline",
        ]
        for i, (q, a, note) in enumerate(parsed):
            qtxt = f"({q})"
            atex = format_answer(a)
            same_cell = ""
            if note and note[0] == "same":
                same_cell = same_answer_cell(note[1])
            elif note and note[0] == "plain":
                plain_block = (f"{{\\footnotesize\\color{{mutedc}}"
                              f"\\rule{{0pt}}{{2.6ex}}\\textperiodcentered\\ {tex_escape(note[1])}"
                              f"\\rule[-1.0ex]{{0pt}}{{0pt}}}}")
                atex = f"{atex}\\newline{plain_block}"
            shade = "\\rowcolor{bandbg}\n" if i % 2 == 1 else ""
            lines.append(f"{shade}{qtxt} & {atex} & {same_cell} \\\\ \\hline")
        lines.append("\\end{tabular}")
        return "\n".join(lines)

    lines = [
        "\\renewcommand{\\arraystretch}{1.45}",
        "\\begin{tabular}{Q A}",
        "\\rowcolor{navy}",
        "\\textcolor{white}{\\bfseries 문항} & \\textcolor{white}{\\bfseries 정답} \\\\",
        "\\hline",
    ]
    for i, (q, a, note) in enumerate(parsed):
        qtxt = f"({q})"
        atex = format_answer(a)
        if note and note[0] == "plain":
            plain_block = (f"{{\\footnotesize\\color{{mutedc}}"
                          f"\\rule{{0pt}}{{2.6ex}}\\textperiodcentered\\ {tex_escape(note[1])}"
                          f"\\rule[-1.0ex]{{0pt}}{{0pt}}}}")
            atex = f"{atex}\\newline{plain_block}"
        shade = "\\rowcolor{bandbg}\n" if i % 2 == 1 else ""
        lines.append(f"{shade}{qtxt} & {atex} \\\\ \\hline")
    lines.append("\\end{tabular}")
    return "\n".join(lines)


def page_block(pno):
    faces = pages[pno]
    a_html = face_table(faces.get("a", []))
    b_html = face_table(faces.get("b", []))
    return f"""
\\needspace{{30mm}}
{{\\Large\\bfseries\\color{{navy}} {pno} 페이지}}\\\\[1pt]
{{\\color{{navy}}\\rule{{\\textwidth}}{{1.4pt}}}}\\\\[3mm]
\\noindent
\\begin{{minipage}}[t]{{0.47\\textwidth}}
{{\\small\\bfseries\\color{{gold}} {pno}p $\\cdot$ a면}}\\\\[1.5mm]
{a_html}
\\end{{minipage}}\\hfill
\\begin{{minipage}}[t]{{0.47\\textwidth}}
{{\\small\\bfseries\\color{{gold}} {pno}p $\\cdot$ b면}}\\\\[1.5mm]
{b_html}
\\end{{minipage}}
\\vspace{{7mm}}
"""


body_blocks = "\n".join(page_block(p) for p in page_nums)

preamble = r"""
\documentclass[10pt]{article}
\usepackage[a4paper,margin=18mm,top=22mm,bottom=20mm]{geometry}
\usepackage{fontspec}
\setmainfont{Noto Sans CJK KR}
\usepackage{amsmath}
\usepackage{xcolor}
\usepackage{colortbl}
\usepackage{array}
\usepackage{fancyhdr}
\usepackage{needspace}

\definecolor{navy}{HTML}{1C2541}
\definecolor{gold}{HTML}{C9A227}
\definecolor{mutedc}{HTML}{4A5568}
\definecolor{bandbg}{HTML}{F4F5F2}
\definecolor{linecol}{HTML}{D9DCE1}

\arrayrulecolor{linecol}
\setlength{\arrayrulewidth}{0.3pt}
\setlength{\tabcolsep}{4.0pt}

\newcolumntype{Q}{>{\bfseries\color{navy}\centering\arraybackslash}m{1.3cm}}
\newcolumntype{A}{>{\raggedright\arraybackslash}m{4.85cm}}
\newcolumntype{B}{>{\raggedright\arraybackslash}m{2.6cm}}
\newcolumntype{T}{>{\raggedright\arraybackslash}m{3.5cm}}
\newcommand{\ans}[1]{\rule{0pt}{3.9ex}#1\rule[-1.9ex]{0pt}{0pt}}

\setlength{\parindent}{0pt}
\setcounter{page}{2}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\fancyfoot[L]{\color{mutedc}\small """ + STAGE_TITLE + r""" 정리본}
\fancyfoot[R]{\color{mutedc}\small \thepage}

\begin{document}
"""

notebox = f"""
\\noindent
\\colorbox{{bandbg}}{{%
  \\begin{{minipage}}{{\\dimexpr\\textwidth-10pt\\relax}}
  \\raggedright
  \\vspace{{2mm}}
  {{\\color{{mutedc}}\\footnotesize
  이 문서는 촬영 이미지가 아니라, 사람이 직접 읽어 엑셀에 입력한 정답 데이터를
  LaTeX 수식으로 다시 조판한 것입니다. 글자와 분수가 벡터로 그려지므로 해상도
  손실이 없고, 원본 교재와 동일한 수식 표기(분수 막대, 부호, 이탤릭 변수)를
  따릅니다. 다만 원본 교재의 정확한 칸 배치까지 그대로 재현한 것은 아니며,
  정답 내용은 사람이 이미지를 보고 읽은 값이므로 교재 원본과 다를 가능성이
  있습니다. 최종 확인은 교재영역\\_추출 폴더의 원본 캡처 이미지와 대조해
  주세요.}}
  \\vspace{{2mm}}
  \\end{{minipage}}%
}}
\\vspace{{6mm}}

"""

doc = preamble + notebox + body_blocks + "\n\\end{document}\n"

with open(TEX_FILE, "w", encoding="utf-8") as f:
    f.write(doc)

print("WROTE", TEX_FILE, "- distinct pages:", len(page_nums), "items:", total_items)
