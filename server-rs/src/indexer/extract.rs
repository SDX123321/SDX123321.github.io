use super::*;
use lopdf::Document as PdfDocument;
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use regex::Regex;
use std::fs::File as StdFile;
use std::io::{self, Read};
use std::path::Path;
use std::sync::OnceLock;
use tokio::fs::{self, File};
use tokio::io::AsyncReadExt;
use zip::ZipArchive;

static HTML_CLEANERS: OnceLock<(Regex, Regex, Regex)> = OnceLock::new();
static RE_LINE_SPACES: OnceLock<Regex> = OnceLock::new();
static RE_MULTIPLE_NEWLINES: OnceLock<Regex> = OnceLock::new();
pub(crate) async fn compute_sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];
    loop {
        let n = file.read(&mut buffer).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub(crate) fn compact(text: &str) -> String {
    let mut result = text.replace('\0', "");
    result = result.replace("\r\n", "\n");

    let re_line_spaces = RE_LINE_SPACES.get_or_init(|| Regex::new(r"[ \t]+\n").unwrap());
    let result = re_line_spaces.replace_all(&result, "\n").into_owned();

    let re_multiple_newlines = RE_MULTIPLE_NEWLINES.get_or_init(|| Regex::new(r"\n{3,}").unwrap());
    let result = re_multiple_newlines
        .replace_all(&result, "\n\n")
        .into_owned();

    result.trim().to_string()
}

fn clean_html(html: &str) -> String {
    let (re_script, re_style, re_tags) = HTML_CLEANERS.get_or_init(|| {
        (
            Regex::new(r"(?i)<script[\s\S]*?</script>").unwrap(),
            Regex::new(r"(?i)<style[\s\S]*?</style>").unwrap(),
            Regex::new(r"<[^>]+>").unwrap(),
        )
    });

    let s1 = re_script.replace_all(html, " ");
    let s2 = re_style.replace_all(&s1, " ");
    let s3 = re_tags.replace_all(&s2, " ");
    s3.replace("&nbsp;", " ").replace("&amp;", "&")
}

fn extract_docx(file_path: &Path) -> anyhow::Result<String> {
    let file = StdFile::open(file_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut doc_file = archive.by_name("word/document.xml")?;
    let mut xml_data = String::new();
    doc_file.read_to_string(&mut xml_data)?;

    let mut reader = XmlReader::from_str(&xml_data);
    reader.config_mut().trim_text(true);
    let mut txt = String::new();
    let mut buf = Vec::new();
    let mut inside_t = false;
    let mut math_depth: i32 = 0;
    let mut last_was_math = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.local_name();
                if name.as_ref() == b"t" {
                    inside_t = true;
                } else if name.as_ref() == b"oMath" || name.as_ref() == b"oMathPara" {
                    math_depth += 1;
                    if !last_was_math {
                        txt.push_str("[公式]");
                        last_was_math = true;
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.local_name();
                if name.as_ref() == b"t" {
                    inside_t = false;
                } else if name.as_ref() == b"oMath" || name.as_ref() == b"oMathPara" {
                    math_depth = math_depth.saturating_sub(1);
                } else if name.as_ref() == b"p" {
                    txt.push('\n');
                    last_was_math = false;
                }
            }
            Ok(Event::Empty(ref e)) => {
                let name = e.local_name();
                if name.as_ref() == b"tab" {
                    txt.push('\t');
                    last_was_math = false;
                } else if name.as_ref() == b"br" {
                    txt.push('\n');
                    last_was_math = false;
                } else if name.as_ref() == b"p" {
                    txt.push('\n');
                    last_was_math = false;
                }
            }
            Ok(Event::Text(ref e)) => {
                if inside_t {
                    if let Ok(val) = e.unescape() {
                        txt.push_str(&val);
                        last_was_math = false;
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    Ok(txt)
}

async fn extract_doc(file_path: &Path, cache_root: &Path) -> anyhow::Result<String> {
    let upload_id = Uuid::new_v4();
    let temp_dir = cache_root.join(format!("doc-{}", upload_id));
    let profile_dir = cache_root.join(format!("lo-profile-{}", upload_id));
    fs::create_dir_all(&temp_dir).await?;
    fs::create_dir_all(&profile_dir).await?;

    let soffice_path = std::env::var("LIBREOFFICE_PATH").unwrap_or_else(|_| "soffice".to_string());
    let timeout_ms = std::env::var("LIBREOFFICE_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(30_000);

    let profile_url = format!(
        "file:///{}",
        profile_dir.to_string_lossy().replace('\\', "/")
    );

    let mut cmd = tokio::process::Command::new(&soffice_path);
    cmd.arg(format!("-env:UserInstallation={}", profile_url))
        .arg("--headless")
        .arg("--convert-to")
        .arg("docx")
        .arg("--outdir")
        .arg(&temp_dir)
        .arg(file_path);

    let child = cmd.spawn()?;

    let result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        child.wait_with_output(),
    )
    .await;

    let output_docx = match result {
        Ok(Ok(out)) if out.status.success() => {
            let stem = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("document");
            Some(temp_dir.join(format!("{}.docx", stem)))
        }
        _ => None,
    };

    let text = if let Some(path) = output_docx {
        if path.exists() {
            extract_docx(&path).unwrap_or_default()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let _ = fs::remove_dir_all(&temp_dir).await;
    let _ = fs::remove_dir_all(&profile_dir).await;

    Ok(text)
}

fn extract_pdf(file_path: &Path) -> anyhow::Result<String> {
    let doc = PdfDocument::load(file_path)?;
    let mut text = String::new();
    let pages = doc.get_pages();
    for page_num in pages.keys() {
        if let Ok(page_text) = doc.extract_text(&[*page_num]) {
            text.push_str(&page_text);
            text.push('\n');
        }
    }
    Ok(text)
}

pub(crate) async fn extract_text(
    file_path: &Path,
    ext: &str,
    cache_root: &Path,
) -> anyhow::Result<String> {
    if ext == ".html" {
        let html = fs::read_to_string(file_path).await?;
        return Ok(compact(&clean_html(&html)));
    }
    if ext == ".docx" {
        return Ok(compact(&extract_docx(file_path)?));
    }
    if ext == ".doc" {
        return extract_doc(file_path, cache_root).await;
    }
    if ext == ".pdf" {
        return Ok(compact(&extract_pdf(file_path)?));
    }
    Ok(String::new())
}

#[cfg(test)]
mod tests {
    use super::compact;

    #[test]
    fn test_compact() {
        let text = " Hello  \t\n\n\nWorld! \n\n  ";
        assert_eq!(compact(text), "Hello\n\nWorld!");
    }
}
