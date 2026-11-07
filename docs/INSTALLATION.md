# Installation and removal

> **Warning:** Advanced mode modifies the Windows device/driver environment and may require disabling Secure Boot, enabling Test Signing and adding a test certificate to trusted stores. Do not experiment on a production machine without understanding the impact and having a recovery plan.

## Supported environment

Windows 10 (1809+) / Windows 11 x64 with administrative access. Driver builds require a compatible Windows Driver Kit (WDK). Support for other architectures and every Windows build has not been established.

## Obtain a package

Download an archive or installer from [GitHub Releases](https://github.com/TheMRVX/sarab/releases). Compare any published SHA256 checksums with the downloaded files. A test-signed release is **not** Microsoft production-attested.

The current release workflow constructs a ZIP containing `sarab.exe`, `SarabGnss.inf`, `SarabGnss.dll`, `SarabGnss.cat`, `SarabGnss.cer` and supporting files, and attempts to produce an Inno Setup executable. Inspect actual assets before choosing an installation method.

## Package choices: Installer vs. Portable ZIP

Sarab is available in two distribution packages:

1. **Windows Installer (`SarabSetup-vX.Y.Z.exe`)**:
   - Performs an elevated, system-wide installation into `{autopf}\Sarab` (default: `%ProgramFiles%\Sarab`).
   - Automatically provisions Start Menu shortcuts:
     - **Sarab Virtual GNSS Control Panel** (launches browser dashboard).
     - **Sarab Command Prompt** (command shell opened directly into the installation directory).
     - Uninstall shortcut.
   - **System PATH integration**: Includes an installer task named **Add Sarab to PATH** (checked by default). When enabled, it appends the chosen installation folder to the system-wide PATH (`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`) and broadcasts a Windows environment update (`WM_SETTINGCHANGE`).
   - **Opting out of PATH**:
     - *Interactive installation*: Uncheck **Add Sarab to PATH** on the *Select Additional Tasks* wizard screen.
     - *Silent/automated installation*: Pass `/TASKS="!addtopath"` (or specify explicit tasks without `addtopath`, e.g. `SarabSetup-vX.Y.Z.exe /VERYSILENT /TASKS="autostartservice"`).
   - **Terminal inheritance**: Running terminal sessions (PowerShell, Command Prompt, Windows Terminal) do not dynamically reload PATH modified by another process. **Open a fresh terminal window** after installation to run `sarab` directly.
   - **Uninstall and upgrades**: The installer registers ownership of the PATH entry it added. On uninstallation, only installer-owned entries are removed; pre-existing matching PATH entries and unrelated tools are preserved. On upgrade, any previously added PATH entry is updated if the installation directory changed, or cleanly removed if PATH is unchecked during upgrade.

2. **Portable ZIP (`sarab-vX.Y.Z-x64.zip`)**:
   - Contains standalone binaries and driver files. Extract to any directory (such as `C:\Tools\Sarab`).
   - Does not touch the Windows Registry, system PATH, or Start Menu shortcuts.
   - Run from the extracted folder using `.\sarab.exe <command>` or via explicit absolute path.

## Invoking the CLI

Depending on your installation type and PATH configuration:

- **When Sarab is on PATH (default installer option in a fresh terminal)**:
  ```powershell
  sarab --version
  sarab status
  sarab token
  ```
- **When Sarab is not on PATH (or running portable ZIP)**:
  - **PowerShell (with call operator `&` and quoted path)**:
    ```powershell
    & "$env:ProgramFiles\Sarab\sarab.exe" status
    & "$env:ProgramFiles\Sarab\sarab.exe" token
    ```
    Or navigate to the folder first:
    ```powershell
    cd "$env:ProgramFiles\Sarab"
    .\sarab.exe status
    ```
  - **Command Prompt**:
    ```cmd
    "%ProgramFiles%\Sarab\sarab.exe" status
    ```
    Or navigate using `/d` to switch drives if required:
    ```cmd
    cd /d "%ProgramFiles%\Sarab"
    sarab.exe status
    ```
  - **Sarab Command Prompt shortcut**:
    Open **Start Menu > Sarab Virtual GNSS > Sarab Command Prompt**. This pre-configures the working directory in the installation folder with `sarab.exe` immediately executable.

### If sarab is not recognized

The Windows installer enables the **Add Sarab to PATH** task by default. However, Command Prompt and PowerShell windows that were already open before installation started do not automatically inherit the updated system PATH environment variable.

To use `sarab` directly:
1. Close your existing terminal window.
2. Open a new Command Prompt or PowerShell window.
3. Verify the installation by running:
   ```cmd
   sarab --version
   ```

If `sarab` remains unrecognized, choose one of the following alternatives:

1. **Launch Sarab Command Prompt from the Start Menu**
   Open **Start Menu > Sarab Virtual GNSS > Sarab Command Prompt**. This pre-configures a Command Prompt session in the Sarab installation directory with `sarab.exe` immediately available.

2. **Run from the installation directory**
   Navigate to the directory where Sarab was installed (or extracted, if using the portable ZIP package):
   - In PowerShell:
     ```powershell
     cd "$env:ProgramFiles\Sarab"
     .\sarab.exe token --raw
     ```
   - In Command Prompt:
     ```cmd
     cd /d "%ProgramFiles%\Sarab"
     sarab.exe token --raw
     ```

3. **Run using the full installation path**
   Execute the binary directly by specifying its absolute path:
   - In PowerShell (using the call operator `&`):
     ```powershell
     & "$env:ProgramFiles\Sarab\sarab.exe" token --raw
     ```
   - In Command Prompt:
     ```cmd
     "%ProgramFiles%\Sarab\sarab.exe" token --raw
     ```

> **Note:** If you chose a custom installation directory during setup, replace `$env:ProgramFiles\Sarab` or `%ProgramFiles%\Sarab` with your chosen directory path. The portable ZIP package does not modify PATH automatically; portable installations must be run either from their extracted directory or via their full path.

## Simple mode: no driver

Open an elevated PowerShell terminal and run:

```powershell
sarab simple --lat 35.6997 --lon 51.3380
# Or if not on PATH:
# .\sarab.exe simple --lat 35.6997 --lon 51.3380
```

This updates default-location values for `lfsvc`. It does not install or enable a virtual GNSS device, and other location providers may take precedence. You can skip the advanced-mode steps below.

## Advanced mode: virtual sensor

1. Back up important data. Ensure access to your BitLocker or device-encryption recovery key. Secure Boot or BCD changes can cause recovery prompts. Consider a dedicated VM/test PC.
2. Inspect Secure Boot state and Windows device/security policies. If a test-signed driver is permitted and required, disable Secure Boot **using your computer's documented firmware procedure**. Re-enable it when you finish testing.
3. In an **elevated** terminal, enable Test Signing and restart:

   ```powershell
   bcdedit /set testsigning on
   shutdown /r /t 0
   ```

   This can fail when firmware or organization policies prevent changing boot configuration. Do not bypass managed-device policies.

4. Ensure Windows Location services and appropriate application access permissions are enabled in Windows Settings.
5. Extract the release ZIP and run from its directory:

   ```powershell
   .\sarab.exe driver install
   .\sarab.exe status
   ```

   The installer code looks for the INF and similarly named CER. `driver install` can import the provided test certificate into Windows `Root` and `TrustedPublisher` stores. Review which certificate will be imported before running.

6. Confirm device status in Windows Device Manager (Sensors) and check actual location API readings with `sarab.exe read`.

For troubleshooting, see [USAGE.md](USAGE.md#limitations-and-troubleshooting).

## Installer notes

`SarabSetup-vX.Y.Z.exe` (when present) is an administrator-elevated Inno Setup installer that can install the driver and optionally install/start a Windows background service. It is not a no-privilege alternative to the steps above. Inspect its security implications, including installation of the test certificate, before running.

## Remove and restore

From an elevated terminal:

```powershell
.\sarab.exe disable
.\sarab.exe service stop
.\sarab.exe service uninstall
.\sarab.exe driver uninstall
```

Only run service commands if the service was installed. Check device and certificate cleanup in Windows settings; certificate removal is security-sensitive. To turn Test Signing off after it is no longer needed:

```powershell
bcdedit /set testsigning off
shutdown /r /t 0
```

Re-enable Secure Boot through firmware settings if you disabled it, after confirming the device can boot safely. For Simple Mode, the code writes the system-default location under `HKLM\System\CurrentControlSet\Services\lfsvc\Service\Configuration`; restoration of those registry values requires an administrator and a known pre-change baseline. **Do not remove arbitrary registry values or certificates without verifying ownership.**
