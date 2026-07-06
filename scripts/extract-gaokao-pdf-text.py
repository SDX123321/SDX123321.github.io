import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path

from pypdf import PdfReader


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT = REPO_ROOT / "src/data/gaokao-processing-audit.json"
DEFAULT_OUT = REPO_ROOT / "src/data/gaokao-2026-pdf-text-extracted.json"

EXTRACTOR_SPEC = importlib.util.spec_from_file_location(
    "gaokao_docx_base",
    REPO_ROOT / "scripts/extract-gaokao-docx.py",
)
BASE = importlib.util.module_from_spec(EXTRACTOR_SPEC)
EXTRACTOR_SPEC.loader.exec_module(BASE)

QUESTION_LINE_RE = re.compile(r"^(?P<num>\d{1,2})[．.、]\s*(?P<body>.+)")
ANSWER_MARK_RE = re.compile(r"(【答案】|参考答案[:：]?|答案[:：]?|故答案为[:：]?)\s*(?P<answer>[^【\n]*)")
SOLUTION_MARK_RE = re.compile(r"(【解析】|【详解】|解析[:：]|详解[:：])\s*(?P<body>.*)")
SECTION_RE = re.compile(r"(选择题|填空题|解答题|阅读|作文|语法填空|完形填空|一、|二、|三、)")
HEADER_RE = re.compile(r"^(第\s*\d+\s*页|学科\s*网|绝密|注意事项|本试卷|考试时间|满分|可能用到|参考公式)")


def stable_id(parts: list[str]) -> str:
    digest = hashlib.sha1("\u241f".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"gaokao-2026-pdf-{digest}"


def normalize_name(name: str) -> str:
    return (
        name.replace("（答案版）", "")
        .replace("（解析版）", "")
        .replace("解析", "")
        .replace("答案", "")
        .replace("教师版", "")
        .replace("试题", "")
        .replace("试卷", "")
        .replace("高清", "")
        .replace(" ", "")
        .replace("　", "")
        .replace(".pdf", "")
    )


def is_answer_only_pdf(item: dict) -> bool:
    name = item["name"]
    if item["role"] != "answer-or-analysis":
        return False
    rich_answer_source = re.search(r"(答案版|解析版|教师版|规范解答|试卷解析|真题)", name)
    return not rich_answer_source


def canonical_key(item: dict) -> str:
    relative = item["relativePath"].replace("\\", "/").replace("补充/", "")
    return f"{item['subjectKey']}|{normalize_name(item['name'])}|{relative.split('/')[-2:]}"


def choose_pdf_files(audit: dict, statuses: set[str]) -> list[dict]:
    chosen: dict[str, dict] = {}
    for item in audit["files"]:
        if item["status"] not in statuses or item["ext"] != ".pdf":
            continue
        key = canonical_key(item)
        current = chosen.get(key)
        if not current or current["relativePath"].startswith("补充\\"):
            chosen[key] = item
    return sorted(chosen.values(), key=lambda item: (item["subjectKey"], item["relativePath"]))


def extract_pdf_text(path: Path) -> tuple[str, int, list[int]]:
    reader = PdfReader(str(path))
    page_lengths = []
    chunks = []
    for page in reader.pages:
        text = page.extract_text() or ""
        page_lengths.append(len(text.strip()))
        chunks.append(text)
    return "\n".join(chunks), len(reader.pages), page_lengths


def text_lines(text: str) -> list[str]:
    lines = []
    for raw in text.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line or HEADER_RE.search(line):
            continue
        lines.append(line)
    return lines


def add_answer_and_solution(question: dict, line: str) -> bool:
    handled = False
    answer_match = ANSWER_MARK_RE.search(line)
    if answer_match:
        answer = answer_match.group("answer").strip()
        if answer:
            question["answer"] = answer
        question["flags"].append("answer_from_pdf")
        handled = True
    solution_match = SOLUTION_MARK_RE.search(line)
    if solution_match:
        body = solution_match.group("body").strip()
        if body:
            question["solution"].append(body)
        handled = True
    return handled


def split_questions(lines: list[str], max_questions: int) -> list[dict]:
    questions = []
    current = None
    seen_section = False

    for line in lines:
        if SECTION_RE.search(line):
            seen_section = True
        match = QUESTION_LINE_RE.match(line)
        if match and (seen_section or current or questions):
            number = int(match.group("num"))
            if number > 80:
                continue
            if current:
                questions.append(current)
                if len(questions) >= max_questions:
                    return questions
            current = {
                "number": number,
                "promptLines": [match.group("body").strip()],
                "answer": "",
                "solution": [],
                "flags": [],
            }
            add_answer_and_solution(current, line)
            continue
        if not current:
            continue
        if add_answer_and_solution(current, line):
            continue
        if len(current["promptLines"]) < 22:
            current["promptLines"].append(line)

    if current and len(questions) < max_questions:
        questions.append(current)
    return questions


def parse_answer_map(lines: list[str]) -> dict[int, str]:
    answer_map: dict[int, str] = {}
    joined = " ".join(lines)
    for number, answer in re.findall(r"(?<!\d)(\d{1,2})[．.、]?\s*[:：]?\s*([A-D]{1,4})(?![a-zA-Z])", joined):
        value = int(number)
        if 1 <= value <= 80 and value not in answer_map:
            answer_map[value] = answer
    return answer_map


def pair_analysis(original: dict, candidates: list[dict]) -> dict | None:
    if original["role"] == "answer-or-analysis":
        return original
    original_key = normalize_name(original["name"])
    scored = []
    for candidate in candidates:
        if candidate["subjectKey"] != original["subjectKey"]:
            continue
        candidate_key = normalize_name(candidate["name"])
        score = 0
        if candidate_key == original_key:
            score += 6
        if original_key in candidate_key or candidate_key in original_key:
            score += 3
        if Path(candidate["relativePath"]).parent == Path(original["relativePath"]).parent:
            score += 2
        if score:
            scored.append((score, candidate))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored[0][1] if scored else None


def normalize_question(raw: dict, file_item: dict, answer_map: dict[int, str]) -> dict:
    prompt = "\n".join(line for line in raw["promptLines"] if line).strip()
    answer = raw.get("answer") or answer_map.get(raw["number"], "")
    solution = list(raw.get("solution") or [])
    flags = list(raw.get("flags") or [])
    if not answer:
        flags.append("answer_not_found")
    if not solution:
        flags.append("solution_not_found")
    if len(prompt) < 12:
        flags.append("prompt_too_short")
    quality = "matched" if answer and solution else "review"
    return {
        "id": stable_id([file_item["relativePath"], str(raw["number"]), prompt[:80]]),
        "number": raw["number"],
        "prompt": prompt,
        "answer": answer,
        "solution": solution[:8],
        "quality": quality,
        "flags": sorted(set(flags)),
    }


def extract_file(file_item: dict, source_root: Path, analysis_item: dict | None, max_questions: int, min_chars: int) -> dict:
    source_path = source_root / file_item["relativePath"]
    text, pages, page_lengths = extract_pdf_text(source_path)
    lines = text_lines(text)
    raw_questions = split_questions(lines, max_questions)
    answer_map = parse_answer_map(lines)
    analysis_summary = None

    if analysis_item and analysis_item["relativePath"] != file_item["relativePath"]:
        try:
            analysis_text, analysis_pages, analysis_lengths = extract_pdf_text(source_root / analysis_item["relativePath"])
            analysis_lines = text_lines(analysis_text)
            answer_map = {**parse_answer_map(analysis_lines), **answer_map}
            analysis_summary = {
                "pages": analysis_pages,
                "textChars": sum(analysis_lengths),
                "answerCount": len(answer_map),
            }
        except Exception as exc:
            analysis_summary = { "error": str(exc) }

    questions = []
    if not is_answer_only_pdf(file_item):
        for question in raw_questions:
            normalized = normalize_question(question, file_item, answer_map)
            if normalized["prompt"] and "prompt_too_short" not in normalized["flags"]:
                questions.append(normalized)
    text_chars = sum(page_lengths)
    if questions:
        status = "structured"
    elif is_answer_only_pdf(file_item):
        status = "answer-map-only"
    else:
        status = "text-too-short" if text_chars < min_chars else "no-question-pattern"
    return {
        "year": 2026,
        "subject": file_item["subjectKey"],
        "subjectName": file_item["subjectName"],
        "source": file_item["name"],
        "relativePath": file_item["relativePath"],
        "analysisSource": analysis_item["name"] if analysis_item else "",
        "analysisRelativePath": analysis_item["relativePath"] if analysis_item else "",
        "role": file_item["role"],
        "status": status,
        "pdfPages": pages,
        "textChars": text_chars,
        "pageTextChars": page_lengths,
        "analysisSummary": analysis_summary,
        "questions": questions,
    }


def build(args: argparse.Namespace) -> dict:
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    statuses = set(args.statuses.split(","))
    files = choose_pdf_files(audit, statuses)
    analysis_candidates = [item for item in files if item["role"] == "answer-or-analysis"]

    extracted = []
    skipped = []
    for file_item in files:
        if file_item["relativePath"].startswith("补充\\") and not args.include_duplicates:
            continue
        try:
            result = extract_file(
                file_item,
                args.source_root,
                pair_analysis(file_item, analysis_candidates),
                args.questions_per_file,
                args.min_chars,
            )
            if result["questions"]:
                extracted.append(result)
            else:
                skipped.append(result)
        except Exception as exc:
            skipped.append({
                "year": 2026,
                "subject": file_item["subjectKey"],
                "subjectName": file_item["subjectName"],
                "source": file_item["name"],
                "relativePath": file_item["relativePath"],
                "role": file_item["role"],
                "status": "error",
                "error": str(exc),
                "questions": [],
            })

    total_questions = sum(len(item["questions"]) for item in extracted)
    review_questions = sum(
        1
        for item in extracted
        for question in item["questions"]
        if question["quality"] == "review"
    )
    return {
        "generatedAt": audit["generatedAt"],
        "sourceRootLabel": audit["sourceRootLabel"],
        "scope": {
            "statuses": sorted(statuses),
            "questionsPerFile": args.questions_per_file,
            "minChars": args.min_chars,
        },
        "summary": {
            "files": len(extracted),
            "questions": total_questions,
            "reviewQuestions": review_questions,
            "matchedQuestions": total_questions - review_questions,
            "skippedFiles": len(skipped),
        },
        "files": extracted,
        "skipped": skipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text-layer 2026 Gaokao PDFs from the audit manifest.")
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--source-root", type=Path, default=BASE.DEFAULT_SOURCE_ROOT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--statuses", default="needs-pdf-ocr,answer-pdf-needs-linking")
    parser.add_argument("--questions-per-file", type=int, default=40)
    parser.add_argument("--min-chars", type=int, default=250)
    parser.add_argument("--include-duplicates", action="store_true")
    args = parser.parse_args()

    data = build(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {data['summary']['questions']} questions from {data['summary']['files']} PDFs")
    print(f"Skipped {data['summary']['skippedFiles']} PDFs")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
