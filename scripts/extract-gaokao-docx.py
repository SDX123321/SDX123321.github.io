import argparse
import html
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


DEFAULT_SOURCE_ROOT = (
    Path("C:/Users/zzz/Desktop")
    / "\u53c2\u8003\u8d44\u6599"
    / "2026\u9ad8\u8003\u8bd5\u5377\uff08\u66f4\u65b0\u4e2d\uff09"
)

DEFAULT_INDEX = Path("src/data/jiangsu-gaokao-index.json")
DEFAULT_OUT = Path("src/data/jiangsu-gaokao-extracted.json")

TEXT_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MATH_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"

QUESTION_RE = re.compile(r"^(?P<num>\d{1,2})[．.、]\s*(?P<body>.*)")
SECTION_RE = re.compile(r"^[一二三四五六七八九十]+、|^(选择题|填空题|解答题|单项选择题|多项选择题)")
INSTRUCTION_RE = re.compile(r"(答题前|答卷前|作答选择题|本试卷共|考试结束后|请务必将自己的姓名|注意事项)")


def docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as package:
      xml = package.read("word/document.xml")

    root = ET.fromstring(xml)
    paragraphs: list[str] = []

    for para in root.iter(f"{TEXT_NS}p"):
        parts: list[str] = []
        for node in para.iter():
            if node.tag == f"{TEXT_NS}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{TEXT_NS}tab":
                parts.append("\t")
            elif node.tag == f"{TEXT_NS}br":
                parts.append("\n")
            elif node.tag in {f"{MATH_NS}oMath", f"{MATH_NS}oMathPara"}:
                if not parts or parts[-1] != "[公式]":
                    parts.append("[公式]")
        text = html.unescape("".join(parts)).strip()
        text = re.sub(r"\s+", " ", text)
        if text:
            paragraphs.append(text)
    return paragraphs


def split_questions(paragraphs: list[str], max_questions: int) -> list[dict]:
    questions: list[dict] = []
    current: dict | None = None
    seen_section = False

    for para in paragraphs:
        if SECTION_RE.match(para):
            seen_section = True
            continue
        if not seen_section:
            continue
        if INSTRUCTION_RE.search(para):
            continue
        match = QUESTION_RE.match(para)
        if match:
            if current:
                questions.append(current)
                if len(questions) >= max_questions:
                    return questions
            current = {
                "number": int(match.group("num")),
                "text": match.group("body").strip(),
                "extra": [],
            }
            continue
        if current and len(current["extra"]) < 10:
            current["extra"].append(para)

    if current and len(questions) < max_questions:
        questions.append(current)
    return questions


def quality_flags(question: dict) -> list[str]:
    joined = " ".join([question["text"], *question["extra"]])
    flags: list[str] = []
    if "[公式]" in joined:
        flags.append("contains_formula_placeholder")
    if re.search(r"A[．.]?\s*B[．.]?\s*C[．.]?\s*D[．.]?$", joined):
        flags.append("formula_options_missing")
    if re.search(r"（\s*）", joined) and not re.search(r"A[．.、]\s*\S", joined):
        flags.append("options_may_be_missing")
    if len(joined) < 20:
        flags.append("too_short")
    if "（" in joined and "）" in joined and not re.search(r"[A-D][．.、]", joined):
        flags.append("options_may_be_missing")
    return sorted(set(flags))


def choose_source_files(index: dict, subjects: set[str], years: set[int], limit: int) -> list[dict]:
    chosen: list[dict] = []
    for year in index["years"]:
        if years and year not in years:
            continue
        for subject in index["subjects"]:
            if subjects and subject["key"] not in subjects:
                continue
            cell = index["matrix"][str(year)][subject["key"]]
            originals = [
                sample for sample in cell["samples"]
                if sample["status"] == "extractable" and sample["role"] == "original"
            ]
            analyses = [
                sample for sample in cell["samples"]
                if sample["status"] == "extractable" and sample["role"] == "analysis"
            ]
            for sample in originals[:1]:
                analysis_sample = find_matching_analysis(sample, analyses)
                chosen.append({
                    "year": year,
                    "subject": subject["key"],
                    "subjectName": subject["name"],
                    "sample": sample,
                    "analysisSample": analysis_sample,
                })
                break
            if len(chosen) >= limit:
                return chosen
    return chosen


def normalize_pair_name(name: str) -> str:
    return (
        name.replace("（空白卷）", "")
        .replace("（原卷版）", "")
        .replace("（原卷）", "")
        .replace("（解析卷）", "")
        .replace("（解析版）", "")
        .replace(" ", "")
    )


def find_matching_analysis(original: dict, analyses: list[dict]) -> dict | None:
    original_key = normalize_pair_name(original["name"])
    for sample in analyses:
        if normalize_pair_name(sample["name"]) == original_key:
            return sample
    return analyses[0] if analyses else None


def extract_answer_and_solution(analysis_question: dict | None) -> tuple[str, list[str], list[str]]:
    if not analysis_question:
        return "", [], ["analysis_not_found"]

    lines = [analysis_question["text"], *analysis_question["extra"]]
    answer = ""
    solution: list[str] = []
    flags: list[str] = []
    in_solution = False

    for line in lines:
        answer_match = re.search(r"【答案】\s*([^【]+)", line)
        if answer_match:
            answer = answer_match.group(1).strip()
            continue
        if "【解析】" in line or "【详解】" in line:
            cleaned = re.sub(r"【解析】|【详解】", "", line).strip()
            if cleaned:
                solution.append(cleaned)
            in_solution = True
            continue
        if in_solution:
            if re.match(r"^(故选|答案选|故答案为|综上)", line) or len(solution) < 8:
                solution.append(line)

    if not answer:
        flags.append("answer_not_found")
    if not solution:
        flags.append("solution_not_found")
    if any("[公式]" in item for item in [answer, *solution]):
        flags.append("analysis_formula_placeholder")

    return answer, solution[:8], sorted(set(flags))


def build(args: argparse.Namespace) -> dict:
    index = json.loads(args.index.read_text(encoding="utf-8"))
    subjects = set(args.subjects.split(",")) if args.subjects else set()
    years = {int(item) for item in args.years.split(",")} if args.years else set()
    files = choose_source_files(index, subjects, years, args.file_limit)

    extracted: list[dict] = []
    for item in files:
        path = args.source_root / item["sample"]["relativePath"]
        if not path.exists():
            continue
        analysis_by_number = {}
        analysis_sample = item.get("analysisSample")
        if analysis_sample:
            analysis_path = args.source_root / analysis_sample["relativePath"]
            if analysis_path.exists():
                try:
                    analysis_questions = split_questions(docx_paragraphs(analysis_path), 80)
                    analysis_by_number = {question["number"]: question for question in analysis_questions}
                except Exception:
                    analysis_by_number = {}
        try:
            paragraphs = docx_paragraphs(path)
            questions = split_questions(paragraphs, args.questions_per_file)
        except Exception as exc:
            extracted.append({
                "year": item["year"],
                "subject": item["subject"],
                "subjectName": item["subjectName"],
                "source": item["sample"]["name"],
                "relativePath": item["sample"]["relativePath"],
                "analysisSource": analysis_sample["name"] if analysis_sample else "",
                "analysisRelativePath": analysis_sample["relativePath"] if analysis_sample else "",
                "error": str(exc),
                "questions": [],
            })
            continue

        normalized = []
        for question in questions:
            flags = quality_flags(question)
            answer, solution, analysis_flags = extract_answer_and_solution(analysis_by_number.get(question["number"]))
            all_flags = sorted(set([*flags, *analysis_flags]))
            normalized.append({
                "number": question["number"],
                "prompt": "\n".join([question["text"], *question["extra"]]).strip(),
                "answer": answer,
                "solution": solution,
                "quality": "review" if all_flags else "matched",
                "flags": all_flags,
            })
        extracted.append({
            "year": item["year"],
            "subject": item["subject"],
            "subjectName": item["subjectName"],
            "source": item["sample"]["name"],
            "relativePath": item["sample"]["relativePath"],
            "analysisSource": analysis_sample["name"] if analysis_sample else "",
            "analysisRelativePath": analysis_sample["relativePath"] if analysis_sample else "",
            "questions": normalized,
        })

    total_questions = sum(len(item["questions"]) for item in extracted)
    review_questions = sum(
        1
        for item in extracted
        for question in item["questions"]
        if question["quality"] == "review"
    )
    return {
        "generatedAt": index["generatedAt"],
        "sourceRootLabel": index["sourceRootLabel"],
        "scope": {
            "subjects": sorted(subjects) if subjects else "all",
            "years": sorted(years) if years else "all",
            "fileLimit": args.file_limit,
            "questionsPerFile": args.questions_per_file,
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
    parser = argparse.ArgumentParser(description="Extract candidate question text from indexed Gaokao DOCX files.")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--subjects", default="chinese,math,english,physics,chemistry,biology,politics,history,geography")
    parser.add_argument("--years", default="2020,2021,2022,2023,2024,2025")
    parser.add_argument("--file-limit", type=int, default=48)
    parser.add_argument("--questions-per-file", type=int, default=2)
    args = parser.parse_args()

    data = build(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {data['summary']['questions']} candidate questions from {data['summary']['files']} files")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
