use base64::Engine;
use ed25519_dalek::{pkcs8::DecodePublicKey, Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;

use super::model::PendingUpdate;

pub(super) const MANIFEST_NAME: &str = "update-manifest.json";
const PUBLIC_KEY: &str = include_str!("../../../release-public-key.pem");

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    payload: String,
    signature: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    format_version: u32,
    repository: String,
    tag: String,
    commit: String,
    assets: Vec<Asset>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Asset {
    name: String,
    target: String,
    size: u64,
    sha256: String,
}

fn public_key() -> Result<VerifyingKey, String> {
    let base64 = PUBLIC_KEY
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    let der = base64::engine::general_purpose::STANDARD
        .decode(base64)
        .map_err(|_| "invalid embedded release key")?;
    VerifyingKey::from_public_key_der(&der).map_err(|_| "invalid embedded release key".to_string())
}

fn decode(bytes: &[u8], key: &VerifyingKey) -> Result<Manifest, String> {
    if bytes.len() > 64 * 1024 {
        return Err("release manifest exceeds size limit".into());
    }
    let envelope: Envelope =
        serde_json::from_slice(bytes).map_err(|_| "invalid signed release manifest")?;
    let signature = base64::engine::general_purpose::STANDARD
        .decode(envelope.signature)
        .map_err(|_| "invalid release signature")?;
    let signature = Signature::from_slice(&signature).map_err(|_| "invalid release signature")?;
    key.verify_strict(envelope.payload.as_bytes(), &signature)
        .map_err(|_| "release signature verification failed")?;
    let manifest: Manifest =
        serde_json::from_str(&envelope.payload).map_err(|_| "invalid verified release metadata")?;
    if manifest.format_version != 1
        || manifest.commit.len() != 40
        || !manifest.commit.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("unsupported release manifest version or source commit".into());
    }
    Ok(manifest)
}

pub(super) fn verify_payload(
    manifest_file: &Path,
    payload: &Path,
    repository: &str,
    tag: &str,
    asset_name: &str,
) -> Result<(), String> {
    verify_payload_with_key(
        manifest_file,
        payload,
        repository,
        tag,
        asset_name,
        &public_key()?,
    )
}

fn verify_payload_with_key(
    manifest_file: &Path,
    payload: &Path,
    repository: &str,
    tag: &str,
    asset_name: &str,
    key: &VerifyingKey,
) -> Result<(), String> {
    let mut bytes = Vec::new();
    File::open(manifest_file)
        .map_err(|_| "signed release manifest missing")?
        .take(64 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "cannot read release manifest")?;
    let manifest = decode(&bytes, key)?;
    if manifest.repository != repository || manifest.tag != tag {
        return Err("release repository or version does not match its signature".into());
    }
    let target = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let matches: Vec<_> = manifest
        .assets
        .iter()
        .filter(|asset| asset.name == asset_name)
        .collect();
    if matches.len() != 1 || matches[0].target != target {
        return Err("release asset or target does not match its signature".into());
    }
    let asset = matches[0];
    if asset.size > 1024 * 1024 * 1024
        || asset.sha256.len() != 64
        || !asset.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("invalid signed asset size or digest".into());
    }
    let mut file = File::open(payload).map_err(|_| "release payload missing")?;
    if file
        .metadata()
        .map_err(|_| "cannot inspect release payload")?
        .len()
        != asset.size
    {
        return Err("release payload size mismatch".into());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|_| "cannot hash release payload")?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    if format!("{:x}", hash.finalize()) != asset.sha256.to_lowercase() {
        return Err("release payload digest mismatch".into());
    }
    Ok(())
}

pub(super) fn verify_pending(pending: &PendingUpdate) -> Result<(), String> {
    let payload = Path::new(&pending.asset_path);
    let manifest = payload
        .parent()
        .ok_or("invalid release payload path")?
        .join(MANIFEST_NAME);
    if pending.repo != super::runtime::resolve_update_repo() {
        return Err("pending update repository does not match this build".into());
    }
    if super::runtime::normalize_version(&pending.release_tag)?
        <= super::runtime::normalize_version(env!("CARGO_PKG_VERSION"))?
    {
        return Err("pending update is not newer than this build".into());
    }
    verify_payload(
        &manifest,
        payload,
        &pending.repo,
        &pending.release_tag,
        &pending.asset_name,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn signed_payload_rejects_tampering_wrong_key_unsigned_and_unknown_schema() {
        let signing = SigningKey::from_bytes(&[7u8; 32]);
        let payload = r#"{"formatVersion":1,"repository":"owner/repo","tag":"v0.5.1","commit":"1111111111111111111111111111111111111111","assets":[]}"#;
        let signature = base64::engine::general_purpose::STANDARD
            .encode(signing.sign(payload.as_bytes()).to_bytes());
        let bytes =
            serde_json::to_vec(&serde_json::json!({ "payload": payload, "signature": signature }))
                .unwrap();
        assert!(decode(&bytes, &signing.verifying_key()).is_ok());
        assert!(decode(&bytes, &SigningKey::from_bytes(&[8; 32]).verifying_key()).is_err());
        let tampered = String::from_utf8(bytes)
            .unwrap()
            .replace("v0.5.1", "v0.5.2");
        assert!(decode(tampered.as_bytes(), &signing.verifying_key()).is_err());
        assert!(decode(payload.as_bytes(), &signing.verifying_key()).is_err());
        assert!(public_key().is_ok());
    }

    #[test]
    fn signed_asset_binds_repository_version_target_size_and_digest() {
        let directory = std::env::temp_dir().join(format!(
            "boost-update-signature-{}-{}",
            std::process::id(),
            rand_id()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let file = directory.join("fixture.bin");
        let manifest_file = directory.join(MANIFEST_NAME);
        std::fs::write(&file, b"verified fixture").unwrap();
        let signing = SigningKey::from_bytes(&[19; 32]);
        let manifest = serde_json::json!({ "formatVersion":1, "repository":"owner/repo", "tag":"v1.0.0",
            "commit":"1111111111111111111111111111111111111111", "assets":[{
                "name":"fixture.bin", "target":format!("{}-{}",std::env::consts::OS,std::env::consts::ARCH),
                "size":16,"sha256":format!("{:x}",Sha256::digest(b"verified fixture")) }] });
        let write = |value: &serde_json::Value| {
            let payload = value.to_string();
            let signature = base64::engine::general_purpose::STANDARD
                .encode(signing.sign(payload.as_bytes()).to_bytes());
            std::fs::write(
                &manifest_file,
                serde_json::to_vec(&serde_json::json!({"payload":payload,"signature":signature}))
                    .unwrap(),
            )
            .unwrap();
        };
        write(&manifest);
        let verify = |repository: &str, tag: &str| {
            verify_payload_with_key(
                &manifest_file,
                &file,
                repository,
                tag,
                "fixture.bin",
                &signing.verifying_key(),
            )
        };
        assert!(verify("owner/repo", "v1.0.0").is_ok());
        assert!(verify("other/repo", "v1.0.0").is_err());
        assert!(verify("owner/repo", "v1.0.1").is_err());
        let mut wrong = manifest.clone();
        wrong["assets"][0]["target"] = "other-platform".into();
        write(&wrong);
        assert!(verify("owner/repo", "v1.0.0").is_err());
        write(&manifest);
        std::fs::write(&file, b"modified fixture").unwrap();
        assert!(verify("owner/repo", "v1.0.0").is_err());
        let resolved = directory.canonicalize().unwrap();
        assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        assert!(directory
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("boost-update-signature-"));
        std::fs::remove_dir_all(resolved).unwrap();
    }

    fn rand_id() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }
}
