use std::ops::Range;

fn find(bytes: &[u8], needle: &[u8]) -> Option<usize> {
    bytes.windows(needle.len()).position(|part| part == needle)
}
fn boundary(content_type: &str) -> Result<String, String> {
    let value = content_type
        .split(';')
        .skip(1)
        .find_map(|part| {
            let (name, value) = part.trim().split_once('=')?;
            name.eq_ignore_ascii_case("boundary")
                .then(|| value.trim().trim_matches('"').to_string())
        })
        .ok_or("图片编辑请求缺少 multipart boundary")?;
    if value.is_empty() || value.len() > 200 || value.contains(['\r', '\n']) {
        return Err("图片编辑 multipart boundary 无效".into());
    }
    Ok(value)
}
fn field_range(body: &[u8], marker: &str, field: &str) -> Result<Option<Range<usize>>, String> {
    let delimiter = format!("--{marker}");
    let separator = format!("\r\n--{marker}");
    let mut position = find(body, delimiter.as_bytes()).ok_or("图片编辑 multipart 格式无效")?;
    for _ in 0..128 {
        let after = position + delimiter.len();
        if body.get(after..after + 2) == Some(b"--") {
            return Ok(None);
        }
        if body.get(after..after + 2) != Some(b"\r\n") {
            return Err("图片编辑 multipart 分隔符无效".into());
        }
        let header_start = after + 2;
        let end = header_start
            + find(&body[header_start..], b"\r\n\r\n").ok_or("图片编辑 multipart 缺少字段头")?;
        if end - header_start > 16384 {
            return Err("图片编辑 multipart 字段头过长".into());
        }
        let content_start = end + 4;
        let content_end = content_start
            + find(&body[content_start..], separator.as_bytes())
                .ok_or("图片编辑 multipart 缺少结束分隔符")?;
        let headers =
            std::str::from_utf8(&body[header_start..end]).map_err(|_| "图片编辑字段头编码无效")?;
        let matches = headers
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-disposition")
                    .then_some(value)
            })
            .is_some_and(|value| {
                value.split(';').any(|part| {
                    part.trim().split_once('=').is_some_and(|(key, value)| {
                        key.eq_ignore_ascii_case("name") && value.trim().trim_matches('"') == field
                    })
                })
            });
        if matches {
            return Ok(Some(content_start..content_end));
        }
        position = content_end + 2;
    }
    Err("图片编辑 multipart 字段过多".into())
}
pub(super) fn field(body: &[u8], content_type: &str, name: &str) -> Result<Option<String>, String> {
    let marker = boundary(content_type)?;
    let Some(range) = field_range(body, &marker, name)? else {
        return Ok(None);
    };
    if range.len() > 1024 {
        return Err(format!("图片编辑 {name} 字段过长"));
    }
    std::str::from_utf8(&body[range])
        .map(|text| Some(text.trim().to_string()))
        .map_err(|_| format!("图片编辑 {name} 字段编码无效"))
}
pub(super) fn rewrite_model(
    body: &[u8],
    content_type: &str,
    model: &str,
) -> Result<Vec<u8>, String> {
    let marker = boundary(content_type)?;
    if model.contains(['\r', '\n']) || model.len() > 1024 {
        return Err("图片模型标识无效".into());
    }
    if let Some(range) = field_range(body, &marker, "model")? {
        let mut result = Vec::with_capacity(body.len() + model.len());
        result.extend_from_slice(&body[..range.start]);
        result.extend_from_slice(model.as_bytes());
        result.extend_from_slice(&body[range.end..]);
        return Ok(result);
    }
    let closing = format!("--{marker}--");
    let end = body
        .windows(closing.len())
        .rposition(|part| part == closing.as_bytes())
        .ok_or("图片编辑 multipart 缺少结束边界")?;
    let addition =
        format!("--{marker}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model}\r\n");
    let mut result = body[..end].to_vec();
    result.extend_from_slice(addition.as_bytes());
    result.extend_from_slice(&body[end..]);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multipart_model_changes_preserve_binary_images_and_prompt() {
        let mut body=b"--boost\r\nContent-Disposition: form-data; name=\"image\"; filename=\"test.png\"\r\nContent-Type: image/png\r\n\r\n".to_vec();
        body.extend_from_slice(&[0, 255, 13, 10, 128, 42]);
        body.extend_from_slice(b"\r\n--boost\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\nedit image\r\n--boost--\r\n");
        let content_type = "multipart/form-data; boundary=\"boost\"";
        let changed = rewrite_model(&body, content_type, "image-custom").unwrap();
        assert_eq!(
            field(&changed, content_type, "model").unwrap(),
            Some("image-custom".into())
        );
        assert_eq!(
            field(&changed, content_type, "prompt").unwrap(),
            Some("edit image".into())
        );
        assert!(find(&changed, &[0, 255, 13, 10, 128, 42]).is_some());
        let next = rewrite_model(&changed, content_type, "image-upstream").unwrap();
        assert_eq!(
            field(&next, content_type, "model").unwrap(),
            Some("image-upstream".into())
        );
        assert!(field(&next, content_type, "missing").unwrap().is_none());
    }
    #[test]
    fn invalid_multipart_is_rejected() {
        assert!(field(b"payload", "multipart/form-data", "model").is_err());
        assert!(field(
            b"--boost\r\ntruncated",
            "multipart/form-data; boundary=boost",
            "model"
        )
        .is_err());
    }
}
