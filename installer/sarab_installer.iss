; Script generated for Sarab Virtual GNSS Suite
; Inno Setup 6.x Script
#define MyAppName "Sarab Virtual GNSS"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.1"
#endif
#define MyAppPublisher "TheMRVX"
#define MyAppURL "https://github.com/TheMRVX/sarab"
#define MyAppExeName "sarab.exe"

[Setup]
AppId={{B42E7C69-2DF1-4682-BD0E-91C7AE54E70D}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Sarab
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=.
OutputBaseFilename=SarabSetup-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline
CloseApplications=yes
RestartIfNeededByRun=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostartservice"; Description: "Install and run Sarab Background Service automatically"; GroupDescription: "System Integration:"; Flags: checkedonce

[Files]
Source: "..\release_package\sarab.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.inf"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.cat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.cer"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\NOTICE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Sarab Virtual GNSS Control Panel"; Filename: "{app}\{#MyAppExeName}"; Parameters: "gui --open"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Sarab Command Prompt"; Filename: "{cmd}"; Parameters: "/k cd /d ""{app}"" && sarab.exe status"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Sarab Virtual GNSS Control Panel"; Filename: "{app}\{#MyAppExeName}"; Parameters: "gui --open"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"

[Run]
; Step 1: Install driver and test certificate
Filename: "{app}\{#MyAppExeName}"; Parameters: "driver install"; StatusMsg: "Installing Sarab Virtual GNSS UMDF Driver & Certificate..."; Flags: runhidden
; Step 2: Install Windows background service (if task selected)
Filename: "{app}\{#MyAppExeName}"; Parameters: "service install --port 8090"; Tasks: autostartservice; StatusMsg: "Configuring Sarab Windows Background Service..."; Flags: runhidden
Filename: "{app}\{#MyAppExeName}"; Parameters: "service start"; Tasks: autostartservice; StatusMsg: "Starting Sarab Windows Background Service..."; Flags: runhidden
; Step 3: Launch GUI control panel if user desires
Filename: "{app}\{#MyAppExeName}"; Parameters: "gui --open"; Description: "Launch Sarab Virtual GNSS Control Panel"; Flags: postinstall nowait skipifsilent

[UninstallRun]
; Step 1: Stop and uninstall background service
Filename: "{app}\{#MyAppExeName}"; Parameters: "service stop"; RunOnceId: "StopService"; Flags: runhidden
Filename: "{app}\{#MyAppExeName}"; Parameters: "service uninstall"; RunOnceId: "UninstallService"; Flags: runhidden
; Step 2: Uninstall virtual driver and remove device node
Filename: "{app}\{#MyAppExeName}"; Parameters: "driver uninstall"; RunOnceId: "UninstallDriver"; Flags: runhidden
