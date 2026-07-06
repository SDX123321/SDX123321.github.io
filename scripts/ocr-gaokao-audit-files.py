import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from rapidocr_onnxruntime import RapidOCR


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT = REPO_ROOT / "src/data/gaokao-processing-audit.json"
DEFAULT_OUT = REPO_ROOT / "src/data/gaokao-2026-ocr-extracted.json"
DEFAULT_RENDER_DIR = REPO_ROOT / "tmp/gaokao-audit-ocr"
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

BASE_SPEC = importlib.util.spec_from_file_location(
    "gaokao_docx_base",
    REPO_ROOT / "scripts/extract-gaokao-docx.py",
)
BASE = importlib.util.module_from_spec(BASE_SPEC)
BASE_SPEC.loader.exec_module(BASE)

QUESTION_RE = re.compile(r"^(?P<num>\d{1,2})[．.、]\s*(?P<body>.*)")
QUESTION_INLINE_RE = re.compile(r"(?<!\d)(?P<num>\d{1,2})[．.、]\s*(?P<body>[^。？！]{2,})")
SECTION_RE = re.compile(r"^[一二三四五六七八九十]+[、.．]|^(选择题|填空题|解答题|单项选择题|多项选择题|阅读)")
SKIP_RE = re.compile(
    r"^(第\s*\d+\s*页|学科\s*网|绝密|注意事项|考试时间|满分|本试卷|答案|参考答案|解析)"
    r"|答题前|答卷前|作答选择题|回答选择题|考生务必|姓名|考生号|座位号|条形码|答题卡|"
    r"铅笔|橡皮|写在本试卷上无效|考试结束后"
)


def stable_id(parts: list[str]) -> str:
    digest = hashlib.sha1("\u241f".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"gaokao-2026-ocr-{digest}"


def canonical_key(item: dict) -> str:
    relative = item["relativePath"].replace("\\", "/").replace("补充/", "")
    return f"{item['subjectKey']}|{item['name']}|{relative.split('/')[-2:]}"


def choose_files(audit: dict, statuses: set[str], include_duplicates: bool) -> list[dict]:
    chosen: dict[str, dict] = {}
    for item in audit["files"]:
        if item["status"] not in statuses:
            continue
        if item["ext"] not in {".pdf", ".jpg", ".jpeg", ".png"}:
            continue
        if item["relativePath"].startswith("补充\\") and not include_duplicates:
            continue
        key = canonical_key(item)
        current = chosen.get(key)
        if not current or current["relativePath"].startswith("补充\\"):
            chosen[key] = item
    return sorted(chosen.values(), key=lambda item: (item["subjectKey"], item["relativePath"]))


def render_pdf(pdf_path: Path, render_dir: Path, pdftoppm: Path, dpi: int) -> list[Path]:
    if not pdftoppm.exists():
        raise FileNotFoundError(f"pdftoppm not found: {pdftoppm}")
    render_dir.mkdir(parents=True, exist_ok=True)
    page_count = len(PdfReader(str(pdf_path)).pages)
    safe = hashlib.sha1(str(pdf_path).encode("utf-8")).hexdigest()[:12]
    ascii_pdf = render_dir / f"{safe}.pdf"
    if not ascii_pdf.exists():
        shutil.copyfile(pdf_path, ascii_pdf)
    images = []
    for page_number in range(1, page_count + 1):
        prefix = render_dir / f"{safe}-page{page_number}"
        output = prefix.with_suffix(".png")
        if not output.exists():
            subprocess.run([
                str(pdftoppm),
                "-png",
                "-r",
                str(dpi),
                "-f",
                str(page_number),
                "-singlefile",
                str(ascii_pdf),
                str(prefix),
            ], check=True)
        images.append(output)
    return images


def reading_order(items: list[dict], row_tolerance: int = 14) -> list[dict]:
    rows = []
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


def ocr_image(ocr: RapidOCR, image_path: Path, min_score: float, split_columns: bool) -> list[dict]:
    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    crops = [("full", image)]
    if split_columns and width > 1100:
        crops = [
            ("left", image.crop((0, 0, width // 2 + 60, height))),
            ("right", image.crop((width // 2 - 60, 0, width, height))),
        ]
    lines = []
    for column_name, crop in crops:
        result, _ = ocr(crop)
        raw_items = []
        for box, text, score in result or []:
            if score < min_score:
                continue
            raw_items.append({
                "text": re.sub(r"\s+", " ", text.strip()),
                "score": round(float(score), 3),
                "top": round(min(point[1] for point in box), 1),
                "left": round(min(point[0] for point in box), 1),
                "column": column_name,
            })
        lines.extend(reading_order(raw_items))
    return [line for line in lines if line["text"]]


def question_type(number: int) -> str:
    if number <= 8:
        return "选择题"
    if number <= 14:
        return "填空题"
    return "解答题"


def split_questions(lines: list[dict]) -> list[dict]:
    questions = []
    current = None
    seen_section = False
    last_number = 0

    for line in lines:
        text = line["text"].strip()
        if not text or SKIP_RE.search(text):
            continue
        if SECTION_RE.search(text):
            seen_section = True
            continue
        match = QUESTION_RE.match(text)
        if not match and seen_section:
            inline = QUESTION_INLINE_RE.search(text)
            if inline and inline.start() <= 2:
                match = inline
        if match:
            number = int(match.group("num"))
            if number < last_number and last_number - number < 8:
                if current:
                    current["lines"].append(text)
                    current["scores"].append(line["score"])
                continue
            if current:
                questions.append(current)
            last_number = number
            body = match.group("body").strip()
            current = {
                "number": number,
                "type": question_type(number),
                "lines": [],
                "scores": [],
                "flags": ["ocr_scan", "needs_review"],
            }
            if body:
                current["lines"].append(body)
                current["scores"].append(line["score"])
            continue
        if current:
            current["lines"].append(text)
            current["scores"].append(line["score"])

    if current:
        questions.append(current)

    normalized = []
    for question in questions:
        prompt = "\n".join(question.pop("lines")).strip()
        if len(prompt) < 8:
            continue
        scores = question.pop("scores")
        average_score = round(sum(scores) / len(scores), 3) if scores else 0
        if average_score < 0.88:
            question["flags"].append("low_confidence")
        question["averageScore"] = average_score
        question["prompt"] = prompt
        normalized.append(question)
    return normalized


def extract_item(item: dict, args: argparse.Namespace, ocr: RapidOCR) -> dict:
    source_path = args.source_root / item["relativePath"]
    if item["ext"] == ".pdf":
        images = render_pdf(source_path, args.render_dir, args.pdftoppm, args.dpi)
    else:
        images = [source_path]

    all_lines = []
    pages = []
    for page_index, image_path in enumerate(images, 1):
        lines = ocr_image(ocr, image_path, args.min_score, args.split_columns)
        for line in lines:
            line["page"] = page_index
        all_lines.extend(lines)
        pages.append({
            "page": page_index,
            "image": str(image_path),
            "lines": len(lines),
        })

    questions = split_questions(all_lines)
    return {
        "year": 2026,
        "subject": item["subjectKey"],
        "subjectName": item["subjectName"],
        "source": item["name"],
        "relativePath": item["relativePath"],
        "role": item["role"],
        "status": "ocr-structured" if questions else "ocr-no-question-pattern",
        "pages": pages,
        "lines": len(all_lines),
        "questions": [
            {
                "id": stable_id([item["relativePath"], str(question["number"]), question["prompt"][:80]]),
                "number": question["number"],
                "questionType": question["type"],
                "prompt": question["prompt"],
                "answer": "",
                "solution": [],
                "quality": "review",
                "flags": question["flags"],
                "averageScore": question["averageScore"],
            }
            for question in questions
        ],
    }


def build(args: argparse.Namespace) -> dict:
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    statuses = set(args.statuses.split(","))
    candidates = choose_files(audit, statuses, args.include_duplicates)
    if args.limit:
        candidates = candidates[:args.limit]

    ocr = RapidOCR()
    files = []
    skipped = []
    for item in candidates:
        try:
            result = extract_item(item, args, ocr)
            if result["questions"]:
                files.append(result)
            else:
                skipped.append(result)
        except Exception as exc:
            skipped.append({
                "year": 2026,
                "subject": item["subjectKey"],
                "subjectName": item["subjectName"],
                "source": item["name"],
                "relativePath": item["relativePath"],
                "role": item["role"],
                "status": "error",
                "error": str(exc),
                "questions": [],
            })

    total_questions = sum(len(file["questions"]) for file in files)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRootLabel": audit["sourceRootLabel"],
        "scope": {
            "statuses": sorted(statuses),
            "dpi": args.dpi,
            "minScore": args.min_score,
            "splitColumns": args.split_columns,
            "limit": args.limit,
        },
        "summary": {
            "files": len(files),
            "questions": total_questions,
            "reviewQuestions": total_questions,
            "matchedQuestions": 0,
            "skippedFiles": len(skipped),
        },
        "files": files,
        "skipped": skipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="OCR remaining 2026 Gaokao PDF/image files from the audit manifest.")
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--source-root", type=Path, default=BASE.DEFAULT_SOURCE_ROOT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--render-dir", type=Path, default=DEFAULT_RENDER_DIR)
    parser.add_argument("--pdftoppm", type=Path, default=DEFAULT_PDFTOPPM)
    parser.add_argument("--statuses", default="needs-pdf-ocr,answer-pdf-needs-linking,needs-image-review")
    parser.add_argument("--dpi", type=int, default=160)
    parser.add_argument("--min-score", type=float, default=0.5)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--include-duplicates", action="store_true")
    parser.add_argument("--split-columns", action="store_true", default=True)
    args = parser.parse_args()

    data = build(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OCR extracted {data['summary']['questions']} questions from {data['summary']['files']} files")
    print(f"Skipped {data['summary']['skippedFiles']} files")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
