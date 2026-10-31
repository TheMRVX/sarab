# Installation and removal

> **Warning:** Advanced mode modifies the Windows device/driver environment and may require disabling Secure Boot, enabling Test Signing and adding a test certificate to trusted stores. Do not experiment on a production machine without understanding the impact and having a recovery plan.

## Supported environment

Windows 10 (1809+) / Windows 11 x64 with administrative access. Driver builds require a compatible Windows Driver Kit (WDK). Support for other architectures and every Windows build has not been established.

## Obtain a package

Download an archive or installer from [GitHub Releases](https://github.com/TheMRVX/sarab/releases). Compare any published SHA256 checksums with the downloaded files. A test-signed release is **not** Microsoft production-attested.

The current release workflow constructs a ZIP containing `sarab.exe`, `SarabGnss.inf`, `SarabGnss.dll`, `SarabGnss.cat`, `SarabGnss.cer` and supporting files, and attempts to produce an Inno Setup executable. Inspect actual assets before choosing an installation method.

## Simple mode: no driver

Open an elevated PowerShell terminal and run:

```powershell
.\sarab.exe simple --lat 35.6997 --lon 51.3380
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
