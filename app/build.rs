fn main() {
    #[cfg(windows)]
    {
        // Only embed requireAdministrator manifest for release binary builds,
        // avoiding mt.exe conflict with cargo test test-harness manifest.
        let is_release = std::env::var("PROFILE").map(|p| p == "release").unwrap_or(false);
        let is_msvc = std::env::var("CARGO_CFG_TARGET_ENV").map(|e| e == "msvc").unwrap_or(false);
        if is_release && is_msvc {
            println!("cargo:rustc-link-arg-bins=/MANIFEST:EMBED");
            println!("cargo:rustc-link-arg-bins=/MANIFESTUAC:level='requireAdministrator' uiAccess='false'");
        }
    }
}
