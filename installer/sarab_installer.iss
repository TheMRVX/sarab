; SPDX-License-Identifier: MIT OR Apache-2.0
; Script generated for Sarab Virtual GNSS Suite
; Inno Setup 6.x Script
#define MyAppName "Sarab Virtual GNSS"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.5"
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
LicenseFile=..\release_package\LICENSE-CHOICE.txt
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
ChangesEnvironment=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "addtopath"; Description: "Add Sarab to PATH environment variable"; GroupDescription: "System Integration:"
Name: "autostartservice"; Description: "Install and run Sarab Background Service automatically"; GroupDescription: "System Integration:"; Flags: checkedonce

[Files]
Source: "..\release_package\sarab.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.inf"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.cat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\SarabGnss.cer"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\LICENSE-CHOICE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE-MIT"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE-APACHE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\NOTICE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release_package\THIRD-PARTY-NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\LICENSING.md"; DestDir: "{app}"; DestName: "LICENSING.md"; Flags: ignoreversion

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

[Code]
// SPDX-License-Identifier: MIT OR Apache-2.0
const
  WM_SETTINGCHANGE = $001A;
  SMTO_ABORTIFHUNG = $0002;
  ENV_KEY = 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment';
  SARAB_REG_KEY = 'Software\TheMRVX\Sarab';

function SendMessageTimeout(
  hWnd: HWND;
  Msg: Cardinal;
  wParam: LongInt;
  lParam: String;
  fuFlags: Cardinal;
  uTimeout: Cardinal;
  var lpdwResult: Cardinal
): LongInt; external 'SendMessageTimeoutW@user32.dll stdcall';

procedure RefreshEnvironment;
var
  Res: Cardinal;
begin
  SendMessageTimeout(HWND_BROADCAST, WM_SETTINGCHANGE, 0, 'Environment', SMTO_ABORTIFHUNG, 5000, Res);
end;

function NormalizePath(P: String): String;
begin
  P := Trim(P);
  if (Length(P) >= 2) and (P[1] = '"') and (P[Length(P)] = '"') then
  begin
    P := Copy(P, 2, Length(P) - 2);
    P := Trim(P);
  end;
  while (Length(P) > 0) and (P[Length(P)] = '\') do
  begin
    Delete(P, Length(P), 1);
  end;
  Result := Uppercase(P);
end;

function IsInPath(PathList, TargetDir: String): Boolean;
var
  NormTarget, Entry: String;
  P: Integer;
begin
  Result := False;
  NormTarget := NormalizePath(TargetDir);
  if NormTarget = '' then Exit;

  while Length(PathList) > 0 do
  begin
    P := Pos(';', PathList);
    if P > 0 then
    begin
      Entry := Copy(PathList, 1, P - 1);
      Delete(PathList, 1, P);
    end
    else
    begin
      Entry := PathList;
      PathList := '';
    end;

    if NormalizePath(Entry) = NormTarget then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function RemoveFromPath(PathList, TargetDir: String): String;
var
  NormTarget, Entry, NewList: String;
  P: Integer;
begin
  NormTarget := NormalizePath(TargetDir);
  NewList := '';

  while Length(PathList) > 0 do
  begin
    P := Pos(';', PathList);
    if P > 0 then
    begin
      Entry := Copy(PathList, 1, P - 1);
      Delete(PathList, 1, P);
    end
    else
    begin
      Entry := PathList;
      PathList := '';
    end;

    Entry := Trim(Entry);
    if (Entry <> '') and (NormalizePath(Entry) <> NormTarget) then
    begin
      if NewList = '' then
        NewList := Entry
      else
        NewList := NewList + ';' + Entry;
    end;
  end;

  Result := NewList;
end;

function AddToPath(PathList, TargetDir: String): String;
begin
  TargetDir := Trim(TargetDir);
  while (Length(TargetDir) > 0) and (TargetDir[Length(TargetDir)] = '\') do
  begin
    Delete(TargetDir, Length(TargetDir), 1);
  end;

  if TargetDir = '' then
  begin
    Result := PathList;
    Exit;
  end;

  PathList := Trim(PathList);
  while (Length(PathList) > 0) and (PathList[Length(PathList)] = ';') do
  begin
    Delete(PathList, Length(PathList), 1);
  end;

  if PathList = '' then
    Result := TargetDir
  else
    Result := PathList + ';' + TargetDir;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AppDir, CurrentPath, PrevAddedPath: String;
  IsTaskSelected: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    AppDir := ExpandConstant('{app}');
    while (Length(AppDir) > 0) and (AppDir[Length(AppDir)] = '\') do
      Delete(AppDir, Length(AppDir), 1);

    IsTaskSelected := WizardIsTaskSelected('addtopath');

    PrevAddedPath := '';
    RegQueryStringValue(HKEY_LOCAL_MACHINE, SARAB_REG_KEY, 'PathAdded', PrevAddedPath);

    CurrentPath := '';
    RegQueryStringValue(HKEY_LOCAL_MACHINE, ENV_KEY, 'Path', CurrentPath);

    if IsTaskSelected then
    begin
      // If a previous path was recorded from an older install/directory and differs, remove it
      if (PrevAddedPath <> '') and (NormalizePath(PrevAddedPath) <> NormalizePath(AppDir)) then
      begin
        if IsInPath(CurrentPath, PrevAddedPath) then
        begin
          CurrentPath := RemoveFromPath(CurrentPath, PrevAddedPath);
          RegWriteExpandStringValue(HKEY_LOCAL_MACHINE, ENV_KEY, 'Path', CurrentPath);
          RefreshEnvironment;
        end;
      end;

      // Add to system PATH if not already present
      if not IsInPath(CurrentPath, AppDir) then
      begin
        CurrentPath := AddToPath(CurrentPath, AppDir);
        RegWriteExpandStringValue(HKEY_LOCAL_MACHINE, ENV_KEY, 'Path', CurrentPath);
        RegWriteStringValue(HKEY_LOCAL_MACHINE, SARAB_REG_KEY, 'PathAdded', AppDir);
        RefreshEnvironment;
      end
      else
      begin
        // If it was already in PATH:
        // Only retain ownership if our previous install added it.
        // If it was already present before Sarab installed, do not claim ownership.
        if (PrevAddedPath <> '') and (NormalizePath(PrevAddedPath) = NormalizePath(AppDir)) then
        begin
          // Retain existing ownership
        end
        else
        begin
          RegDeleteValue(HKEY_LOCAL_MACHINE, SARAB_REG_KEY, 'PathAdded');
        end;
      end;
    end
    else
    begin
      // Task unchecked: if previously added by installer, remove it
      if PrevAddedPath <> '' then
      begin
        if IsInPath(CurrentPath, PrevAddedPath) then
        begin
          CurrentPath := RemoveFromPath(CurrentPath, PrevAddedPath);
          RegWriteExpandStringValue(HKEY_LOCAL_MACHINE, ENV_KEY, 'Path', CurrentPath);
          RefreshEnvironment;
        end;
        RegDeleteValue(HKEY_LOCAL_MACHINE, SARAB_REG_KEY, 'PathAdded');
      end;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  CurrentPath, RecordedPath: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RecordedPath := '';
    if RegQueryStringValue(HKEY_LOCAL_MACHINE, SARAB_REG_KEY, 'PathAdded', RecordedPath) then
    begin
      if RecordedPath <> '' then
      begin
        CurrentPath := '';
        if RegQueryStringValue(HKEY_LOCAL_MACHINE, ENV_KEY, 'Path', CurrentPath) then
        begin
          if IsInPath(CurrentPath, RecordedPath) then
          begin
            CurrentPath := RemoveFromPath(CurrentPath, RecordedPath);
            RegWriteExpandStringValue(HKEY_LOCAL_MACHINE, ENV_KEY, 'Path', CurrentPath);
            RefreshEnvironment;
          end;
        end;
      end;
      RegDeleteValue(HKEY_LOCAL_MACHINE, SARAB_REG_KEY, 'PathAdded');
      RegDeleteKeyIfEmpty(HKEY_LOCAL_MACHINE, SARAB_REG_KEY);
      RegDeleteKeyIfEmpty(HKEY_LOCAL_MACHINE, 'Software\TheMRVX');
    end;
  end;
end;
