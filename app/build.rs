// SPDX-License-Identifier: MIT OR Apache-2.0
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

fn main() {
    validate_embedded_frontend();

    #[cfg(windows)]
    {
        // Only embed requireAdministrator manifest for release binary builds,
        // avoiding mt.exe conflict with cargo test test-harness manifest.
        let is_release = std::env::var("PROFILE")
            .map(|p| p == "release")
            .unwrap_or(false);
        let is_msvc = std::env::var("CARGO_CFG_TARGET_ENV")
            .map(|e| e == "msvc")
            .unwrap_or(false);
        if is_release && is_msvc {
            println!("cargo:rustc-link-arg-bins=/MANIFEST:EMBED");
            println!("cargo:rustc-link-arg-bins=/MANIFESTUAC:level='requireAdministrator' uiAccess='false'");
        }
    }
}

fn collect_files_recursive(dir: &Path, base_dir: &Path, files: &mut BTreeSet<String>) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with('.') && name_str != ".env" {
                continue;
            }
            if path.is_dir() {
                collect_files_recursive(&path, base_dir, files);
            } else if path.is_file() {
                if let Ok(rel) = path.strip_prefix(base_dir) {
                    let normalized_rel = rel.to_string_lossy().replace('\\', "/");
                    files.insert(normalized_rel);
                }
            }
        }
    }
}

fn compute_source_fingerprint(
    gui_dir: &Path,
    files: &BTreeSet<String>,
    vite_env: &BTreeMap<String, String>,
) -> String {
    let mut hasher = Sha256::new();
    for rel_path in files {
        let full_path = gui_dir.join(rel_path);
        println!("cargo:rerun-if-changed={}", full_path.display());
        let content = fs::read(&full_path).unwrap_or_default();
        // Normalize CRLF to LF
        let mut normalized = Vec::with_capacity(content.len());
        let mut i = 0;
        while i < content.len() {
            if content[i] == b'\r' && i + 1 < content.len() && content[i + 1] == b'\n' {
                normalized.push(b'\n');
                i += 2;
            } else {
                normalized.push(content[i]);
                i += 1;
            }
        }
        hasher.update(rel_path.as_bytes());
        hasher.update(b"\n");
        hasher.update(&normalized);
        hasher.update(b"\n");
    }

    for (k, v) in vite_env {
        let line = format!("env:{}={}\n", k, v);
        hasher.update(line.as_bytes());
    }

    format!("{:x}", hasher.finalize())
}

fn compute_dist_fingerprint(dist_dir: &Path) -> (String, BTreeMap<String, String>) {
    let mut files = BTreeSet::new();
    collect_files_recursive(dist_dir, dist_dir, &mut files);

    let mut asset_hashes = BTreeMap::new();
    let mut master_hasher = Sha256::new();

    for rel in files {
        if rel == ".fingerprint" || rel.starts_with(".git") {
            continue;
        }
        let full_path = dist_dir.join(&rel);
        let content = fs::read(&full_path).unwrap_or_default();
        let mut file_hasher = Sha256::new();
        file_hasher.update(&content);
        let file_hash = format!("{:x}", file_hasher.finalize());

        master_hasher.update(rel.as_bytes());
        master_hasher.update(b"\n");
        master_hasher.update(file_hash.as_bytes());
        master_hasher.update(b"\n");

        asset_hashes.insert(rel, file_hash);
    }

    (format!("{:x}", master_hasher.finalize()), asset_hashes)
}

fn validate_embedded_frontend() {
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set by cargo");
    let manifest_path = Path::new(&manifest_dir);
    let gui_dir = manifest_path.parent().expect("Repository root").join("gui");
    let dist_dir = gui_dir.join("dist");
    let fingerprint_file = dist_dir.join(".fingerprint");

    let src_dir = gui_dir.join("src");
    let public_dir = gui_dir.join("public");

    println!("cargo:rerun-if-changed={}", src_dir.display());
    println!("cargo:rerun-if-changed={}", public_dir.display());
    println!("cargo:rerun-if-changed={}", dist_dir.display());
    println!("cargo:rerun-if-changed={}", fingerprint_file.display());
    println!("cargo:rerun-if-env-changed=SARAB_STRICT_EMBED");
    println!("cargo:rerun-if-env-changed=SARAB_SKIP_FRONTEND_VERIFY");
    println!("cargo:rerun-if-env-changed=VITE_DEMO_MODE");

    let index_html = dist_dir.join("index.html");
    if !index_html.exists() {
        panic!(
            "Build integrity error: embedded frontend is missing '{}'. \
             Please build the frontend by running 'cd gui && npm ci && npm run build'.",
            index_html.display()
        );
    }

    let assets_dir = dist_dir.join("assets");
    if !assets_dir.exists() {
        panic!(
            "Build integrity error: embedded frontend assets directory is missing '{}'. \
             Please build the frontend by running 'cd gui && npm ci && npm run build'.",
            assets_dir.display()
        );
    }

    // Scan compiled JS bundles for forbidden Nominatim calls
    let mut js_bundle_count = 0;
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("js") {
                js_bundle_count += 1;
                let content = fs::read_to_string(&path).unwrap_or_default();
                if content.contains("nominatim.openstreetmap.org") {
                    panic!(
                        "Build integrity violation: embedded frontend bundle '{}' contains \
                         forbidden reference to 'nominatim.openstreetmap.org'. \
                         Rebuild the frontend cleanly with 'cd gui && npm run build'.",
                        path.display()
                    );
                }
            }
        }
    }

    if js_bundle_count == 0 {
        panic!(
            "Build integrity error: no JavaScript bundle found in '{}'. \
             Please rebuild the frontend with 'cd gui && npm run build'.",
            assets_dir.display()
        );
    }

    let profile = std::env::var("PROFILE").unwrap_or_default();
    let is_release = profile == "release" || std::env::var("CI").as_deref() == Ok("true");

    let skip_verify = std::env::var("SARAB_SKIP_FRONTEND_VERIFY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if skip_verify {
        if is_release {
            panic!(
                "Build integrity security violation: SARAB_SKIP_FRONTEND_VERIFY is strictly disallowed \
                 in release or CI builds (PROFILE='{}'). Official release packages must never \
                 weaken frontend build integrity verification.",
                profile
            );
        }
        println!("cargo:warning=SARAB_SKIP_FRONTEND_VERIFY is set. Skipping frontend fingerprint validation.");
        return;
    }

    // Collect all source input files
    let mut source_files = BTreeSet::new();
    let static_inputs = [
        "index.html",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tsconfig.node.json",
        "vite.config.ts",
        "scripts/fingerprint.mjs",
    ];
    for rel in static_inputs {
        let full = gui_dir.join(rel);
        if full.exists() {
            println!("cargo:rerun-if-changed={}", full.display());
            source_files.insert(rel.to_string());
        }
    }

    let env_files = [
        ".env",
        ".env.local",
        ".env.production",
        ".env.production.local",
        ".env.development",
        ".env.development.local",
        ".env.test",
        ".env.test.local",
    ];
    for rel in env_files {
        let full = gui_dir.join(rel);
        if full.exists() {
            println!("cargo:rerun-if-changed={}", full.display());
            source_files.insert(rel.to_string());
        }
    }

    collect_files_recursive(&public_dir, &gui_dir, &mut source_files);
    collect_files_recursive(&src_dir, &gui_dir, &mut source_files);

    // Collect applicable Vite/Tauri environment variables
    let mut vite_env = BTreeMap::new();
    for (k, v) in std::env::vars() {
        if k.starts_with("VITE_") || k.starts_with("TAURI_") {
            println!("cargo:rerun-if-env-changed={}", k);
            vite_env.insert(k, v);
        }
    }

    let expected_source_hash = compute_source_fingerprint(&gui_dir, &source_files, &vite_env);
    let (expected_dist_hash, actual_dist_assets) = compute_dist_fingerprint(&dist_dir);

    if !fingerprint_file.exists() {
        panic!(
            "Build integrity violation: embedded frontend fingerprint file '{}' is missing. \
             Expected source hash: '{}'. Run 'cd gui && npm run build' to regenerate embedded assets.",
            fingerprint_file.display(),
            expected_source_hash
        );
    }

    let recorded_content = fs::read_to_string(&fingerprint_file)
        .unwrap_or_default()
        .trim()
        .to_string();

    if recorded_content.starts_with('{') {
        let payload: serde_json::Value = serde_json::from_str(&recorded_content).unwrap_or_else(|e| {
            panic!(
                "Build integrity error: invalid JSON in '{}': {}. Rebuild frontend with 'cd gui && npm run build'.",
                fingerprint_file.display(),
                e
            )
        });

        let recorded_source_hash = payload
            .get("source_hash")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if recorded_source_hash != expected_source_hash {
            panic!(
                "Build integrity violation: embedded frontend assets in '{}' are stale or out of sync with source files/environment. \
                 Expected source hash '{}', but recorded '{}'. \
                 Run 'cd gui && npm run build' to update embedded assets.",
                dist_dir.display(),
                expected_source_hash,
                recorded_source_hash
            );
        }

        let recorded_dist_hash = payload
            .get("dist_hash")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if recorded_dist_hash != expected_dist_hash {
            panic!(
                "Build integrity violation: embedded frontend output assets in '{}' have been altered or tampered with. \
                 Expected dist hash '{}', but recorded manifest indicates '{}'. \
                 Run 'cd gui && npm run build' to regenerate clean assets.",
                dist_dir.display(),
                expected_dist_hash,
                recorded_dist_hash
            );
        }

        if let Some(manifest_assets) = payload.get("assets").and_then(|v| v.as_object()) {
            for (rel_path, expected_file_hash_val) in manifest_assets {
                let expected_file_hash = expected_file_hash_val.as_str().unwrap_or("");
                let actual_file_hash = actual_dist_assets.get(rel_path.as_str()).map(|s| s.as_str()).unwrap_or("");
                if actual_file_hash != expected_file_hash {
                    panic!(
                        "Build integrity violation: embedded asset '{}' hash mismatch (actual '{}' != recorded '{}'). \
                         Run 'cd gui && npm run build' to update embedded assets.",
                        rel_path,
                        actual_file_hash,
                        expected_file_hash
                    );
                }
            }
        }
    } else if recorded_content != expected_source_hash {
        panic!(
            "Build integrity violation: embedded frontend assets in '{}' are stale or out of sync with source files. \
             Expected fingerprint '{}', but recorded '{}'. \
             Run 'cd gui && npm run build' to update embedded assets.",
            dist_dir.display(),
            expected_source_hash,
            recorded_content
        );
    }
}
