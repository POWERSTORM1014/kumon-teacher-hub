# -*- coding: utf-8 -*-
"""표지(cover.pdf) + 본문(content.pdf)을 합쳐 최종본을 만든다."""
import os
from pypdf import PdfWriter, PdfReader

STAGE_TITLE_FILE = "구몬수학_I단계_해답지_정리본.pdf"  # 필요하면 수정

writer = PdfWriter()
for f in ["output/cover.pdf", "content.pdf"]:
    reader = PdfReader(f)
    for page in reader.pages:
        writer.add_page(page)

os.makedirs("output", exist_ok=True)
out_path = os.path.join("output", STAGE_TITLE_FILE)
with open(out_path, "wb") as f:
    writer.write(f)

print("DONE", out_path, "- pages:", len(writer.pages))
