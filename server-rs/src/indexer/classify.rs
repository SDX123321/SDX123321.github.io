use regex::Regex;
use std::path::Path;
use std::sync::OnceLock;

static REGEX_SUBJECTS: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
static REGEX_YEAR: OnceLock<Regex> = OnceLock::new();
fn get_subjects_regex() -> &'static [(&'static str, Regex)] {
    REGEX_SUBJECTS.get_or_init(|| {
        let subjects = [
            ("chinese", "语文"),
            ("math", "数学"),
            ("english", "英语|听力"),
            ("physics", "物理"),
            ("chemistry", "化学"),
            ("biology", "生物"),
            ("politics", "政治|思想政治"),
            ("history", "历史"),
            ("geography", "地理"),
        ];
        subjects
            .iter()
            .map(|(k, p)| (*k, Regex::new(p).unwrap()))
            .collect()
    })
}

fn get_year_regex() -> &'static Regex {
    REGEX_YEAR.get_or_init(|| Regex::new(r"20(1[7-9]|2[0-6])").unwrap())
}

pub(crate) fn classify(
    relative_path: &str,
    ext: &str,
) -> (String, String, Option<i32>, String, String) {
    let text = relative_path.replace('\\', "/");

    // Grade matching
    let grade = if text.contains("高一") {
        "grade-1"
    } else if text.contains("高二") {
        "grade-2"
    } else if text.contains("高三") || text.contains("高考") {
        "grade-3"
    } else {
        "other"
    };

    // Subject matching
    let mut subject = "other";
    for &(key, ref re) in get_subjects_regex() {
        if re.is_match(&text) {
            subject = key;
            break;
        }
    }

    // Year detection
    let year_re = get_year_regex();
    let base_name = Path::new(&text)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let mut year = None;
    if let Some(m) = year_re
        .find_iter(base_name)
        .map(|m| m.as_str().parse::<i32>().unwrap_or(0))
        .max()
    {
        if m > 0 {
            year = Some(m);
        }
    }
    if year.is_none() {
        let segments: Vec<&str> = text.split('/').collect();
        if segments.len() > 1 {
            for segment in segments.iter().rev().skip(1) {
                if let Some(m) = year_re
                    .find_iter(segment)
                    .map(|m| m.as_str().parse::<i32>().unwrap_or(0))
                    .max()
                {
                    if m > 0 {
                        year = Some(m);
                        break;
                    }
                }
            }
        }
    }

    // Region matching
    let regions = [
        "南京",
        "苏州",
        "无锡",
        "常州",
        "南通",
        "扬州",
        "镇江",
        "泰州",
        "盐城",
        "淮安",
        "宿迁",
        "徐州",
        "连云港",
        "江苏",
        "北京",
        "上海",
        "天津",
        "重庆",
        "浙江",
        "山东",
        "广东",
        "福建",
        "安徽",
        "湖北",
        "湖南",
        "河北",
        "河南",
        "四川",
        "陕西",
        "山西",
        "江西",
        "辽宁",
        "吉林",
        "黑龙江",
        "广西",
        "贵州",
        "云南",
        "甘肃",
        "青海",
        "宁夏",
        "新疆",
        "西藏",
        "海南",
        "内蒙古",
    ];
    let mut region = "other";
    for r in regions {
        if text.contains(r) {
            region = r;
            break;
        }
    }
    if region == "other" && text.contains("全国") {
        region = "全国";
    }

    // Kind matching
    let mut kind = "other";
    if text.contains("答案") || text.contains("解析") || text.contains("详解") {
        kind = "answer";
    } else if text.contains("答题卡") || text.contains("答卷纸") {
        kind = "answer-sheet";
    } else if text.contains("听力") || ext == ".mp3" || ext == ".wav" {
        kind = "audio";
    } else if text.contains("试卷")
        || text.contains("试题")
        || text.contains("真题")
        || text.contains("模拟")
        || text.contains("联考")
        || text.contains("月考")
        || text.contains("期中")
        || text.contains("期末")
        || text.contains("高考")
    {
        kind = "paper";
    } else if ext == ".jpg" || ext == ".jpeg" || ext == ".png" {
        kind = "image";
    } else if ext == ".zip" {
        kind = "archive";
    }

    (
        grade.to_string(),
        subject.to_string(),
        year,
        region.to_string(),
        kind.to_string(),
    )
}

pub(crate) fn mime_for(ext: &str) -> &'static str {
    match ext {
        ".doc" => "application/msword",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pdf" => "application/pdf",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".zip" => "application/zip",
        ".html" => "text/html",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::classify;

    #[test]
    fn test_classify() {
        let (grade, subject, year, region, kind) = classify("高一数学试卷.docx", ".docx");
        assert_eq!(grade, "grade-1");
        assert_eq!(subject, "math");
        assert_eq!(year, None);
        assert_eq!(region, "other");
        assert_eq!(kind, "paper");

        let (grade, subject, year, region, kind) =
            classify("高三物理/2025南京一模物理试卷解析.pdf", ".pdf");
        assert_eq!(grade, "grade-3");
        assert_eq!(subject, "physics");
        assert_eq!(year, Some(2025));
        assert_eq!(region, "南京");
        assert_eq!(kind, "answer");
    }
}
