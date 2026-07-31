use super::*;

pub(crate) async fn get_stats(db: &PgPool, user_id: Uuid) -> Result<Value, ApiError> {
    let row = sqlx::query(
        r#"SELECT total_study_seconds, chapter_done_count, wrong_count, practice_done_count,
                  mastery_item_count, scroll_position_count, recent_paths, current_streak_days,
                  last_activity_at, updated_at
           FROM study_snapshots WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    if let Some(row) = row {
        Ok(json!({
            "totalStudySeconds": row.try_get::<i32, _>("total_study_seconds")?,
            "chapterDoneCount": row.try_get::<i32, _>("chapter_done_count")?,
            "wrongCount": row.try_get::<i32, _>("wrong_count")?,
            "practiceDoneCount": row.try_get::<i32, _>("practice_done_count")?,
            "masteryItemCount": row.try_get::<i32, _>("mastery_item_count")?,
            "scrollPositionCount": row.try_get::<i32, _>("scroll_position_count")?,
            "recentPaths": row.try_get::<Value, _>("recent_paths")?,
            "currentStreakDays": row.try_get::<i32, _>("current_streak_days")?,
            "lastActivityAt": row.try_get::<Option<DateTime<Utc>>, _>("last_activity_at")?,
            "updatedAt": row.try_get::<DateTime<Utc>, _>("updated_at")?,
        }))
    } else {
        Ok(json!({
            "totalStudySeconds": 0, "chapterDoneCount": 0, "wrongCount": 0,
            "practiceDoneCount": 0, "masteryItemCount": 0, "scrollPositionCount": 0,
            "recentPaths": [], "currentStreakDays": 0, "lastActivityAt": null, "updatedAt": null,
        }))
    }
}

pub(crate) async fn upsert_snapshot(
    db: &PgPool,
    user_id: Uuid,
    snapshot: &ProgressSnapshot,
    mode: &str,
) -> Result<(), ApiError> {
    // Single-statement UPSERT so concurrent study_events can't lose counters to a read-modify-write race.
    sqlx::query(
        r#"INSERT INTO study_snapshots (
             user_id, total_study_seconds, chapter_done_count, wrong_count, practice_done_count,
             mastery_item_count, scroll_position_count, recent_paths, last_activity_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,to_jsonb($8::text[]),now(),now())
           ON CONFLICT (user_id) DO UPDATE SET
             total_study_seconds = CASE WHEN $9 = 'add'
               THEN study_snapshots.total_study_seconds + EXCLUDED.total_study_seconds
               ELSE GREATEST(study_snapshots.total_study_seconds, EXCLUDED.total_study_seconds) END,
             chapter_done_count = GREATEST(study_snapshots.chapter_done_count, EXCLUDED.chapter_done_count),
             wrong_count = GREATEST(study_snapshots.wrong_count, EXCLUDED.wrong_count),
             practice_done_count = GREATEST(study_snapshots.practice_done_count, EXCLUDED.practice_done_count),
             mastery_item_count = GREATEST(study_snapshots.mastery_item_count, EXCLUDED.mastery_item_count),
             scroll_position_count = GREATEST(study_snapshots.scroll_position_count, EXCLUDED.scroll_position_count),
             recent_paths = (
               SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
                 SELECT x FROM (
                   SELECT x, rn, ROW_NUMBER() OVER (PARTITION BY x ORDER BY rn) AS seen FROM (
                     SELECT incoming.x AS x, incoming.rn AS rn
                       FROM unnest($8::text[]) WITH ORDINALITY AS incoming(x, rn)
                     UNION ALL
                     SELECT e.x AS x, 100000 + e.rn AS rn
                       FROM jsonb_array_elements_text(study_snapshots.recent_paths)
                            WITH ORDINALITY AS e(x, rn)
                   ) combined
                   WHERE x IS NOT NULL AND x <> ''
                 ) deduped
                 WHERE seen = 1
                 ORDER BY rn
                 LIMIT 10
               ) top
             ),
             last_activity_at = now(), updated_at = now()"#,
    )
    .bind(user_id)
    .bind(snapshot.total_study_seconds)
    .bind(snapshot.chapter_done_count)
    .bind(snapshot.wrong_count)
    .bind(snapshot.practice_done_count)
    .bind(snapshot.mastery_item_count)
    .bind(snapshot.scroll_position_count)
    .bind(&snapshot.recent_paths)
    .bind(mode)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn increment_snapshot(
    db: &PgPool,
    user_id: Uuid,
    field: &str,
    page_path: Option<String>,
) -> Result<(), ApiError> {
    let mut snapshot = ProgressSnapshot {
        total_study_seconds: 0,
        chapter_done_count: 0,
        wrong_count: 0,
        practice_done_count: 0,
        mastery_item_count: 0,
        scroll_position_count: 0,
        recent_paths: page_path.into_iter().collect(),
    };
    match field {
        "chapter_done_count" => snapshot.chapter_done_count += 1,
        "wrong_count" => snapshot.wrong_count += 1,
        "practice_done_count" => snapshot.practice_done_count += 1,
        _ => {}
    }
    // Fields are merged atomically with GREATEST semantics in upsert_snapshot,
    // so the read-modify-write here only sets which counters to bump.
    upsert_snapshot(db, user_id, &snapshot, "max").await
}

pub(crate) async fn me_stats(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    Ok(Json(
        json!({ "stats": get_stats(&state.db, user.id).await? }),
    ))
}

pub(crate) async fn study_event(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<StudyEventInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if input.event_type.len() < 2 || input.event_type.len() > 64 {
        return Err(ApiError::bad_request());
    }
    sqlx::query(r#"INSERT INTO study_events (user_id, event_type, course, subject, page_path, object_id, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)"#)
        .bind(user.id).bind(&input.event_type).bind(&input.course).bind(&input.subject).bind(&input.page_path).bind(&input.object_id).bind(&input.payload).execute(&state.db).await?;
    if input.event_type == "page_dwell" {
        let seconds = input
            .payload
            .get("seconds")
            .and_then(Value::as_i64)
            .unwrap_or(0)
            .max(0) as i32;
        upsert_snapshot(
            &state.db,
            user.id,
            &ProgressSnapshot {
                total_study_seconds: seconds,
                recent_paths: input.page_path.into_iter().collect(),
                ..ProgressSnapshot::default()
            },
            "add",
        )
        .await?;
    } else if input.event_type == "practice_done" {
        increment_snapshot(&state.db, user.id, "practice_done_count", input.page_path).await?;
    } else if input.event_type == "chapter_done" {
        increment_snapshot(&state.db, user.id, "chapter_done_count", input.page_path).await?;
    } else if input.event_type == "wrong_added" {
        increment_snapshot(&state.db, user.id, "wrong_count", input.page_path).await?;
    }
    Ok(Json(json!({ "ok": true })))
}
