fn main() {
    #[cfg(windows)]
    {
        println!("cargo:rerun-if-changed=app.manifest");
        println!("cargo:rustc-link-arg-bins=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-bins=/MANIFESTINPUT:app.manifest");
    }
}
