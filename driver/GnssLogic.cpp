#include "GnssLogic.h"
#include "Trace.h"
#include <stdlib.h>

#define SARAB_REG_PARAMS_PATH L"System\\CurrentControlSet\\Services\\SarabGnss\\Parameters"

void LoadSpoofConfigFromRegistry(SpoofConfig* config)
{
    if (!config) return;

    // Default values (Azadi Square, Tehran)
    config->Latitude = 35.6997;
    config->Longitude = 51.3380;
    config->Altitude = 1200.0;
    config->Accuracy = 5;
    config->Enabled = TRUE;

    HKEY hKey = NULL;
    LONG status = RegOpenKeyExW(HKEY_LOCAL_MACHINE, SARAB_REG_PARAMS_PATH, 0, KEY_READ, &hKey);
    if (status != ERROR_SUCCESS) {
        TraceEvents(0, 0, "Failed to open registry key: %d (using defaults)", status);
        return;
    }

    wchar_t strBuffer[128];
    DWORD dataSize = 0;
    DWORD dwValue = 0;

    // Read Enabled (DWORD)
    dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, L"Enabled", NULL, NULL, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS) {
        config->Enabled = (dwValue != 0);
    }

    // Read Latitude (REG_SZ)
    dataSize = sizeof(strBuffer);
    if (RegQueryValueExW(hKey, L"Latitude", NULL, NULL, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS) {
        config->Latitude = _wtof(strBuffer);
    }

    // Read Longitude (REG_SZ)
    dataSize = sizeof(strBuffer);
    if (RegQueryValueExW(hKey, L"Longitude", NULL, NULL, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS) {
        config->Longitude = _wtof(strBuffer);
    }

    // Read Altitude (REG_SZ)
    dataSize = sizeof(strBuffer);
    if (RegQueryValueExW(hKey, L"Altitude", NULL, NULL, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS) {
        config->Altitude = _wtof(strBuffer);
    }

    // Read Accuracy (REG_SZ or DWORD)
    dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, L"Accuracy", NULL, NULL, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS) {
        config->Accuracy = dwValue;
    } else {
        dataSize = sizeof(strBuffer);
        if (RegQueryValueExW(hKey, L"Accuracy", NULL, NULL, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS) {
            config->Accuracy = (ULONG)_wtoi(strBuffer);
        }
    }

    RegCloseKey(hKey);

    TraceEvents(0, 0, "Loaded spoof config: Lat=%.6f, Lon=%.6f, Alt=%.1f, Acc=%u, Enabled=%d",
        config->Latitude, config->Longitude, config->Altitude, config->Accuracy, config->Enabled);
}

NTSTATUS CompleteFixRequest(WDFREQUEST Request, ULONG FixSessionID, GNSS_FIXSESSIONTYPE SessionType, const SpoofConfig* config)
{
    PGNSS_FIXDATA pFixData = NULL;
    size_t outBufferSize = 0;

    NTSTATUS status = WdfRequestRetrieveOutputBuffer(Request, sizeof(GNSS_FIXDATA), (PVOID*)&pFixData, &outBufferSize);
    if (!NT_SUCCESS(status) || pFixData == NULL) {
        TraceEvents(0, 0, "WdfRequestRetrieveOutputBuffer failed: 0x%08X", status);
        WdfRequestComplete(Request, status);
        return status;
    }

    if (!config || !config->Enabled) {
        TraceEvents(0, 0, "Fix requested but spoofing is disabled");
        WdfRequestComplete(Request, STATUS_UNSUCCESSFUL);
        return STATUS_UNSUCCESSFUL;
    }

    RtlZeroMemory(pFixData, sizeof(GNSS_FIXDATA));

    pFixData->Size = sizeof(GNSS_FIXDATA);
    pFixData->Version = GNSS_DRIVER_VERSION_1;
    pFixData->FixSessionID = FixSessionID;
    GetSystemTimeAsFileTime(&pFixData->FixTimeStamp);
    pFixData->IsFinalFix = (SessionType == GNSS_FixSession_SingleShot);
    pFixData->FixStatus = STATUS_SUCCESS;
    pFixData->FixLevelOfDetails = GNSS_FIXDETAIL_BASIC | GNSS_FIXDETAIL_ACCURACY | GNSS_FIXDETAIL_SATELLITE;

    // Basic fix data
    pFixData->BasicData.Size = sizeof(GNSS_FIXDATA_BASIC);
    pFixData->BasicData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->BasicData.Latitude = config->Latitude;
    pFixData->BasicData.Longitude = config->Longitude;
    pFixData->BasicData.Altitude = config->Altitude;
    pFixData->BasicData.Speed = 0.0;
    pFixData->BasicData.Heading = 0.0;

    // Accuracy data
    pFixData->AccuracyData.Size = sizeof(GNSS_FIXDATA_ACCURACY);
    pFixData->AccuracyData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->AccuracyData.HorizontalAccuracy = config->Accuracy;
    pFixData->AccuracyData.AltitudeAccuracy = config->Accuracy;
    pFixData->AccuracyData.HorizontalConfidence = 95;
    pFixData->AccuracyData.AltitudeConfidence = 95;
    pFixData->AccuracyData.PositionDilutionOfPrecision = 1.0f;
    pFixData->AccuracyData.HorizontalDilutionOfPrecision = 1.0f;
    pFixData->AccuracyData.VerticalDilutionOfPrecision = 1.0f;

    // Satellite telemetry data (simulate 4 locked GPS satellites)
    pFixData->SatelliteData.Size = sizeof(GNSS_FIXDATA_SATELLITE);
    pFixData->SatelliteData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->SatelliteData.SatelliteCount = 4;
    for (ULONG i = 0; i < 4; i++) {
        pFixData->SatelliteData.SatelliteArray[i].SatelliteId = i + 1;
        pFixData->SatelliteData.SatelliteArray[i].UsedInPositiong = TRUE;
        pFixData->SatelliteData.SatelliteArray[i].Elevation = 45.0 + i * 10.0;
        pFixData->SatelliteData.SatelliteArray[i].Azimuth = 90.0 + i * 45.0;
        pFixData->SatelliteData.SatelliteArray[i].SignalToNoiseRatio = 38.0;
    }

    WdfRequestCompleteWithInformation(Request, STATUS_SUCCESS, sizeof(GNSS_FIXDATA));
    TraceEvents(0, 0, "Completed fix for Session %u (Type=%d, Final=%d): Lat=%.6f Lon=%.6f Acc=%u",
        FixSessionID, (int)SessionType, (int)pFixData->IsFinalFix, config->Latitude, config->Longitude, config->Accuracy);

    return STATUS_SUCCESS;
}
