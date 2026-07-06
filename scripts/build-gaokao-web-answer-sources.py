import json
import re
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader
from PIL import Image
from rapidocr_onnxruntime import RapidOCR


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "src/data"
OUT_PATH = DATA_DIR / "gaokao-2026-web-answer-sources.json"
CACHE_DIR = REPO_ROOT / "tmp/gaokao-web-answer-ocr"

SOURCES = [
    {
        "id": "gaokzx-anhui-biology-2026",
        "family": "biology:anhui",
        "title": "2026年高考安徽生物试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156352.html",
    },
    {
        "id": "gaokzx-yunnan-chemistry-2026",
        "family": "chemistry:yunnan",
        "title": "2026年高考云南化学试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156668.html",
    },
    {
        "id": "gaokzx-hunan-history-2026",
        "family": "history:hunan",
        "title": "2026年高考湖南卷历史试题及答案（全）",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156388.html",
    },
    {
        "id": "gaokzx-national1-english-2026",
        "family": "english:national1",
        "title": "2026年高考全国I卷英语试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156349.html",
    },
    {
        "id": "gaokzx-national1-chinese-2026",
        "family": "chinese:national1",
        "title": "2026年高考全国I卷语文试题及答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156295.html",
    },
    {
        "id": "gaokzx-beijing-math-answer-2026",
        "family": "math:beijing",
        "title": "2026年北京高考数学试卷参考答案",
        "pageUrl": "https://www.gaokzx.com/gk/shitiku/156470.html",
        "pdfUrl": "https://cdn.xschu.com/zixunzhan/1781596760729%E3%80%8A2026%E5%B9%B4%E5%8C%97%E4%BA%AC%E9%AB%98%E8%80%83%E6%95%B0%E5%AD%A6%E8%AF%95%E5%8D%B7%E3%80%8B%E5%8F%82%E8%80%83%E7%AD%94%E6%A1%88.pdf",
        "sourceName": "北京高考在线",
    },
]


def read_url(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def source_image_urls(page_url: str) -> list[str]:
    html = read_url(page_url).decode("utf-8", "ignore")
    urls = []
    for match in re.finditer(r"(?:https?:)?//cdn\.gaokzx\.com/zixunzhan/_[^\"'<> ]+?\.png", html):
        url = match.group(0)
        if url.startswith("//"):
            url = "https:" + url
        if not re.search(r"/_\d+_\d+\.png$", url):
            continue
        if url not in urls:
            urls.append(url)
    return urls


def cache_key(source_id: str, image_url: str) -> Path:
    suffix = re.sub(r"[^A-Za-z0-9]+", "-", image_url.rsplit("/", 1)[-1]).strip("-")
    return CACHE_DIR / source_id / f"{suffix}.json"


def pdf_cache_path(source_id: str) -> Path:
    return CACHE_DIR / source_id / "source.pdf"


def ocr_image(ocr: RapidOCR, source_id: str, image_url: str) -> list[dict]:
    cache_path = cache_key(source_id, image_url)
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(BytesIO(read_url(image_url))).convert("RGB")
    result, _ = ocr(image)
    items = []
    for box, text, score in result or []:
        text = re.sub(r"\s+", " ", text.strip())
        if not text or score < 0.5:
            continue
        items.append({
            "text": text,
            "score": round(float(score), 3),
            "top": round(min(point[1] for point in box), 1),
            "left": round(min(point[0] for point in box), 1),
        })
    cache_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return items


def pdf_text_lines(source_id: str, pdf_url: str) -> list[str]:
    cache_path = pdf_cache_path(source_id)
    if not cache_path.exists():
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(read_url(pdf_url))
    reader = PdfReader(str(cache_path))
    lines = []
    for page in reader.pages:
        text = page.extract_text() or ""
        for line in text.splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if line:
                lines.append(line)
    return lines


def row_lines(items: list[dict], tolerance: int = 16) -> list[str]:
    rows = []
    for item in sorted(items, key=lambda value: (value["top"], value["left"])):
        for row in rows:
            if abs(row["top"] - item["top"]) <= tolerance:
                row["items"].append(item)
                row["top"] = min(row["top"], item["top"])
                break
        else:
            rows.append({"top": item["top"], "items": [item]})
    lines = []
    for row in sorted(rows, key=lambda value: value["top"]):
        parts = [item["text"] for item in sorted(row["items"], key=lambda value: value["left"])]
        line = re.sub(r"\s+", " ", " ".join(parts)).strip()
        if line:
            lines.append(line)
    return lines


def parse_choice_tables(page_items: list[dict]) -> dict[int, str]:
    answers = {}
    for heading in [item for item in page_items if "题号" in item["text"]]:
        numbers = []
        choices = []
        for item in page_items:
            if item["top"] < heading["top"] - 20 or item["top"] > heading["top"] + 110:
                continue
            text = item["text"].strip()
            if re.fullmatch(r"\d{1,2}", text):
                number = int(text)
                if 1 <= number <= 100:
                    numbers.append({"number": number, "left": item["left"]})
            elif item["top"] > heading["top"] + 20 and re.fullmatch(r"[A-G]", text):
                choices.append({"answer": text, "left": item["left"]})
        used = set()
        for number_item in numbers:
            ranked = sorted(
                ((abs(choice["left"] - number_item["left"]), index, choice) for index, choice in enumerate(choices) if index not in used),
                key=lambda value: value[0],
            )
            if ranked and ranked[0][0] <= 45:
                _, index, choice = ranked[0]
                used.add(index)
                answers.setdefault(number_item["number"], choice["answer"])
    return answers


def clean_answer(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"^【答案】", "", text)
    text = re.sub(r"^[:：]\s*", "", text)
    return text.strip()


def parse_written_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        match = re.match(r"^(?P<number>\d{1,2})[.．]\s*【答案】\s*(?P<body>.*)$", line)
        if match:
            flush()
            current_number = int(match.group("number"))
            current_lines = [match.group("body").strip()]
            continue
        if current_number is not None:
            if re.match(r"^\d{1,2}[.．]\s*【答案】", line):
                flush()
                continue
            if "【解析】" in line or "【分析】" in line or re.match(r"^【小问\d+详解】", line):
                flush()
                continue
            current_lines.append(line)
    flush()
    return answers


def parse_english_sequences(lines: list[str]) -> dict[int, str]:
    answers = {}
    text = "\n".join(lines)
    for match in re.finditer(r"(?P<start>\d{1,2})\s*[-~—]\s*(?P<end>\d{1,2})\s*[:：]?\s*(?P<body>[A-G\s]{2,40})", text):
        start = int(match.group("start"))
        end = int(match.group("end"))
        sequence = re.findall(r"[A-G]", match.group("body"))
        if 0 < start <= end and len(sequence) >= end - start + 1:
            for offset, answer in enumerate(sequence[: end - start + 1]):
                answers.setdefault(start + offset, answer)
    return answers


def parse_pdf_choice_tables(lines: list[str]) -> dict[int, str]:
    answers = {}
    for index, line in enumerate(lines):
        if "题号" not in line:
            continue
        answer_line = next((candidate for candidate in lines[index + 1 : index + 4] if "答案" in candidate), "")
        if not answer_line:
            continue
        numbers = [int(value) for value in re.findall(r"\d{1,2}", line)]
        choices = re.findall(r"[A-G]", answer_line)
        if len(choices) >= len(numbers):
            for number, answer in zip(numbers, choices):
                answers.setdefault(number, answer)
    return answers


def parse_pdf_numbered_answers(lines: list[str]) -> dict[int, str]:
    answers = {}
    current_number = None
    current_lines = []

    def flush() -> None:
        nonlocal current_number, current_lines
        if current_number is None:
            return
        answer = clean_answer(" ".join(current_lines))
        if answer:
            answers.setdefault(current_number, answer)
        current_number = None
        current_lines = []

    for line in lines:
        match = re.match(r"^(?P<number>\d{1,2})[．.]\s*(?P<body>.*)$", line)
        if match:
            flush()
            number = int(match.group("number"))
            body = match.group("body").strip()
            if number <= 10 and re.fullmatch(r"[A-G]", body):
                current_number = None
                current_lines = []
                continue
            current_number = number
            current_lines = [body]
            continue
        if current_number is not None:
            current_lines.append(line)
    flush()
    return answers


def build_source(source: dict, ocr: RapidOCR) -> dict:
    if source.get("pdfUrl"):
        lines = pdf_text_lines(source["id"], source["pdfUrl"])
        answer_map = parse_pdf_choice_tables(lines)
        answer_map.update(parse_pdf_numbered_answers(lines))
        answers = [
            {
                "number": number,
                "answer": answer,
                "confidence": "web-pdf-text",
            }
            for number, answer in sorted(answer_map.items())
            if answer
        ]
        return {
            **source,
            "sourceName": source.get("sourceName", "public web PDF"),
            "imageCount": 0,
            "imageUrls": [],
            "answers": answers,
        }

    image_urls = source_image_urls(source["pageUrl"])
    page_items = [ocr_image(ocr, source["id"], url) for url in image_urls]
    lines = []
    answer_map: dict[int, str] = {}
    for items in page_items:
        answer_map.update(parse_choice_tables(items))
        lines.extend(row_lines(items))
    answer_map.update(parse_written_answers(lines))
    if source["family"].startswith("english:"):
        answer_map.update(parse_english_sequences(lines))
    answers = [
        {
            "number": number,
            "answer": answer,
            "confidence": "web-ocr",
        }
        for number, answer in sorted(answer_map.items())
        if answer
    ]
    return {
        **source,
        "sourceName": "北京高考在线",
        "imageCount": len(image_urls),
        "imageUrls": image_urls,
        "answers": answers,
    }


def main() -> None:
    ocr = RapidOCR()
    sources = [build_source(source, ocr) for source in SOURCES]
    by_family = Counter()
    for source in sources:
        by_family[source["family"]] += len(source["answers"])
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "note": "Web answer maps from public gaokzx.com article image pages and reviewed public PDF answer files. Review source URLs before relying on open-ended answers.",
        },
        "summary": {
            "sources": len(sources),
            "answers": sum(len(source["answers"]) for source in sources),
            "byFamily": dict(by_family),
        },
        "sources": sources,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {payload['summary']['answers']} web answer entries")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
