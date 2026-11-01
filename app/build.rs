// SPDX-License-Identifier: MIT OR Apache-2.0
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

fn validate_embedded_frontend() {
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set by cargo");
    let manifest_path = Path::new(&manifest_dir);
    let gui_dir = manifest_path.parent().expect("Repository root").join("gui");
    let dist_dir = gui_dir.join("dist");
    let src_dir = gui_dir.join("src");

    println!("cargo:rerun-if-changed={}", dist_dir.display());
    println!("cargo:rerun-if-changed={}", src_dir.display());

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

    // Check if source files are newer than the built dist index.html
    if let Ok(dist_meta) = fs::metadata(&index_html) {
        if let Ok(dist_mtime) = dist_meta.modified() {
            let mut newer_src: Option<String> = None;
            check_mtime_recursive(&src_dir, dist_mtime, &mut newer_src);
            if let Some(src_file) = newer_src {
                println!(
                    "cargo:warning=Frontend source '{}' is newer than 'gui/dist/index.html'. \
                     Run 'cd gui && npm run build' to update embedded assets.",
                    src_file
                );
            }
        }
    }
}

fn check_mtime_recursive(
    dir: &Path,
    threshold: std::time::SystemTime,
    newer_out: &mut Option<String>,
) {
    if newer_out.is_some() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                check_mtime_recursive(&path, threshold, newer_out);
            } else if path.is_file() {
                if let Ok(meta) = fs::metadata(&path) {
                    if let Ok(mtime) = meta.modified() {
                        if mtime > threshold {
                            *newer_out = Some(path.display().to_string());
                            return;
                        }
                    }
                }
            }
        }
    }
}
