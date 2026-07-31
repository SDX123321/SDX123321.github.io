use super::*;

pub(crate) fn chunks(text: &str, size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + size).min(chars.len());
        let slice: String = chars[start..end].iter().collect();
        let value = compact(&slice);
        if !value.is_empty() {
            out.push(value);
        }
        if start + size >= chars.len() {
            break;
        }
        start += size - overlap;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::chunks;

    #[test]
    fn test_chunks() {
        let text = "abcdefghij";
        let c = chunks(text, 5, 2);
        assert_eq!(c.len(), 3);
        assert_eq!(c[0], "abcde");
        assert_eq!(c[1], "defgh");
        assert_eq!(c[2], "ghij");
    }
}
