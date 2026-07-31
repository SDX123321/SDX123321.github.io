use super::*;
use bcrypt::{hash as bcrypt_hash, DEFAULT_COST};
use rand::{rngs::OsRng, RngCore};

pub(crate) async fn bootstrap_admin(db: &PgPool) -> anyhow::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(db)
        .await?;
    if count != 0 {
        return Ok(());
    }
    let alphabet = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let mut bytes = [0u8; 20];
    OsRng.fill_bytes(&mut bytes);
    let password: String = bytes
        .iter()
        .map(|b| alphabet[*b as usize % alphabet.len()] as char)
        .collect();
    let password_hash = bcrypt_hash(&password, DEFAULT_COST)?;
    sqlx::query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES('admin',$1,'admin',true) ON CONFLICT DO NOTHING")
        .bind(password_hash).execute(db).await?;
    eprintln!("INITIAL ADMIN CREDENTIALS (shown once) username=admin password={password}");
    Ok(())
}
