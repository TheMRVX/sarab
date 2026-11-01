// SPDX-License-Identifier: MIT OR Apache-2.0
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
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

fn collect_source_files(dir: &Path, base_dir: &Path, files: &mut BTreeSet<String>) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                collect_source_files(&path, base_dir, files);
            } else if path.is_file() {
                if let Ok(rel) = path.strip_prefix(base_dir) {
                    let normalized_rel = rel.to_string_lossy().replace('\\', "/");
                    files.insert(normalized_rel);
                }
            }
        }
    }
}

fn compute_frontend_fingerprint(gui_dir: &Path, files: &BTreeSet<String>) -> String {
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
    format!("{:x}", hasher.finalize())
}

fn validate_embedded_frontend() {
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set by cargo");
    let manifest_path = Path::new(&manifest_dir);
    let gui_dir = manifest_path.parent().expect("Repository root").join("gui");
    let dist_dir = gui_dir.join("dist");
    let fingerprint_file = dist_dir.join(".fingerprint");

    let src_dir = gui_dir.join("src");

    println!("cargo:rerun-if-changed={}", src_dir.display());
    println!("cargo:rerun-if-changed={}", dist_dir.display());
    println!("cargo:rerun-if-changed={}", fingerprint_file.display());
    println!("cargo:rerun-if-env-changed=SARAB_STRICT_EMBED");
    println!("cargo:rerun-if-env-changed=SARAB_SKIP_FRONTEND_VERIFY");

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

    let skip_verify = std::env::var("SARAB_SKIP_FRONTEND_VERIFY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if skip_verify {
        println!("cargo:warning=SARAB_SKIP_FRONTEND_VERIFY is set. Skipping frontend fingerprint validation.");
        return;
    }

    // Collect all source input files
    let mut files = BTreeSet::new();
    let static_inputs = [
        "index.html",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vite.config.ts",
        "scripts/fingerprint.mjs",
    ];
    for rel in static_inputs {
        if gui_dir.join(rel).exists() {
            files.insert(rel.to_string());
        }
    }
    collect_source_files(&gui_dir.join("src"), &gui_dir, &mut files);

    let expected_fingerprint = compute_frontend_fingerprint(&gui_dir, &files);

    if !fingerprint_file.exists() {
        panic!(
            "Build integrity violation: embedded frontend fingerprint file '{}' is missing. \
             Expected fingerprint: '{}'. Run 'cd gui && npm run build' to regenerate embedded assets.",
            fingerprint_file.display(),
            expected_fingerprint
        );
    }

    let recorded_fingerprint = fs::read_to_string(&fingerprint_file)
        .unwrap_or_default()
        .trim()
        .to_string();

    if recorded_fingerprint != expected_fingerprint {
        panic!(
            "Build integrity violation: embedded frontend assets in '{}' are stale or out of sync with source files. \
             Expected fingerprint '{}', but recorded '{}'. \
             Run 'cd gui && npm run build' to update embedded assets.",
            dist_dir.display(),
            expected_fingerprint,
            recorded_fingerprint
        );
    }
}
