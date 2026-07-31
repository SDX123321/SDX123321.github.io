use deadpool_redis::{redis, Pool as RedisPool};
use serde::{de::DeserializeOwned, Serialize};

use crate::types::CACHE_SECONDS;

/// Read path: try Redis first, fall back to the caller hitting PostgreSQL.
pub(crate) async fn cache_get<T: DeserializeOwned>(
    redis: &Option<RedisPool>,
    key: &str,
) -> Option<T> {
    let pool = redis.as_ref()?;
    let mut conn = pool.get().await.ok()?;
    let raw: String = redis::AsyncCommands::get(&mut conn, key).await.ok()?;
    serde_json::from_str(&raw).ok()
}

/// Write path: best-effort TTL write; Redis being unavailable silently degrades to PG.
pub(crate) async fn cache_set<T: Serialize>(redis: &Option<RedisPool>, key: &str, value: &T) {
    let Some(pool) = redis else { return };
    let Ok(mut conn) = pool.get().await else {
        return;
    };
    let Ok(raw) = serde_json::to_string(value) else {
        return;
    };
    let _: Result<(), _> = redis::AsyncCommands::set_ex(&mut conn, key, raw, CACHE_SECONDS).await;
}
