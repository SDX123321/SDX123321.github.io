use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    http::{header, HeaderValue, StatusCode},
    response::Response,
    Json,
};
use futures_util::StreamExt;
use std::{
    convert::Infallible,
    time::{Duration, Instant},
};

use crate::{auth_user, json, ApiError, HeaderMap, SharedState, State, Value};

use super::{AnswerInput, MaterialParams, SearchMatch};

fn supports_reasoning_effort(model: &str) -> bool {
    let model = model.to_ascii_lowercase();
    ["gpt-5", "o1", "o3", "o4", "gpt-oss"]
        .iter()
        .any(|prefix| model.starts_with(prefix))
}

fn is_clearly_off_topic(question: &str) -> bool {
    let normalized = question.to_lowercase();
    [
        "天气",
        "股票",
        "基金",
        "比特币",
        "彩票",
        "娱乐新闻",
        "明星八卦",
        "订酒店",
        "订机票",
        "餐厅推荐",
        "外卖",
        "旅游攻略",
        "写代码",
        "编程",
        "javascript",
        "python",
        "java ",
        "游戏攻略",
    ]
    .iter()
    .any(|term| normalized.contains(term))
}

fn push_utf8_chunk(target: &mut String, pending: &mut Vec<u8>, chunk: &[u8]) {
    pending.extend_from_slice(chunk);
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                target.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                if valid > 0 {
                    target.push_str(std::str::from_utf8(&pending[..valid]).unwrap_or_default());
                }
                match error.error_len() {
                    Some(invalid) => {
                        target.push('\u{fffd}');
                        pending.drain(..valid + invalid);
                    }
                    None => {
                        pending.drain(..valid);
                        break;
                    }
                }
            }
        }
    }
}

pub(crate) async fn answer(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<AnswerInput>,
) -> Result<Response, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let question = input.question.trim().to_string();
    if question.chars().count() < 2 {
        return Err(ApiError::bad_request());
    }
    let conversation_id = input.conversation_id;
    let conversation_context = if let Some(id) = conversation_id {
        crate::learning::conversation_reasoning_context(&state, user.id, id).await?
    } else {
        String::new()
    };
    if let Some(id) = conversation_id {
        crate::learning::begin_message(&state, user.id, id, &question).await?;
    }
    if is_clearly_off_topic(&question) {
        let sources: Vec<SearchMatch> = Vec::new();
        let answer = "这个问题与高中学科学习及当前资料库无关，已在调用模型前中断。请改为提问高中课程、解题方法、知识点或资料内容。";
        if let Some(id) = conversation_id {
            crate::learning::save_answer(
                &state,
                id,
                answer,
                "completed",
                None,
                "relevance-gate",
                "rules-v1",
                &sources,
            )
            .await?;
        }
        let mut out = Response::new(Body::from(format!(
            "{}\n{}\n{}\n{}\n",
            json!({"type":"sources","sources":sources,"answerMode":"blocked","warning":"问题与高中学科资料无关，未调用模型。","reasoningLevel":"advanced"}),
            json!({"type":"gate","status":"blocked","reason":"off_topic"}),
            json!({"type":"delta","text":answer}),
            json!({"type":"done","answerMode":"blocked","warning":"问题与高中学科资料无关，未调用模型。","reasoningLevel":"advanced"})
        )));
        out.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
        );
        out.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return Ok(out);
    }
    if let Some(redis_pool) = &state.redis {
        let mut conn = redis_pool.get().await.map_err(|_| ApiError::server())?;
        let key = format!("rate_limit:answer:{}", user.id);
        let count: i32 = deadpool_redis::redis::cmd("INCR")
            .arg(&key)
            .query_async(&mut conn)
            .await
            .unwrap_or(0);
        if count == 1 {
            let _ = deadpool_redis::redis::cmd("EXPIRE")
                .arg(&key)
                .arg(60)
                .query_async::<()>(&mut conn)
                .await;
        }
        if count > 30 {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "answer_rate_limited",
            ));
        }
    } else {
        let mut rate = state.answer_rate.lock().map_err(|_| ApiError::server())?;
        let now = Instant::now();
        let recent = rate.recent.entry(user.id).or_default();
        recent.retain(|t| now.duration_since(*t) < Duration::from_secs(60));
        if recent.len() >= 30 {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "answer_rate_limited",
            ));
        }
        recent.push(now);
    }
    let domain_id = match input.domain_id {
        Some(id) => Some(id),
        None => {
            sqlx::query_scalar("SELECT id FROM content_domains WHERE domain_key='high-school'")
                .fetch_optional(&state.db)
                .await?
        }
    };
    let mut selected_grades = input.grades.unwrap_or_else(|| {
        input
            .grade
            .filter(|grade| grade != "all")
            .into_iter()
            .collect()
    });
    selected_grades.retain(|grade| matches!(grade.as_str(), "grade-1" | "grade-2" | "grade-3"));
    selected_grades.sort();
    selected_grades.dedup();
    let selected_subject = input.subject.filter(|subject| subject != "all");
    let params = MaterialParams {
        q: Some(question.clone()),
        grade: None,
        grades: (!selected_grades.is_empty()).then_some(selected_grades.clone()),
        subject: selected_subject.clone(),
        year: input.year,
        region: input.region,
        kind: input.kind,
        domain_id,
        ..Default::default()
    };
    let sources = match super::search::search_matches(&state, &params, 8).await {
        Ok(value) => value,
        Err(error) => {
            return Err(error);
        }
    };
    let answer_mode = if sources.is_empty() {
        "general"
    } else if sources.len() < 4 {
        "hybrid"
    } else {
        "grounded"
    };
    let warning = match answer_mode {
        "general" => Some("未从资料库检索到直接依据，以下为模型通识补充，请核对教材。"),
        "hybrid" => Some("资料依据有限，回答可能包含明确标记的模型通识补充。"),
        _ => None,
    };
    let context = sources
        .iter()
        .enumerate()
        .map(|(i, s)| format!("[S{}] {}\n{}", i + 1, s.file_name, s.text))
        .collect::<Vec<_>>()
        .join("\n\n");
    let answer_policy = if sources.is_empty() {
        "资料为空。请使用可靠的高中通识作答，并以“通识补充（无资料引用）”开头；不得使用 [S1] 等虚假引用。"
    } else {
        "优先依据资料回答并使用 [S1] 形式标注来源。资料未覆盖的必要补充必须放在“通识补充”小节，且不得添加虚假引用。"
    };
    let advanced_reasoning_policy = format!(
        "你是高中学习助教，采用进阶思考等级。{answer_policy}\
         用户在界面选择的年级与学科是强约束：回答深度、术语和例题必须适配该范围，不得擅自切换学科。\
         回答前应综合当前问题、已有对话结论和全部 RAG 资料，交叉核验不同来源，识别适用条件、隐含假设、矛盾与证据边界。\
         对数学问题优先给出结论、关键依据、推导摘要、方法迁移与易错边界；不得只复述资料。\
         内部可以充分推理，但只输出对学习者有用且可核验的推理摘要，不输出隐藏思维链。\
         不为追求篇幅而截断答案，完成必要推导后再结束。回答使用结构清晰的简体中文。"
    );
    let grade_scope = if selected_grades.is_empty() {
        "全部高中年级".to_string()
    } else {
        selected_grades
            .iter()
            .map(|grade| match grade.as_str() {
                "grade-1" => "高一",
                "grade-2" => "高二",
                "grade-3" => "高三",
                _ => grade,
            })
            .collect::<Vec<_>>()
            .join("、")
    };
    let subject_scope = match selected_subject.as_deref() {
        Some("chinese") => "语文",
        Some("math") => "数学",
        Some("english") => "英语",
        Some("physics") => "物理",
        Some("chemistry") => "化学",
        Some("biology") => "生物",
        Some("politics") => "政治",
        Some("history") => "历史",
        Some("geography") => "地理",
        Some(value) => value,
        None => "全部学科",
    };
    let user_prompt = format!(
        "用户选择范围：年级={grade_scope}；学科={subject_scope}。该范围已用于 RAG 检索，请严格按此范围组织回答。\n\n当前问题：{question}\n\n已有对话结果：\n{}\n\nRAG 资料：\n{}",
        if conversation_context.is_empty() {
            "（无）"
        } else {
            &conversation_context
        },
        if context.is_empty() {
            "（无）"
        } else {
            &context
        }
    );
    let answer_slot = tokio::time::timeout(
        Duration::from_secs(15),
        state.answer_slots.clone().acquire_owned(),
    )
    .await
    .map_err(|_| ApiError::new(StatusCode::TOO_MANY_REQUESTS, "answer_capacity_reached"))?
    .map_err(|_| ApiError::server())?;
    let source_event = json!({"type":"sources","sources":sources,"answerMode":answer_mode,"warning":warning,"reasoningLevel":"advanced"});
    let stream_answer_mode = answer_mode.to_string();
    let stream_warning = warning.map(str::to_string);
    let remote_provider =
        crate::admin::preferred_provider_runtime(&state, user.id, input.provider_config_id).await?;
    if let Some(config) = remote_provider {
        let mut request_payload = json!({"model":config.model.clone(),"stream":true,"stream_options":{"include_usage":true},"temperature":0.15,
            "messages":[{"role":"system","content":advanced_reasoning_policy},{"role":"user","content":user_prompt.clone()}]});
        if supports_reasoning_effort(&config.model) {
            request_payload["reasoning_effort"] = json!("high");
        }
        let stream_state = state.clone();
        let save_sources = sources.clone();
        let input_chars = user_prompt.chars().count();
        let user_id = user.id;
        let body_stream = stream! {
            let _answer_slot = answer_slot;
            yield Ok::<Bytes,Infallible>(Bytes::from(format!("{}\n", source_event)));
            let started = Instant::now();
            let response = stream_state.http.post(format!("{}/chat/completions", config.base_url.trim_end_matches('/')))
                .bearer_auth(&config.api_key).json(&request_payload).send().await;
            let Ok(response) = response else {
                yield Ok(Bytes::from(format!("{}\n", json!({"type":"error","error":"model_unavailable"}))));
                if let Some(id)=conversation_id { let _=crate::learning::save_answer(&stream_state,id,"","failed",Some("model_unavailable"),&config.provider,&config.model,&save_sources).await; }
                return;
            };
            if !response.status().is_success() {
                yield Ok(Bytes::from(format!("{}\n", json!({"type":"error","error":"model_unavailable"}))));
                if let Some(id)=conversation_id { let _=crate::learning::save_answer(&stream_state,id,"","failed",Some("model_unavailable"),&config.provider,&config.model,&save_sources).await; }
                return;
            }
            let mut bytes=response.bytes_stream();
            let mut buffer=String::new();
            let mut utf8_pending=Vec::new();
            let mut complete_answer=String::new();
            let mut reasoning_chars=0usize;
            let mut ttft_ms=None;
            let mut input_tokens=0usize;
            let mut output_tokens=0usize;
            let mut stream_failed=false;
            while let Some(next)=bytes.next().await {
                match next {
                    Ok(chunk) => {
                        push_utf8_chunk(&mut buffer,&mut utf8_pending,&chunk);
                        while let Some(pos)=buffer.find('\n') {
                            let line=buffer[..pos].trim().to_string(); buffer.drain(..=pos);
                            let Some(data)=line.strip_prefix("data:").map(str::trim) else { continue };
                            if data.is_empty() || data == "[DONE]" { continue; }
                            let Ok(value)=serde_json::from_str::<Value>(data) else { continue };
                            if let Some(usage)=value.get("usage") {
                                input_tokens=usage.get("prompt_tokens").and_then(Value::as_u64).unwrap_or(input_tokens as u64) as usize;
                                output_tokens=usage.get("completion_tokens").and_then(Value::as_u64).unwrap_or(output_tokens as u64) as usize;
                            }
                            let reasoning=value.pointer("/choices/0/delta/reasoning_content").or_else(||value.pointer("/choices/0/delta/reasoning")).and_then(Value::as_str).unwrap_or_default();
                            if !reasoning.is_empty() {
                                ttft_ms.get_or_insert_with(||started.elapsed().as_millis());
                                reasoning_chars+=reasoning.chars().count();
                                yield Ok(Bytes::from(format!("{}\n",json!({"type":"reasoning","status":"thinking","text":reasoning,"processedChars":reasoning_chars}))));
                            }
                            let content=value.pointer("/choices/0/delta/content").and_then(Value::as_str).unwrap_or_default();
                            if !content.is_empty() {
                                ttft_ms.get_or_insert_with(||started.elapsed().as_millis());
                                complete_answer.push_str(content);
                                yield Ok(Bytes::from(format!("{}\n",json!({"type":"delta","text":content}))));
                            }
                        }
                    }
                    Err(_) => { stream_failed=true; yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_stream_failed"})))); break; }
                }
            }
            let output_chars=complete_answer.chars().count();
            if input_tokens==0 { input_tokens=(input_chars+2)/3; }
            if output_tokens==0 { output_tokens=(output_chars+2)/3; }
            let duration_ms=started.elapsed().as_millis();
            yield Ok(Bytes::from(format!("{}\n",json!({"type":"metrics","inputTokens":input_tokens,"outputTokens":output_tokens,"totalTokens":input_tokens+output_tokens,"ttftMs":ttft_ms,"durationMs":duration_ms}))));
            yield Ok(Bytes::from(format!("{}\n",json!({"type":"done","answerMode":stream_answer_mode,"warning":stream_warning,"reasoningLevel":"advanced"}))));
            crate::admin::record_ai_metrics(&stream_state,user_id,&config.provider,&config.model,input_chars,output_chars,input_tokens,output_tokens,ttft_ms,duration_ms,if stream_failed{"failed"}else{"completed"}).await;
            if let Some(id)=conversation_id { let _=crate::learning::save_answer(&stream_state,id,&complete_answer,if stream_failed{"failed"}else{"completed"},if stream_failed{Some("model_stream_failed")}else{None},&config.provider,&config.model,&save_sources).await; }
        };
        let mut out = Response::new(Body::from_stream(body_stream));
        out.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
        );
        out.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return Ok(out);
    }
    let ollama = state.ollama_config.read().await.clone();
    let payload = json!({"model":ollama.chat_model,"stream":true,"think":true,"options":{"temperature":0.15},"messages":[{"role":"system","content":advanced_reasoning_policy},{"role":"user","content":user_prompt} ]});
    let save_state = state.clone();
    let save_sources = sources.clone();
    let save_model = ollama.chat_model.clone();
    let input_chars = question.chars().count() + context.chars().count();
    let user_id = user.id;
    let body_stream = stream! {
        let _answer_slot=answer_slot;
        yield Ok::<Bytes,Infallible>(Bytes::from(format!("{}\n",source_event)));
        let started=Instant::now();
        let response=save_state.http.post(format!("{}/api/chat",ollama.base_url.trim_end_matches('/'))).json(&payload).send().await;
        let Ok(response)=response else { yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_unavailable"})))); return; };
        if !response.status().is_success() { yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_unavailable"})))); return; }
        let mut bytes=response.bytes_stream(); let mut buffer=String::new(); let mut utf8_pending=Vec::new(); let mut complete_answer=String::new(); let mut stream_failed=false; let mut reasoning_chars=0usize; let mut ttft_ms=None; let mut input_tokens=0usize; let mut output_tokens=0usize;
        while let Some(next)=bytes.next().await { match next { Ok(chunk)=>{ push_utf8_chunk(&mut buffer,&mut utf8_pending,&chunk); while let Some(pos)=buffer.find('\n') { let line=buffer[..pos].trim().to_string(); buffer.drain(..=pos); if line.is_empty(){continue} if let Ok(v)=serde_json::from_str::<Value>(&line) { if let Some(thinking)=v.pointer("/message/thinking").and_then(Value::as_str) { if !thinking.is_empty(){ ttft_ms.get_or_insert_with(||started.elapsed().as_millis()); reasoning_chars+=thinking.chars().count(); yield Ok(Bytes::from(format!("{}\n",json!({"type":"reasoning","status":"thinking","text":thinking,"processedChars":reasoning_chars})))); } } if let Some(content)=v.pointer("/message/content").and_then(Value::as_str) { if !content.is_empty(){ ttft_ms.get_or_insert_with(||started.elapsed().as_millis()); complete_answer.push_str(content); yield Ok(Bytes::from(format!("{}\n",json!({"type":"delta","text":content})))); } } if v.get("done").and_then(Value::as_bool)==Some(true) { input_tokens=v.get("prompt_eval_count").and_then(Value::as_u64).unwrap_or(0) as usize; output_tokens=v.get("eval_count").and_then(Value::as_u64).unwrap_or(0) as usize; } } } }, Err(_)=>{stream_failed=true; yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_stream_failed"})))); break} } }
        let output_chars=complete_answer.chars().count(); if input_tokens==0 {input_tokens=(input_chars+2)/3;} if output_tokens==0 {output_tokens=(output_chars+2)/3;} let duration_ms=started.elapsed().as_millis();
        yield Ok(Bytes::from(format!("{}\n",json!({"type":"metrics","inputTokens":input_tokens,"outputTokens":output_tokens,"totalTokens":input_tokens+output_tokens,"ttftMs":ttft_ms,"durationMs":duration_ms}))));
        yield Ok(Bytes::from(format!("{}\n",json!({"type":"done","answerMode":stream_answer_mode,"warning":stream_warning,"reasoningLevel":"advanced"}))));
        crate::admin::record_ai_metrics(&save_state,user_id,"ollama",&save_model,input_chars,output_chars,input_tokens,output_tokens,ttft_ms,duration_ms,if stream_failed{"failed"}else{"completed"}).await;
        if let Some(id)=conversation_id { let _=crate::learning::save_answer(&save_state,id,&complete_answer,if stream_failed{"failed"}else{"completed"},if stream_failed{Some("model_stream_failed")}else{None},"ollama",&save_model,&save_sources).await; }
    };
    let mut out = Response::new(Body::from_stream(body_stream));
    out.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
    );
    out.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(out)
}

#[allow(dead_code)]
fn ndjson_once(value: Value) -> Response {
    let mut r = Response::new(Body::from(format!("{}\n", value)));
    r.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
    );
    r
}

#[cfg(test)]
mod tests {
    use super::{is_clearly_off_topic, push_utf8_chunk, supports_reasoning_effort};

    #[test]
    fn enables_reasoning_effort_only_for_compatible_models() {
        assert!(supports_reasoning_effort("gpt-5.2"));
        assert!(supports_reasoning_effort("o3-mini"));
        assert!(!supports_reasoning_effort("deepseek-chat"));
        assert!(!supports_reasoning_effort("qwen-plus"));
    }

    #[test]
    fn gates_only_confidently_unrelated_queries() {
        assert!(is_clearly_off_topic("帮我推荐今天买哪只股票"));
        assert!(!is_clearly_off_topic("函数的单调性怎么判断"));
        assert!(!is_clearly_off_topic("牛顿第二定律如何应用"));
    }

    #[test]
    fn decodes_utf8_split_across_network_chunks_without_replacement_chars() {
        let bytes = "数学引用[S1]".as_bytes();
        let mut output = String::new();
        let mut pending = Vec::new();
        for chunk in bytes.chunks(2) {
            push_utf8_chunk(&mut output, &mut pending, chunk);
        }
        assert!(pending.is_empty());
        assert_eq!(output, "数学引用[S1]");
        assert!(!output.contains('\u{fffd}'));
    }
}
