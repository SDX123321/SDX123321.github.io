import argparse
import hashlib
import importlib.util
import json
import re
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT = REPO_ROOT / "src/data/gaokao-processing-audit.json"
DEFAULT_OUT = REPO_ROOT / "src/data/gaokao-2026-residual-extracted.json"
DEFAULT_RENDER_DIR = REPO_ROOT / "tmp/gaokao-residual-ocr"

BASE_SPEC = importlib.util.spec_from_file_location(
    "gaokao_docx_base",
    REPO_ROOT / "scripts/extract-gaokao-docx.py",
)
BASE = importlib.util.module_from_spec(BASE_SPEC)
BASE_SPEC.loader.exec_module(BASE)

OCR_SPEC = importlib.util.spec_from_file_location(
    "gaokao_ocr_base",
    REPO_ROOT / "scripts/ocr-gaokao-audit-files.py",
)
OCR_BASE = importlib.util.module_from_spec(OCR_SPEC)
OCR_SPEC.loader.exec_module(OCR_BASE)

ANSWER_TOKEN_RE = re.compile(r"^(?P<number>\d{1,2})[.、．]\s*(?P<answer>.+)$")
BLANK_RE = re.compile(r"\b\d{1,2}\s*[._]{2,}|\b\d{1,2}\s*$")


def normalize_answer_token(answer: str) -> str:
    return answer.strip().replace("tomeet", "to meet")


def stable_id(parts: list[str]) -> str:
    digest = hashlib.sha1("\u241f".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"gaokao-2026-residual-{digest}"


def question_file(item: dict, questions: list[dict], source_type: str, note: str = "") -> dict:
    return {
        "year": 2026,
        "subject": item["subjectKey"],
        "subjectName": item["subjectName"],
        "source": item["name"],
        "relativePath": item["relativePath"],
        "role": item["role"],
        "sourceType": source_type,
        "note": note,
        "questions": questions,
    }


def normalize_text(lines: list[str]) -> str:
    return "\n".join(line.strip() for line in lines if line and line.strip()).strip()


def extract_answer_lines(lines: list[str]) -> dict[int, str]:
    answer_map: dict[int, str] = {}
    pending_number: int | None = None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        match = ANSWER_TOKEN_RE.match(line)
        if match:
            pending_number = int(match.group("number"))
            answer_map[pending_number] = normalize_answer_token(match.group("answer"))
            continue
        number_only = re.match(r"^(?P<number>\d{1,2})[.、．]?$", line)
        if number_only:
            pending_number = int(number_only.group("number"))
            answer_map.setdefault(pending_number, "")
            continue
        if pending_number and not answer_map.get(pending_number):
            answer_map[pending_number] = normalize_answer_token(line)
            pending_number = None
    return answer_map


def format_answer(answer_map: dict[int, str]) -> str:
    return "\n".join(f"{number}. {answer}" for number, answer in sorted(answer_map.items()) if answer)


def extract_text_cloze(item: dict, source_root: Path) -> dict:
    paragraphs = BASE.docx_paragraphs(source_root / item["relativePath"])
    answer_map = extract_answer_lines(paragraphs)
    if not answer_map:
        short_tail = [
            line.strip()
            for line in paragraphs
            if line.strip() and len(line.strip()) <= 40 and not BLANK_RE.search(line)
        ]
        if len(short_tail) >= 8:
            answers = short_tail[-10:]
            answer_map = {index + 1: normalize_answer_token(answer) for index, answer in enumerate(answers)}
    prompt_lines = []
    answer_values = set(answer_map.values())
    for line in paragraphs:
        if ANSWER_TOKEN_RE.match(line) or line.strip() in answer_values:
            continue
        prompt_lines.append(line)
    prompt = normalize_text(prompt_lines)
    answer = format_answer(answer_map)
    flags = ["fragment_source", "solution_not_found"]
    if answer:
        flags.append("answer_from_tail")
    else:
        flags.append("answer_not_found")
    return question_file(item, [{
        "id": stable_id([item["relativePath"], "text-cloze", prompt[:80]]),
        "number": 1,
        "questionType": "语法填空片段",
        "prompt": prompt,
        "answer": answer,
        "solution": [],
        "quality": "review",
        "flags": sorted(flags),
    }], "real-fragment", "DOCX fragment converted into one cloze item.")


def extract_passage_only(item: dict, source_root: Path) -> dict:
    paragraphs = BASE.docx_paragraphs(source_root / item["relativePath"])
    prompt = normalize_text(paragraphs)
    return question_file(item, [{
        "id": stable_id([item["relativePath"], "passage", prompt[:80]]),
        "number": 1,
        "questionType": "阅读材料片段",
        "prompt": prompt,
        "answer": "",
        "solution": [],
        "quality": "review",
        "flags": ["answer_not_found", "passage_only", "questions_not_in_source"],
    }], "real-fragment", "Source contains passage material but no numbered questions.")


def docx_media_images(path: Path, dest: Path) -> list[Path]:
    images: list[Path] = []
    with zipfile.ZipFile(path) as package:
        for name in package.namelist():
            lower = name.lower()
            if not name.startswith("word/media/") or not lower.endswith((".png", ".jpg", ".jpeg")):
                continue
            output = dest / Path(name).name
            output.write_bytes(package.read(name))
            images.append(output)
    return images


def extract_image_cloze(item: dict, source_root: Path, ocr: OCR_BASE.RapidOCR, min_score: float) -> dict:
    source_path = source_root / item["relativePath"]
    with tempfile.TemporaryDirectory() as tmp:
        image_dir = Path(tmp)
        images = docx_media_images(source_path, image_dir)
        image_texts = []
        for image in images:
            lines = OCR_BASE.ocr_image(ocr, image, min_score, False)
            image_texts.append([line["text"] for line in lines])

    prompt_lines = []
    answer_map: dict[int, str] = {}
    for lines in image_texts:
        local_answers = extract_answer_lines(lines)
        if local_answers and len(local_answers) >= 3:
            answer_map.update(local_answers)
            continue
        if any(BLANK_RE.search(line) for line in lines):
            prompt_lines.extend(lines)

    prompt = normalize_text(prompt_lines)
    answer = format_answer(answer_map)
    flags = ["docx_image_ocr", "fragment_source", "needs_review", "solution_not_found"]
    if answer:
        flags.append("answer_from_ocr_image")
    else:
        flags.append("answer_not_found")
    return question_file(item, [{
        "id": stable_id([item["relativePath"], "image-cloze", prompt[:80]]),
        "number": 1,
        "questionType": "语法填空图片片段",
        "prompt": prompt,
        "answer": answer,
        "solution": [],
        "quality": "review",
        "flags": sorted(flags),
    }], "real-ocr", "Image-only DOCX converted into one OCR cloze item.")


def extract_pdf_ocr(item: dict, args: argparse.Namespace, ocr: OCR_BASE.RapidOCR) -> dict:
    ocr_args = SimpleNamespace(
        source_root=args.source_root,
        render_dir=args.render_dir,
        pdftoppm=args.pdftoppm,
        dpi=args.dpi,
        min_score=args.min_score,
        split_columns=args.split_columns,
    )
    extracted = OCR_BASE.extract_item(item, ocr_args, ocr)
    extracted["sourceType"] = "real-ocr"
    return extracted


def skipped_item(item: dict, status: str, reason: str) -> dict:
    return {
        "source": item["name"],
        "relativePath": item["relativePath"],
        "subject": item["subjectKey"],
        "subjectName": item["subjectName"],
        "role": item["role"],
        "status": status,
        "reason": reason,
    }


def build(args: argparse.Namespace) -> dict:
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    residuals = [
        item for item in audit["files"]
        if item["status"] in {"needs-docx-extraction", "needs-pdf-ocr", "needs-image-review"}
    ]
    files = []
    skipped = []
    ocr = None

    for item in residuals:
        name = item["name"]
        if name == "必看更新资料.docx":
            skipped.append(skipped_item(item, "non-question-source", "Promotional update note, not an exam question or answer source."))
            continue
        if item["status"] == "needs-image-review" and item["role"] == "answer-or-analysis":
            skipped.append(skipped_item(item, "answer-source", "Answer image retained as a source artifact; no standalone question prompt."))
            continue
        if name == "全国一卷语法填空.docx":
            files.append(extract_text_cloze(item, args.source_root))
            continue
        if name == "全国一卷阅读理解D篇.docx":
            files.append(extract_passage_only(item, args.source_root))
            continue
        if item["ext"] == ".docx":
            ocr = ocr or OCR_BASE.RapidOCR()
            files.append(extract_image_cloze(item, args.source_root, ocr, args.min_score))
            continue
        if item["ext"] == ".pdf":
            ocr = ocr or OCR_BASE.RapidOCR()
            files.append(extract_pdf_ocr(item, args, ocr))

    total_questions = sum(len(item.get("questions") or []) for item in files)
    review_questions = sum(
        1
        for item in files
        for question in item.get("questions") or []
        if question.get("quality") == "review"
    )
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceRootLabel": audit["sourceRootLabel"],
        "scope": {
            "statuses": ["needs-docx-extraction", "needs-image-review", "needs-pdf-ocr"],
            "note": "Residual non-standard 2026 Gaokao sources: fragments, image-only DOCX, and duplicate scan PDF.",
        },
        "summary": {
            "files": len(files),
            "questions": total_questions,
            "reviewQuestions": review_questions,
            "matchedQuestions": total_questions - review_questions,
            "skipped": len(skipped),
        },
        "files": files,
        "skipped": skipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract residual non-standard 2026 Gaokao sources.")
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--source-root", type=Path, default=BASE.DEFAULT_SOURCE_ROOT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--render-dir", type=Path, default=DEFAULT_RENDER_DIR)
    parser.add_argument("--pdftoppm", type=Path, default=OCR_BASE.DEFAULT_PDFTOPPM)
    parser.add_argument("--dpi", type=int, default=160)
    parser.add_argument("--min-score", type=float, default=0.5)
    parser.add_argument("--split-columns", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()

    data = build(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {data['summary']['questions']} questions from {data['summary']['files']} residual files")
    print(f"Skipped {data['summary']['skipped']} non-question residual files")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
