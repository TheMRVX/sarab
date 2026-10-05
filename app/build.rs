fn main() {
    #[cfg(windows)]
    {
        // Only embed requireAdministrator manifest for release binary builds,
        // avoiding mt.exe conflict with cargo test test-harness manifest.
        let is_release = std::env::var("PROFILE").map(|p| p == "release").unwrap_or(false);
        if is_release {
            println!("cargo:rustc-link-arg-bins=/MANIFEST:EMBED");
            println!("cargo:rustc-link-arg-bins=/MANIFESTUAC:level='requireAdministrator' uiAccess='false'");
        }
    }
}
