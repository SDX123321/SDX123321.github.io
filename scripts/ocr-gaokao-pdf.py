#!/usr/bin/env python3
"""OCR image-based Gaokao PDFs into review-only structured data."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR


DEFAULT_SOURCE_ROOT = (
    Path.home()
    / "Desktop"
    / "\u53c2\u8003\u8d44\u6599"
    / "2026\u9ad8\u8003\u8bd5\u5377\uff08\u66f4\u65b0\u4e2d\uff09"
)
DEFAULT_OUT = Path("src/data/jiangsu-gaokao-ocr.json")
DEFAULT_RENDER_DIR = Path("tmp/pdfs")
DEFAULT_PDFTOPPM = (
    Path.home()
    / ".cache"
    / "codex-runtimes"
    / "codex-primary-runtime"
    / "dependencies"
    / "native"
    / "poppler"
    / "Library"
    / "bin"
    / "pdftoppm.exe"
)

QUESTION_RE = re.compile(r"^(\d{1,2})[．.]\s*(.*)")
SKIP_LINE_RE = re.compile(
    r"^(绝密|2026\s*年普通|数学$|注意事项|[一二三四]、|数学试题第|答卷前|回答选择题|考试结束)"
)


def find_pdf(source_root: Path, filename: str) -> Path:
    matches = sorted(source_root.rglob(filename))
    if not matches:
        raise FileNotFoundError(f"Cannot find {filename} under {source_root}")
    return matches[0]


def render_pages(pdf_path: Path, out_dir: Path, pdftoppm: Path, dpi: int) -> list[Path]:
    if not pdftoppm.exists():
        raise FileNotFoundError(f"pdftoppm not found: {pdftoppm}")
    out_dir.mkdir(parents=True, exist_ok=True)
    page_count = len(PdfReader(str(pdf_path)).pages)
    rendered = []
    for page_number in range(1, page_count + 1):
        prefix = out_dir / f"jiangsu-2026-math-page{page_number}"
        subprocess.run(
            [
                str(pdftoppm),
                "-png",
                "-r",
                str(dpi),
                "-f",
                str(page_number),
                "-singlefile",
                str(pdf_path),
                str(prefix),
            ],
            check=True,
        )
        rendered.append(prefix.with_suffix(".png"))
    return rendered


def reading_order(items: list[dict], row_tolerance: int = 14) -> list[dict]:
    rows: list[dict] = []
    for item in sorted(items, key=lambda value: (value["top"], value["left"])):
        for row in rows:
            if abs(row["top"] - item["top"]) <= row_tolerance:
                row["items"].append(item)
                row["top"] = min(row["top"], item["top"])
                break
        else:
            rows.append({"top": item["top"], "items": [item]})

    ordered = []
    for row in sorted(rows, key=lambda value: value["top"]):
        ordered.extend(sorted(row["items"], key=lambda value: value["left"]))
    return ordered


def ocr_page_columns(ocr: RapidOCR, image_path: Path, min_score: float) -> list[dict]:
    image = Image.open(image_path)
    width, height = image.size
    columns = [
        ("left", image.crop((0, 0, width // 2 + 50, height))),
        ("right", image.crop((width // 2 - 50, 0, width, height))),
    ]
    lines = []
    for column_name, crop in columns:
        result, _ = ocr(crop)
        raw_items = []
        for box, text, score in result or []:
            if score < min_score:
                continue
            raw_items.append({
                "text": text.strip(),
                "score": round(float(score), 3),
                "top": round(min(point[1] for point in box), 1),
                "left": round(min(point[0] for point in box), 1),
            })
        for item in reading_order(raw_items):
            item["column"] = column_name
            lines.append(item)
    return lines


def question_type(number: int) -> str:
    if number <= 8:
        return "\u5355\u9879\u9009\u62e9"
    if number <= 11:
        return "\u591a\u9879\u9009\u62e9"
    if number <= 14:
        return "\u586b\u7a7a"
    return "\u89e3\u7b54"


def split_questions(lines: list[dict]) -> list[dict]:
    questions = []
    current: dict | None = None
    exam_started = False
    for line in lines:
        text = line["text"].strip()
        if text.startswith("\u4e00\u3001"):
            exam_started = True
            continue
        if not exam_started:
            continue
        if not text or SKIP_LINE_RE.search(text):
            continue
        match = QUESTION_RE.match(text)
        if match:
            if current:
                questions.append(current)
            number = int(match.group(1))
            rest = match.group(2).strip()
            current = {
                "number": number,
                "type": question_type(number),
                "lines": [],
                "scores": [],
                "flags": ["ocr_scan", "formula_review_required"],
            }
            if rest:
                current["lines"].append(rest)
                current["scores"].append(line["score"])
            continue
        if current:
            current["lines"].append(text)
            current["scores"].append(line["score"])

    if current:
        questions.append(current)

    normalized = []
    for question in questions:
        scores = question.pop("scores")
        average_score = round(sum(scores) / len(scores), 3) if scores else 0
        if average_score < 0.9:
            question["flags"].append("low_confidence")
        question["averageScore"] = average_score
        question["prompt"] = "\n".join(question["lines"]).strip()
        normalized.append(question)
    return normalized


def build(args: argparse.Namespace) -> dict:
    pdf_path = find_pdf(args.source_root, args.filename)
    rendered_pages = render_pages(pdf_path, args.render_dir, args.pdftoppm, args.dpi)
    ocr = RapidOCR()
    all_lines = []
    page_summaries = []
    for page_index, image_path in enumerate(rendered_pages, 1):
        lines = ocr_page_columns(ocr, image_path, args.min_score)
        for line in lines:
            line["pdfPage"] = page_index
        all_lines.extend(lines)
        page_summaries.append({
            "pdfPage": page_index,
            "image": str(image_path),
            "lines": len(lines),
        })

    questions = split_questions(all_lines)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "year": 2026,
            "province": "\u6c5f\u82cf",
            "subject": "math",
            "subjectName": "\u6570\u5b66",
            "filename": pdf_path.name,
            "relativePath": str(pdf_path.relative_to(args.source_root)),
            "status": "ocr-needs-review",
            "note": "\u626b\u63cf PDF OCR \u7ed3\u679c\uff0c\u6570\u5b66\u516c\u5f0f\u3001\u56fe\u5f62\u548c\u6392\u7248\u9700\u4eba\u5de5\u590d\u6838\u3002",
        },
        "summary": {
            "pdfPages": len(rendered_pages),
            "ocrLines": len(all_lines),
            "questions": len(questions),
            "reviewQuestions": len(questions),
            "minScore": args.min_score,
            "dpi": args.dpi,
        },
        "pages": page_summaries,
        "questions": questions,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OCR 2026 Jiangsu Gaokao math scan.")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--filename", default="2026\u9ad8\u8003\u6570\u5b66\u6c5f\u82cf\u5377.pdf")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--render-dir", type=Path, default=DEFAULT_RENDER_DIR)
    parser.add_argument("--pdftoppm", type=Path, default=DEFAULT_PDFTOPPM)
    parser.add_argument("--dpi", type=int, default=180)
    parser.add_argument("--min-score", type=float, default=0.5)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data = build(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
