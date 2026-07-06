import hashlib
import importlib.util
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "src/data"
AUDIT_PATH = DATA_DIR / "gaokao-processing-audit.json"
OUT_PATH = DATA_DIR / "gaokao-2026-answer-overrides.json"
WEB_ANSWER_SOURCES_PATH = DATA_DIR / "gaokao-2026-web-answer-sources.json"
FAMILY_ANSWER_ALIASES = {
    "math:全国数学I卷试题逐题规范解答": ["math:national1"],
    "math:数学江苏卷": ["math:全国数学I卷试题逐题规范解答"],
    "chinese:全国语文1卷": ["chinese:national1"],
}
PLACEHOLDER_CHINESE_SOURCE = "\u0032\u0030\u0032\u0036\u5e74\u666e\u901a\u9ad8\u7b49\u5b66\u6821\u62db\u751f\u5168\u56fd\u7edf\u4e00\u8003\u8bd5\u8bed\u6587\uff08\u65b0\u0049\uff09\u0020\u002e\u0070\u0064\u0066"
PLACEHOLDER_CHINESE_MARKERS = (
    "\u4eba\u5de5\u667a\u80fd\u6280\u672f\u5728\u533b\u7597",
    "\u79cb\u65e5\u6742\u611f",
    "\u5168\u6c11\u9605\u8bfb",
)
EXISTING_ANSWER_CORRECTION_TARGETS = {
    ("chemistry:heilongjiliao", "2026高考化学黑吉辽蒙卷.pdf"),
}
TRUSTED_CORRECTION_METHODS = {"ocr-answer-source", "web-answer-source"}
DATASETS = [
    "gaokao-2026-docx-extracted.json",
    "gaokao-2026-pdf-text-extracted.json",
    "gaokao-2026-ocr-extracted.json",
    "gaokao-2026-residual-extracted.json",
    "jiangsu-gaokao-ocr.json",
]

BASE_SPEC = importlib.util.spec_from_file_location(
    "gaokao_docx_base",
    REPO_ROOT / "scripts/extract-gaokao-docx.py",
)
BASE = importlib.util.module_from_spec(BASE_SPEC)
BASE_SPEC.loader.exec_module(BASE)

NUMBERED_RE = re.compile(r"^(?P<number>\d{1,2})[.．、]\s*(?P<body>.*)$")
INLINE_CHOICE_RE = re.compile(r"(?<!\d)(?P<number>\d{1,2})[.．、]\s*(?:\(\d+\s*分\)\s*)?(?P<answer>[A-D]{1,4}|[A-G]{1,7})(?=\s|$|[。；;，,])")
ANSWER_BLOCK_RE = re.compile(r"【答案】\s*(?P<answer>.*?)(?=【解析】|【详解】|【分析】|\n【解析】|\n【详解】|\n【分析】|$)", re.S)
SHORT_ANSWER_RE = re.compile(r"^[A-G]{1,7}$|^[A-D](?:[、,，]\s*[A-D])+$")
ANSWER_SKIP_RE = re.compile(r"注意事项|答题卡|考生|2B|铅笔|涂改液|试卷和答题卡|作答|姓名|考场号|座位号|考试结束")
OPEN_ENDED_WRITING_ANSWER = "开放性写作题，无唯一标准答案；请围绕材料要求立意、选材并展开论证。"
INCOMPLETE_SOURCE_ANSWER = "回忆版或不完全版题干、选项、图表信息缺失，无法可靠确定标准答案；待完整试卷或权威答案补全。"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_key(parts: list[str]) -> str:
    digest = hashlib.sha1("\u241f".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"gaokao-answer-{digest}"


def clean_text(text: str) -> str:
    text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    text = text.replace("\x00", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_numeric_extraction_fragment(question: dict) -> bool:
    prompt = clean_text(question.get("prompt", ""))
    if not prompt or question.get("options"):
        return False
    return bool(re.fullmatch(r"[\d\s.,，。:：;；\-+*/()（）\[\]{}<>《》=≈~～^_\\|√π%°]+", prompt))


def is_unnumbered_extraction_fragment(question: dict) -> bool:
    return number_value(question.get("number")) is None


def is_passage_only_extraction_fragment(question: dict) -> bool:
    return "passage_only" in (question.get("flags") or [])


def is_answer_analysis_extraction_fragment(question: dict) -> bool:
    prompt = clean_text(question.get("prompt", ""))
    if not prompt or question.get("options"):
        return False
    if re.match(r"^写作词数应为\s*\d+\s*(?:个)?左右\s*[:：;；。.]?$", prompt):
        return True
    if len(prompt) < 80 and "词数" in prompt and "注意" in prompt:
        return True
    if re.match(r"^(?:母本筛选|叙事重构|难度适配|留白定向)\s*[:：]", prompt):
        return True
    if re.search(r"写作思路指导|高分写作技巧|参考范文", prompt):
        return True
    return bool(re.search(r"\b(?:Yours|Yours sincerely),?\s+Li Hua\s*$", prompt, re.I))


def is_mixed_ocr_question_fragment(question: dict) -> bool:
    prompt = clean_text(question.get("prompt", ""))
    if all(marker in prompt for marker in ["V(NaOH)", "16.(15", "17.(14", "CH2Cl2"]):
        return True
    return question.get("number") == 12 and all(
        marker in prompt
        for marker in [
            "Kids Work Ethic Early",
            "I never thought I could be a writer",
            "Have you always wanted to be a __46",
        ]
    )


def is_english_continuation_ocr_fragment(question: dict) -> bool:
    prompt = clean_text(question.get("prompt", ""))
    if not prompt or question.get("options"):
        return False
    if "Slovik" not in prompt or "Chatham" not in prompt:
        return False
    return any(
        marker in prompt
        for marker in [
            "HaileySlovik",
            "The couple suggested",
            "Three days later",
            "续写开头",
        ]
    )


def should_import_extracted_question(question: dict) -> bool:
    return not (
        is_numeric_extraction_fragment(question)
        or is_unnumbered_extraction_fragment(question)
        or is_passage_only_extraction_fragment(question)
        or is_answer_analysis_extraction_fragment(question)
        or is_mixed_ocr_question_fragment(question)
        or is_english_continuation_ocr_fragment(question)
    )


def normalize_answer(answer: str) -> str:
    answer = clean_text(answer)
    answer = re.sub(r"^(答案|参考答案)[:：]?", "", answer).strip()
    if not answer or re.fullmatch(r"#+", answer):
        return ""
    return answer


def clean_answer_lines(lines: list[str]) -> str:
    cleaned = []
    for line in lines:
        line = clean_text(line)
        if not line:
            continue
        if re.search(r"第\s*\d+\s*页|学科\s*网|股份有限公司|参考答案|考试时间|满分", line) or ANSWER_SKIP_RE.search(line):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def is_open_ended_writing_question(record: dict) -> bool:
    if record.get("subject") != "chinese":
        return False
    prompt = clean_text(record.get("question", {}).get("prompt", ""))
    if not prompt:
        return False
    return (
        "根据要求写作" in prompt
        or ("写一篇" in prompt and re.search(r"不少于\s*800\s*字", prompt))
        or ("自拟标题" in prompt and "不得抄袭" in prompt)
    )


def extract_writing_solution(prompt: str) -> list[str]:
    if "试题分析" not in prompt:
        return []
    analysis = clean_text(prompt.split("试题分析")[-1])
    if not analysis:
        return []
    # OCR sources can duplicate pages; keep the source analysis useful without flooding cards.
    return [f"试题分析：{analysis[:900]}"]


def is_incomplete_source_question(record: dict) -> bool:
    source = record.get("file", {}).get("source", "")
    subject = record.get("subject")
    prompt = clean_text(record.get("question", {}).get("prompt", ""))
    if not prompt:
        return False
    if subject in {"biology", "politics"} and "回忆" in source:
        return True
    if subject == "geography" and "回忆" in source:
        return bool(re.search(r"本人答案|我的答案|未知选项|不记得|忘记|争议题目|仅供参考|QAQ|具体年代|恕我", prompt))
    if subject == "physics" and "如图所示" in prompt:
        return True
    if subject == "chinese" and "不完全版" in source:
        missing_context_markers = r"转码|加点|下点|画线|下列|方框|虚词|句读|译成|不正确的一项"
        return len(prompt) < 160 and bool(re.search(missing_context_markers, prompt))
    return False


def infer_subject(source: str, relative: str, fallback: str = "") -> str:
    text = f"{source} {relative}"
    if fallback and fallback != "unknown":
        return fallback
    subject_terms = [
        ("chinese", ["语文"]),
        ("math", ["数学"]),
        ("english", ["英语", "外语"]),
        ("physics", ["物理"]),
        ("chemistry", ["化学"]),
        ("biology", ["生物"]),
        ("politics", ["政治"]),
        ("history", ["历史"]),
        ("geography", ["地理"]),
    ]
    for key, terms in subject_terms:
        if any(term in text for term in terms):
            return key
    return fallback or "unknown"


def family_for(subject: str, source: str, relative: str = "") -> str:
    text = f"{source} {relative}"
    subject = infer_subject(source, relative, subject)
    if re.search(r"新高考\s*(?:II|Ⅱ|2|二)|全国\s*(?:II|Ⅱ|2|二)|新课标\s*(?:II|Ⅱ|2|二)|二卷|全国2|全国二", text, re.I):
        region = "national2"
    elif re.search(r"新高考\s*(?:I|Ⅰ|1|一)|全国\s*(?:I|Ⅰ|1|一)|新课标\s*(?:I|Ⅰ|1|一)|一卷|全国1|全国一", text, re.I):
        region = "national1"
    elif "上海" in text:
        region = "shanghai-spring" if "春季" in text or "春季招生" in text else "shanghai"
    elif "湖南" in text:
        region = "hunan"
    elif "云南" in text:
        region = "yunnan"
    elif "广东" in text:
        region = "guangdong"
    elif "北京" in text:
        region = "beijing"
    elif "天津" in text:
        region = "tianjin"
    elif "安徽" in text:
        region = "anhui"
    elif "河南" in text:
        region = "henan"
    elif "陕西" in text or "陕晋青宁" in text:
        region = "shanjinqingning"
    elif "黑吉辽蒙" in text or "黑吉辽" in text:
        region = "heilongjiliao"
    else:
        base = re.sub(r"\.[^.]+$", "", source)
        base = re.sub(r"(原卷版|解析版|答案版|纯答案版|网络|收集版|高清|完整版|试卷|真题|答案|解析|教师版|参考|回忆|2026|年|高考|普通高等学校招生全国统一考试|精品)", "", base)
        base = re.sub(r"\W+", "", base)
        region = base[:20] or "unknown"
    return f"{subject}:{region}"


def number_value(value) -> int | None:
    try:
        number = int(value)
        return number if 1 <= number <= 100 else None
    except Exception:
        return None


def is_ocr_answer_source_file(file_item: dict) -> bool:
    if file_item.get("role") != "answer-or-analysis":
        return False
    source_text = f"{file_item.get('source', '')} {file_item.get('relativePath', '')}"
    if re.search(r"答案版|解析|教师版", source_text):
        return True
    return any("【答案】" in (question.get("prompt") or "") for question in file_item.get("questions") or [])


def is_placeholder_chinese_file(file_item: dict) -> bool:
    if file_item.get("subject") != "chinese":
        return False
    if file_item.get("source") != PLACEHOLDER_CHINESE_SOURCE:
        return False
    prompts = "\n".join(question.get("prompt") or "" for question in file_item.get("questions") or [])
    return any(marker in prompts for marker in PLACEHOLDER_CHINESE_MARKERS)


def load_question_records(include_ocr_answer_sources: bool = False) -> list[dict]:
    records = []
    for dataset in DATASETS:
        data = load_json(DATA_DIR / dataset)
        if "files" in data:
            files = data.get("files") or []
        else:
            source = data.get("source") or {}
            files = [{
                "source": source.get("filename", dataset),
                "relativePath": source.get("relativePath", ""),
                "subject": source.get("subject", "math"),
                "subjectName": source.get("subjectName", "数学"),
                "questions": data.get("questions") or [],
            }]
        for file_item in files:
            if dataset == "gaokao-2026-ocr-extracted.json" and is_ocr_answer_source_file(file_item) and not include_ocr_answer_sources:
                continue
            if is_placeholder_chinese_file(file_item):
                continue
            subject = file_item.get("subject") or file_item.get("subjectKey") or "unknown"
            for question in file_item.get("questions") or []:
                if not should_import_extracted_question(question):
                    continue
                records.append({
                    "dataset": dataset,
                    "file": file_item,
                    "question": question,
                    "questionId": question.get("id") or stable_key([dataset, file_item.get("source", ""), str(question.get("number")), question.get("prompt", "")[:80]]),
                    "number": number_value(question.get("number")),
                    "subject": subject,
                    "family": family_for(subject, file_item.get("source", ""), file_item.get("relativePath", "")),
                })
    return records


def extract_answer_from_prompt(prompt: str) -> str:
    match = ANSWER_BLOCK_RE.search(prompt or "")
    if match:
        answer = normalize_answer(match.group("answer"))
        if answer:
            return answer
    match = re.search(r"(?:故选|答案为|选)\s*([A-D]{1,4})(?:[。．.，,]|$)", prompt or "")
    if match:
        return match.group(1)
    return ""


def is_answer_only_file(file_item: dict) -> bool:
    source = file_item.get("source", "")
    return "纯答案版" in source or "答案版" in source or re.search(r"答案(?:\)|）|$)", source)


def is_short_answer_prompt(prompt: str) -> bool:
    prompt = clean_text(prompt)
    return len(prompt) <= 120 and bool(SHORT_ANSWER_RE.search(prompt))


def add_candidate(answer_maps, family, number, answer, source, method, solution=None):
    if not family or not number or not answer:
        return
    answer = normalize_answer(answer)
    if not answer:
        return
    answer_maps[family][number].append({
        "answer": answer,
        "solution": solution or [],
        "source": source,
        "method": method,
    })


def parse_numbered_answers_from_lines(lines: list[str]) -> dict[int, str]:
    answer_map: dict[int, str] = {}

    content_start = 0
    for index, raw in enumerate(lines):
        line = clean_text(raw)
        if re.search(r"(^|\s)(一|二|三|四|五|六|七)[、\s]|第一部分|选择题|阅读[ⅠⅡI ]|空间科技|硝普钠|听力", line):
            if "注意事项" not in line:
                content_start = index
                break
    scoped_lines = lines[content_start:]

    joined = " ".join(clean_text(line) for line in scoped_lines)
    for match in INLINE_CHOICE_RE.finditer(joined):
        number = int(match.group("number"))
        answer_map.setdefault(number, match.group("answer"))

    current_number = None
    current_lines: list[str] = []
    for raw in scoped_lines:
        line = clean_text(raw)
        if not line:
            continue
        if re.search(r"第\s*\d+\s*页|学科\s*网|股份有限公司|参考答案|考试时间|满分", line) or ANSWER_SKIP_RE.search(line):
            continue
        match = NUMBERED_RE.match(line)
        if match:
            if current_number is not None and current_number not in answer_map:
                answer = clean_answer_lines(current_lines)
                if answer:
                    answer_map[current_number] = answer
            current_number = int(match.group("number"))
            current_lines = [match.group("body")]
            continue
        if current_number is not None and len(current_lines) < 12:
            current_lines.append(line)
    if current_number is not None and current_number not in answer_map:
        answer = clean_answer_lines(current_lines)
        if answer:
            answer_map[current_number] = answer
    return answer_map


def letter_sequence(text: str) -> list[str]:
    return list(re.sub(r"[^A-G]", "", text.upper()))


def add_sequence(answer_map: dict[int, str], start: int, sequence: list[str]) -> None:
    for offset, answer in enumerate(sequence):
        answer_map.setdefault(start + offset, answer)


def parse_english_answers(lines: list[str], family: str) -> dict[int, str]:
    answer_map: dict[int, str] = {}
    text = "\n".join(lines)

    listening = re.search(r"听力[：:]\s*([A-G\s]+?)(?=\d|阅读|$)", text, re.S)
    if listening:
        add_sequence(answer_map, 1, letter_sequence(listening.group(1))[:20])

    if "national1" in family:
        start_by_part = {"A": 21, "B": 24, "C": 28, "D": 32}
        for part, start in start_by_part.items():
            match = re.search(rf"{part}\s*篇\s*[:：]\s*([A-G]+)", text, re.I)
            if match:
                add_sequence(answer_map, start, letter_sequence(match.group(1)))
    else:
        reading = re.search(r"阅读[：:]\s*([A-G\s]+?)(?=七选五|完型|完形|语法|$)", text, re.S)
        if reading:
            add_sequence(answer_map, 21, letter_sequence(reading.group(1))[:15])

    seven = re.search(r"七选五\s*[:：]?\s*([A-G\s]+)", text)
    if seven:
        add_sequence(answer_map, 36, letter_sequence(seven.group(1))[:5])

    cloze = re.search(r"完[型形]填?空?\s*[:：]?\s*([A-G\s]+?)(?=语法|$)", text, re.S)
    if cloze:
        add_sequence(answer_map, 41, letter_sequence(cloze.group(1))[:15])

    grammar = re.findall(r"(?<!\d)(?:5[6-9]|6[0-5]|[1-9]|10)[.．、]\s*([A-Za-z][A-Za-z\s-]{0,40})", text)
    if grammar:
        start = 56 if any(str(number) in text for number in range(56, 66)) else 1
        for offset, answer in enumerate(grammar[:10]):
            answer_map.setdefault(start + offset, normalize_answer(answer))
    return answer_map


def read_answer_source_text(item: dict) -> list[str]:
    source_path = BASE.DEFAULT_SOURCE_ROOT / item["relativePath"]
    if item["ext"] == ".docx":
        return BASE.docx_paragraphs(source_path)
    if item["ext"] == ".pdf":
        reader = PdfReader(str(source_path))
        lines = []
        for page in reader.pages:
            text = page.extract_text() or ""
            lines.extend(text.splitlines())
        return lines
    return []


def build_answer_maps(records: list[dict]) -> dict[str, dict[int, list[dict]]]:
    answer_maps: dict[str, dict[int, list[dict]]] = defaultdict(lambda: defaultdict(list))

    for record in records:
        question = record["question"]
        file_item = record["file"]
        number = record["number"]
        if not number:
            continue
        answer = question.get("answer") or ""
        solution = question.get("solution") if isinstance(question.get("solution"), list) else []
        if answer:
            add_candidate(answer_maps, record["family"], number, answer, file_item.get("source", ""), "existing-question-answer", solution)
        elif is_answer_only_file(file_item) and is_short_answer_prompt(question.get("prompt", "")):
            add_candidate(answer_maps, record["family"], number, question.get("prompt", ""), file_item.get("source", ""), "answer-only-question")

        prompt_answer = extract_answer_from_prompt(question.get("prompt", ""))
        if prompt_answer:
            method = "ocr-answer-source" if record["dataset"] == "gaokao-2026-ocr-extracted.json" and is_ocr_answer_source_file(file_item) else "embedded-answer-in-prompt"
            add_candidate(answer_maps, record["family"], number, prompt_answer, file_item.get("source", ""), method)

    audit = load_json(AUDIT_PATH)
    seen_sources = set()
    for item in audit.get("files", []):
        if item.get("status") != "answer-source":
            continue
        if item["relativePath"] in seen_sources:
            continue
        seen_sources.add(item["relativePath"])
        try:
            lines = read_answer_source_text(item)
        except Exception:
            continue
        subject = infer_subject(item["name"], item["relativePath"], item.get("subjectKey", "unknown"))
        family = family_for(subject, item["name"], item["relativePath"])
        maps = parse_numbered_answers_from_lines(lines)
        if subject == "english":
            maps = {**maps, **parse_english_answers(lines, family)}
        for number, answer in maps.items():
            add_candidate(answer_maps, family, number, answer, item["relativePath"], "answer-source-file")

    if WEB_ANSWER_SOURCES_PATH.exists():
        web_sources = load_json(WEB_ANSWER_SOURCES_PATH)
        for source in web_sources.get("sources", []):
            family = source.get("family", "")
            source_url = source.get("pdfUrl") or source.get("pageUrl") or source.get("id", "")
            for item in source.get("answers", []):
                item_source = item.get("sourceUrl") or "; ".join(item.get("sourceUrls", [])) or source_url
                add_candidate(
                    answer_maps,
                    family,
                    number_value(item.get("number")),
                    item.get("answer", ""),
                    item_source,
                    "web-answer-source",
                )

    apply_family_answer_aliases(answer_maps)
    return answer_maps


def apply_family_answer_aliases(answer_maps: dict[str, dict[int, list[dict]]]) -> None:
    for target_family, source_families in FAMILY_ANSWER_ALIASES.items():
        for source_family in source_families:
            for number, source_candidates in answer_maps.get(source_family, {}).items():
                non_alias_candidates = [
                    item for item in source_candidates
                    if item.get("method") != "family-alias-answer"
                ]
                web_candidates = [item for item in non_alias_candidates if item.get("method") == "web-answer-source"]
                base_candidate = choose_candidate(web_candidates or non_alias_candidates)
                if not base_candidate:
                    continue
                answer_maps[target_family][number].append({
                    "answer": base_candidate["answer"],
                    "solution": base_candidate.get("solution") or [],
                    "source": f"{base_candidate.get('source', '')} via {source_family}".strip(),
                    "method": "family-alias-answer",
                })


def choose_candidate(candidates: list[dict]) -> dict | None:
    if not candidates:
        return None
    priority = {
        "embedded-answer-in-prompt": 0,
        "existing-question-answer": 1,
        "ocr-answer-source": 2,
        "answer-source-file": 3,
        "family-alias-answer": 4,
        "web-answer-source": 5,
        "answer-only-question": 6,
        "open-ended-writing": 7,
        "incomplete-source": 8,
    }
    return sorted(candidates, key=lambda item: (priority.get(item["method"], 9), len(item["answer"])))[0]


def choose_candidate_for_record(record: dict, candidates: list[dict]) -> dict | None:
    target = (record["family"], record["file"].get("source", ""))
    if target in EXISTING_ANSWER_CORRECTION_TARGETS:
        web_candidates = [candidate for candidate in candidates if candidate.get("method") == "web-answer-source"]
        if web_candidates:
            return choose_candidate(web_candidates)
    return choose_candidate(candidates)


def target_can_use_family_answer(record: dict) -> bool:
    question = record["question"]
    prompt = question.get("prompt", "")
    file_item = record["file"]
    if "passage_only" in (question.get("flags") or []):
        return False
    if record["subject"] != "english" and is_numeric_extraction_fragment(question):
        return False
    if record["subject"] == "english":
        number = record["number"] or 0
        if number <= 20:
            return bool(re.search(r"\bA[.．、]", prompt) and re.search(r"\bB[.．、]", prompt))
        if 21 <= number <= 55:
            return bool(re.search(r"\bA[.．、]", prompt) or "七选五" in prompt or "完形" in prompt)
        return "语法" in file_item.get("source", "") or "____" in prompt or "________" in prompt
    return True


def is_override_target_record(record: dict) -> bool:
    return not (
        record["dataset"] == "gaokao-2026-ocr-extracted.json"
        and is_ocr_answer_source_file(record["file"])
    )


def choose_existing_answer_correction(record: dict, answer_maps: dict[str, dict[int, list[dict]]]) -> dict | None:
    question = record["question"]
    existing_answer = normalize_answer(question.get("answer") or "")
    if not existing_answer or not record["number"]:
        return None
    target = (record["family"], record["file"].get("source", ""))
    if target not in EXISTING_ANSWER_CORRECTION_TARGETS:
        return None
    candidates = [
        candidate for candidate in answer_maps.get(record["family"], {}).get(record["number"], [])
        if candidate.get("method") in TRUSTED_CORRECTION_METHODS
    ]
    chosen = choose_candidate_for_record(record, candidates)
    if not chosen or normalize_answer(chosen["answer"]) == existing_answer:
        return None
    return {
        **chosen,
        "method": "correct-existing-answer",
        "answerSourceMethod": chosen.get("method"),
        "replacesAnswer": existing_answer,
    }


def build_overrides() -> dict:
    records = load_question_records(include_ocr_answer_sources=True)
    answer_maps = build_answer_maps(records)
    overrides = []
    by_method = Counter()
    by_dataset = Counter()
    correction_count = 0

    for record in records:
        if not is_override_target_record(record):
            continue
        question = record["question"]
        number = record["number"]
        if not number:
            continue

        replaces_answer = ""
        if question.get("answer"):
            chosen = choose_existing_answer_correction(record, answer_maps)
            if not chosen:
                continue
            replaces_answer = chosen.get("replacesAnswer", "")
        else:
            candidates = []
            prompt_answer = extract_answer_from_prompt(question.get("prompt", ""))
            if prompt_answer:
                candidates.append({
                    "answer": prompt_answer,
                    "solution": [],
                    "source": record["file"].get("source", ""),
                    "method": "embedded-answer-in-prompt",
                })
            if is_answer_only_file(record["file"]) and is_short_answer_prompt(question.get("prompt", "")):
                candidates.append({
                    "answer": question.get("prompt", ""),
                    "solution": [],
                    "source": record["file"].get("source", ""),
                    "method": "answer-only-question",
                })
            if is_open_ended_writing_question(record):
                candidates.append({
                    "answer": OPEN_ENDED_WRITING_ANSWER,
                    "solution": extract_writing_solution(question.get("prompt", "")),
                    "source": record["file"].get("source", ""),
                    "method": "open-ended-writing",
                })
            if is_incomplete_source_question(record):
                candidates.append({
                    "answer": INCOMPLETE_SOURCE_ANSWER,
                    "solution": [],
                    "source": record["file"].get("source", ""),
                    "method": "incomplete-source",
                })
            if target_can_use_family_answer(record):
                candidates.extend(answer_maps.get(record["family"], {}).get(number, []))

            chosen = choose_candidate_for_record(record, candidates)
            if not chosen:
                continue

        override = {
            "questionId": record["questionId"],
            "dataset": record["dataset"],
            "source": record["file"].get("source", ""),
            "relativePath": record["file"].get("relativePath", ""),
            "subject": record["subject"],
            "family": record["family"],
            "number": number,
            "answer": normalize_answer(chosen["answer"]),
            "solution": chosen.get("solution") or [],
            "method": chosen["method"],
            "answerSource": chosen["source"],
            "confidence": "local-heuristic",
        }
        if replaces_answer:
            override["replacesAnswer"] = replaces_answer
            if chosen.get("answerSourceMethod"):
                override["answerSourceMethod"] = chosen["answerSourceMethod"]
            correction_count += 1
        overrides.append(override)
        by_method[override["method"]] += 1
        by_dataset[override["dataset"]] += 1

    target_records = [record for record in records if is_override_target_record(record)]
    before_missing = sum(1 for record in target_records if not record["question"].get("answer"))
    override_ids = {item["questionId"] for item in overrides}
    after_missing = sum(
        1 for record in target_records
        if not record["question"].get("answer") and record["questionId"] not in override_ids
    )
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "datasets": DATASETS,
            "note": "Local answer overrides mined from parsed answers, OCR answer-source rows, answer-only files, answer-source DOCX/PDF files, reviewed family answer aliases, and reviewed web OCR/PDF answer maps. Applied when the raw question answer is empty, with narrowly scoped corrections for reviewed bad extractions; OCR answer-source reference rows are excluded from importable question coverage.",
            "familyAnswerAliases": FAMILY_ANSWER_ALIASES,
        },
        "summary": {
            "questionsScanned": len(target_records),
            "answerSourceRowsScanned": len(records) - len(target_records),
            "missingBeforeOverrides": before_missing,
            "overrides": len(overrides),
            "corrections": correction_count,
            "missingAfterOverrides": after_missing,
            "byMethod": dict(by_method),
            "byDataset": dict(by_dataset),
        },
        "overrides": overrides,
    }


def main() -> None:
    data = build_overrides()
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {data['summary']['overrides']} answer overrides")
    print(f"Missing before: {data['summary']['missingBeforeOverrides']}")
    print(f"Missing after: {data['summary']['missingAfterOverrides']}")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
