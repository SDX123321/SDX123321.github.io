import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIT = REPO_ROOT / "src/data/gaokao-processing-audit.json"
DEFAULT_OUT = REPO_ROOT / "src/data/gaokao-2026-docx-extracted.json"

EXTRACTOR_SPEC = importlib.util.spec_from_file_location(
    "gaokao_docx_base",
    REPO_ROOT / "scripts/extract-gaokao-docx.py",
)
BASE = importlib.util.module_from_spec(EXTRACTOR_SPEC)
EXTRACTOR_SPEC.loader.exec_module(BASE)

QUESTION_RE = re.compile(r"^(?P<num>\d{1,2})[．.、]\s*(?P<body>.*)")
RECALL_QUESTION_RE = re.compile(r"^第(?P<num>\d{1,2})题[：:]\s*(?P<body>.*)")
SECTION_RE = re.compile(r"^([一二三四五六七八九十]+、|（[一二三四五六七八九十]+）).*(选择题|填空题|解答题|阅读|作文|语法填空|分析)")
ANSWER_MARK_RE = re.compile(r"(【参考答案】|【答案】|参考答案[:：]|答案[:：]|答案预测[:：])\s*(?P<answer>.*)")
SOLUTION_MARK_RE = re.compile(r"(【解析】|【详解】|分析[:：]|考点[:：])\s*(?P<body>.*)")
NOISE_RE = re.compile(r"(答题前|答卷前|注意事项|考试结束后|保密|绝密|启用前)")


def stable_id(parts: list[str]) -> str:
    digest = hashlib.sha1("\u241f".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"gaokao-2026-docx-{digest}"


def normalize_name(name: str) -> str:
    return (
        name.replace("（原卷版）", "")
        .replace("（解析版）", "")
        .replace("（网络 收集版）", "")
        .replace("（网络收集版）", "")
        .replace("（纯答案版）", "")
        .replace("（参考版）", "")
        .replace(" ", "")
        .replace("　", "")
    )


def canonical_key(item: dict) -> str:
    relative = item["relativePath"].replace("\\", "/")
    relative = relative.replace("补充/", "")
    return f"{item['subjectKey']}|{normalize_name(item['name'])}|{relative.split('/')[-2:]}"


def choose_docx_files(audit: dict, statuses: set[str]) -> list[dict]:
    chosen: dict[str, dict] = {}
    for item in audit["files"]:
        if item["status"] not in statuses or item["ext"] != ".docx":
            continue
        key = canonical_key(item)
        current = chosen.get(key)
        if not current or current["relativePath"].startswith("补充\\"):
            chosen[key] = item
    return sorted(chosen.values(), key=lambda item: (item["subjectKey"], item["relativePath"]))


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
            score += 5
        if original_key and original_key in candidate_key:
            score += 3
        if candidate_key and candidate_key in original_key:
            score += 2
        if Path(candidate["relativePath"]).parent == Path(original["relativePath"]).parent:
            score += 2
        if score:
            scored.append((score, candidate))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored[0][1] if scored else None


def append_answer(question: dict, line: str) -> bool:
    match = ANSWER_MARK_RE.search(line)
    if not match:
        return False
    answer = match.group("answer").strip()
    if answer:
        question["answer"] = answer
    question["flags"].append("answer_from_source")
    return True


def append_solution(question: dict, line: str) -> bool:
    match = SOLUTION_MARK_RE.search(line)
    if not match:
        return False
    body = match.group("body").strip()
    if body:
        question["solution"].append(body)
    return True


def split_standard_questions(paragraphs: list[str], max_questions: int) -> list[dict]:
    questions: list[dict] = []
    current: dict | None = None
    seen_section = False

    for para in paragraphs:
        if SECTION_RE.search(para):
            seen_section = True
            continue
        if NOISE_RE.search(para):
            continue
        match = QUESTION_RE.match(para)
        if match and (seen_section or questions or current):
            if current:
                questions.append(current)
                if len(questions) >= max_questions:
                    return questions
            current = {
                "number": int(match.group("num")),
                "promptLines": [match.group("body").strip()],
                "answer": "",
                "solution": [],
                "flags": [],
            }
            append_answer(current, para)
            append_solution(current, para)
            continue
        if current:
            if QUESTION_RE.match(para):
                continue
            if append_answer(current, para) or append_solution(current, para):
                continue
            if len(current["promptLines"]) < 18:
                current["promptLines"].append(para)

    if current and len(questions) < max_questions:
        questions.append(current)
    return questions


def split_recall_questions(paragraphs: list[str], max_questions: int) -> list[dict]:
    questions: list[dict] = []
    current: dict | None = None

    for para in paragraphs:
        match = RECALL_QUESTION_RE.match(para)
        if match:
            if current:
                questions.append(current)
                if len(questions) >= max_questions:
                    return questions
            current = {
                "number": int(match.group("num")),
                "promptLines": [match.group("body").strip()],
                "answer": "",
                "solution": [],
                "flags": ["recall_source"],
            }
            continue
        if not current:
            continue
        if para.startswith("题目内容"):
            current["promptLines"].append(para)
        elif para.startswith("答案预测"):
            current["answer"] = para.split("：", 1)[-1].strip()
            current["flags"].append("answer_prediction")
        elif para.startswith("答案"):
            current["answer"] = para.split("：", 1)[-1].strip()
        elif para.startswith(("考点", "分析")):
            current["solution"].append(para)
        elif len(current["promptLines"]) < 8 and not para.startswith("说明"):
            current["promptLines"].append(para)

    if current and len(questions) < max_questions:
        questions.append(current)
    return questions


def normalize_question(raw: dict, file_item: dict, analysis_by_number: dict[int, dict]) -> dict:
    analysis = analysis_by_number.get(raw["number"])
    answer = raw.get("answer") or ""
    solution = list(raw.get("solution") or [])
    flags = list(raw.get("flags") or [])
    if analysis:
        if not answer and analysis.get("answer"):
            answer = analysis["answer"]
        if analysis.get("solution"):
            solution = [*solution, *analysis["solution"]]
        flags.extend(analysis.get("flags") or [])
    if not answer:
        flags.append("answer_not_found")
    if not solution:
        flags.append("solution_not_found")
    if "answer_prediction" in flags:
        flags.append("needs_answer_verification")
    prompt = "\n".join(line for line in raw["promptLines"] if line).strip()
    quality = "matched" if answer and solution and "answer_prediction" not in flags else "review"
    return {
        "id": stable_id([file_item["relativePath"], str(raw["number"]), prompt[:80]]),
        "number": raw["number"],
        "prompt": prompt,
        "answer": answer,
        "solution": solution[:8],
        "quality": quality,
        "flags": sorted(set(flags)),
    }


def extract_file(file_item: dict, source_root: Path, analysis_item: dict | None, max_questions: int) -> dict:
    source_path = source_root / file_item["relativePath"]
    paragraphs = BASE.docx_paragraphs(source_path)
    questions = split_standard_questions(paragraphs, max_questions)
    if len(questions) < 2:
        questions = split_recall_questions(paragraphs, max_questions)

    analysis_by_number: dict[int, dict] = {}
    if analysis_item and analysis_item["relativePath"] != file_item["relativePath"]:
        try:
            analysis_paras = BASE.docx_paragraphs(source_root / analysis_item["relativePath"])
            analysis_questions = split_standard_questions(analysis_paras, 120)
            if len(analysis_questions) < 2:
                analysis_questions = split_recall_questions(analysis_paras, 120)
            analysis_by_number = {item["number"]: item for item in analysis_questions}
        except Exception:
            analysis_by_number = {}

    normalized = [
        normalize_question(question, file_item, analysis_by_number)
        for question in questions[:max_questions]
        if "\n".join(question["promptLines"]).strip()
    ]
    return {
        "year": 2026,
        "subject": file_item["subjectKey"],
        "subjectName": file_item["subjectName"],
        "source": file_item["name"],
        "relativePath": file_item["relativePath"],
        "analysisSource": analysis_item["name"] if analysis_item else "",
        "analysisRelativePath": analysis_item["relativePath"] if analysis_item else "",
        "role": file_item["role"],
        "questions": normalized,
    }


def build(args: argparse.Namespace) -> dict:
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    statuses = set(args.statuses.split(","))
    files = choose_docx_files(audit, statuses)
    analysis_candidates = [
        item for item in audit["files"]
        if item["ext"] == ".docx" and item["role"] == "answer-or-analysis"
    ]

    extracted = []
    for file_item in files:
        if file_item["subjectKey"] == "unknown" and not args.include_unknown:
            continue
        try:
            extracted.append(extract_file(
                file_item,
                args.source_root,
                pair_analysis(file_item, analysis_candidates),
                args.questions_per_file,
            ))
        except Exception as exc:
            extracted.append({
                "year": 2026,
                "subject": file_item["subjectKey"],
                "subjectName": file_item["subjectName"],
                "source": file_item["name"],
                "relativePath": file_item["relativePath"],
                "role": file_item["role"],
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
            "includeUnknown": args.include_unknown,
        },
        "summary": {
            "files": len(extracted),
            "questions": total_questions,
            "reviewQuestions": review_questions,
            "matchedQuestions": total_questions - review_questions,
        },
        "files": extracted,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract structured 2026 Gaokao DOCX files from the audit manifest.")
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--source-root", type=Path, default=BASE.DEFAULT_SOURCE_ROOT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--statuses", default="needs-docx-extraction,answer-source,structured")
    parser.add_argument("--questions-per-file", type=int, default=24)
    parser.add_argument("--include-unknown", action="store_true")
    args = parser.parse_args()

    data = build(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {data['summary']['questions']} questions from {data['summary']['files']} files")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
