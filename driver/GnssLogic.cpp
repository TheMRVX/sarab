// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 TheMRVX. Licensed under MIT OR Apache-2.0.

#include "GnssLogic.h"
#include "Trace.h"
#include <stdlib.h>
#include <math.h>

#define SARAB_REG_PARAMS_PATH L"System\\CurrentControlSet\\Services\\SarabGnss\\Parameters"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// Uniform random in (0, 1]
static double UniformRandom(unsigned int* seed)
{
    *seed = (*seed * 1103515245 + 12345) & 0x7FFFFFFF;
    return ((double)(*seed % 65536) + 1.0) / 65537.0;
}

// Box-Muller transform for standard normal N(0, 1) variates
static void GenerateNormalPair(unsigned int* seed, double* z0, double* z1)
{
    double u1 = UniformRandom(seed);
    double u2 = UniformRandom(seed);
    if (u1 <= 1e-15) u1 = 1e-15;
    double r = sqrt(-2.0 * log(u1));
    double theta = 2.0 * M_PI * u2;
    *z0 = r * cos(theta);
    *z1 = r * sin(theta);
}

// 1Hz Gauss-Markov / Ornstein-Uhlenbeck drift step
static void UpdateDrift(DriftState* drift, double sigma_h, double* out_dNorth, double* out_dEast, double* out_dUp)
{
    if (!drift) {
        *out_dNorth = 0.0;
        *out_dEast = 0.0;
        *out_dUp = 0.0;
        return;
    }

    if (!drift->initialized) {
        drift->seed = 0x1337C0DE ^ (unsigned int)GetTickCount();
        drift->dNorth = 0.0;
        drift->dEast = 0.0;
        drift->dUp = 0.0;
        drift->initialized = TRUE;
    }

    if (sigma_h <= 0.001) {
        drift->dNorth = 0.0;
        drift->dEast = 0.0;
        drift->dUp = 0.0;
        *out_dNorth = 0.0;
        *out_dEast = 0.0;
        *out_dUp = 0.0;
        return;
    }

    // Autoregressive coefficient alpha = exp(-dt / tau) where dt = 1.0s, tau ~ 9.5s -> alpha = 0.90
    const double alpha = 0.90;
    const double beta_h = sigma_h * sqrt(1.0 - alpha * alpha);

    double zN = 0.0, zE = 0.0;
    GenerateNormalPair(&drift->seed, &zN, &zE);

    double zU = 0.0, zDummy = 0.0;
    GenerateNormalPair(&drift->seed, &zU, &zDummy);

    // Vertical sigma is ~1.5x horizontal in real GNSS
    const double sigma_v = 1.5 * sigma_h;
    const double beta_v = sigma_v * sqrt(1.0 - alpha * alpha);

    // OU mean-reverting random walk
    drift->dNorth = alpha * drift->dNorth + beta_h * zN;
    drift->dEast  = alpha * drift->dEast  + beta_h * zE;
    drift->dUp    = alpha * drift->dUp    + beta_v * zU;

    *out_dNorth = drift->dNorth;
    *out_dEast  = drift->dEast;
    *out_dUp    = drift->dUp;
}

static BOOL ReadRegistryBool(HKEY hKey, const wchar_t* name, BOOL defaultValue)
{
    DWORD dwValue = 0;
    DWORD dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, name, NULL, NULL, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS) {
        return (dwValue != 0);
    }
    return defaultValue;
}

static double ReadRegistryDouble(HKEY hKey, const wchar_t* name, double defaultValue)
{
    DWORD dwType = 0;
    DWORD dwValue = 0;
    DWORD dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, name, NULL, &dwType, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS && dwType == REG_DWORD) {
        return (double)dwValue;
    }
    wchar_t strBuffer[128];
    dataSize = sizeof(strBuffer) - sizeof(wchar_t);
    if (RegQueryValueExW(hKey, name, NULL, &dwType, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS && dwType == REG_SZ) {
        strBuffer[127] = L'\0';
        return _wtof(strBuffer);
    }
    return defaultValue;
}

static ULONG ReadRegistryUlong(HKEY hKey, const wchar_t* name, ULONG defaultValue)
{
    DWORD dwType = 0;
    DWORD dwValue = 0;
    DWORD dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, name, NULL, &dwType, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS && dwType == REG_DWORD) {
        return (ULONG)dwValue;
    }
    wchar_t strBuffer[128];
    dataSize = sizeof(strBuffer) - sizeof(wchar_t);
    if (RegQueryValueExW(hKey, name, NULL, &dwType, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS && dwType == REG_SZ) {
        strBuffer[127] = L'\0';
        return (ULONG)_wtoi(strBuffer);
    }
    return defaultValue;
}

void LoadSpoofConfigFromRegistry(SpoofConfig* config)
{
    if (!config) return;

    // Default values (Azadi Square, Tehran)
    config->Latitude = 35.6997;
    config->Longitude = 51.3380;
    config->Altitude = 1200.0;
    config->Accuracy = 5;
    config->Enabled = TRUE;
    config->DriftEnabled = TRUE;
    config->DriftRadiusMeters = 1.2;
    config->Heading = 0.0;
    config->Speed = 0.0;

    HKEY hKey = NULL;
    LONG status = RegOpenKeyExW(HKEY_LOCAL_MACHINE, SARAB_REG_PARAMS_PATH, 0, KEY_READ, &hKey);
    if (status != ERROR_SUCCESS) {
        TraceEvents(0, 0, "Failed to open registry key: %d (using defaults)", status);
        return;
    }

    config->Enabled           = ReadRegistryBool(hKey, L"Enabled", config->Enabled);
    config->DriftEnabled      = ReadRegistryBool(hKey, L"DriftEnabled", config->DriftEnabled);
    config->DriftRadiusMeters = ReadRegistryDouble(hKey, L"DriftRadius", config->DriftRadiusMeters);
    if (config->DriftRadiusMeters < 0.0) config->DriftRadiusMeters = 0.0;

    config->Latitude          = ReadRegistryDouble(hKey, L"Latitude", config->Latitude);
    config->Longitude         = ReadRegistryDouble(hKey, L"Longitude", config->Longitude);
    config->Altitude          = ReadRegistryDouble(hKey, L"Altitude", config->Altitude);
    config->Accuracy          = ReadRegistryDouble(hKey, L"Accuracy", config->Accuracy);
    config->Heading           = ReadRegistryDouble(hKey, L"Heading", config->Heading);
    config->Speed             = ReadRegistryDouble(hKey, L"Speed", config->Speed);
    config->RtkShieldEnabled  = ReadRegistryBool(hKey, L"RtkShield", TRUE);
    config->EnvironmentMode   = ReadRegistryUlong(hKey, L"EnvironmentMode", 0);

    if (config->Heading < 0.0) config->Heading = 0.0;
    while (config->Heading >= 360.0) config->Heading -= 360.0;
    if (config->Speed < 0.0) config->Speed = 0.0;

    RegCloseKey(hKey);

    TraceEvents(0, 0, "Loaded spoof config: Lat=%.6f, Lon=%.6f, Alt=%.1f, Acc=%.1f, Enabled=%d, Drift=%d(%.1fm), Heading=%.1f, Speed=%.1fm/s",
        config->Latitude, config->Longitude, config->Altitude, config->Accuracy, config->Enabled,
        config->DriftEnabled, config->DriftRadiusMeters, config->Heading, config->Speed);
}

static void CalculateDriftedPosition(const SpoofConfig* config, DriftState* drift, double* outLat, double* outLon, double* outAlt, float* outHdop, float* outVdop)
{
    *outLat = config->Latitude;
    *outLon = config->Longitude;
    *outAlt = config->Altitude;
    *outHdop = 1.0f;
    *outVdop = 1.3f;

    if (!config->DriftEnabled || config->DriftRadiusMeters <= 0.001) {
        return;
    }

    double dNorth = 0.0, dEast = 0.0, dUp = 0.0;
    UpdateDrift(drift, config->DriftRadiusMeters, &dNorth, &dEast, &dUp);

    const double metersPerDegreeLat = 111132.95;
    double radLat = config->Latitude * (M_PI / 180.0);
    double cosLat = cos(radLat);
    if (fabs(cosLat) < 0.01) cosLat = 0.01;
    double metersPerDegreeLon = 111132.95 * cosLat;

    *outLat += dNorth / metersPerDegreeLat;
    *outLon += dEast / metersPerDegreeLon;
    *outAlt += dUp;

    if (*outLat > 90.0) *outLat = 90.0;
    if (*outLat < -90.0) *outLat = -90.0;
    while (*outLon > 180.0) *outLon -= 360.0;
    while (*outLon < -180.0) *outLon += 360.0;

    double offsetDist = sqrt(dNorth * dNorth + dEast * dEast);
    *outHdop = (float)(0.9 + 0.3 * (offsetDist / config->DriftRadiusMeters));
    if (*outHdop < 0.8f) *outHdop = 0.8f;
    if (*outHdop > 2.2f) *outHdop = 2.2f;
    *outVdop = *outHdop * 1.3f;
}

static bool PopulateSpecialEnvironmentAccuracy(PGNSS_FIXDATA_ACCURACY pAccData, const SpoofConfig* config, float hdop, float vdop)
{
    switch (config->EnvironmentMode)
    {
    case 3:
        // Underground parking mode: complete satellite obstruction, zero signal confidence
        pAccData->HorizontalAccuracy = (ULONG)((config->Accuracy > 50.0) ? config->Accuracy : 50.0);
        pAccData->AltitudeAccuracy = pAccData->HorizontalAccuracy * 2;
        pAccData->HeadingAccuracy = 45;
        pAccData->SpeedAccuracy = 10;
        pAccData->HorizontalConfidence = 20;
        pAccData->AltitudeConfidence = 20;
        pAccData->HeadingConfidence = 20;
        pAccData->SpeedConfidence = 20;
        pAccData->HorizontalDilutionOfPrecision = 25.0f;
        pAccData->VerticalDilutionOfPrecision = 35.0f;
        return true;

    case 2:
        // Tunnel / Dead Reckoning mode: complete loss of line-of-sight satellite signals
        pAccData->HorizontalAccuracy = (ULONG)((config->Accuracy > 20.0) ? config->Accuracy : 25.0);
        pAccData->AltitudeAccuracy = pAccData->HorizontalAccuracy * 2;
        pAccData->HeadingAccuracy = 25;
        pAccData->SpeedAccuracy = 5;
        pAccData->HorizontalConfidence = 50;
        pAccData->AltitudeConfidence = 50;
        pAccData->HeadingConfidence = 60;
        pAccData->SpeedConfidence = 70;
        pAccData->HorizontalDilutionOfPrecision = 12.0f;
        pAccData->VerticalDilutionOfPrecision = 18.0f;
        return true;

    case 1:
        // Urban Canyon multipath mode: building reflections and higher HDOP
        pAccData->HorizontalAccuracy = (ULONG)((config->Accuracy > 10.0) ? config->Accuracy : 12.0);
        pAccData->AltitudeAccuracy = (ULONG)(pAccData->HorizontalAccuracy * 1.5f);
        pAccData->HeadingAccuracy = 10;
        pAccData->SpeedAccuracy = 2;
        pAccData->HorizontalConfidence = 80;
        pAccData->AltitudeConfidence = 80;
        pAccData->HeadingConfidence = 85;
        pAccData->SpeedConfidence = 85;
        pAccData->HorizontalDilutionOfPrecision = (hdop < 2.5f) ? 2.5f : hdop;
        pAccData->VerticalDilutionOfPrecision = (vdop < 3.2f) ? 3.2f : vdop;
        return true;

    default:
        return false;
    }
}

static void PopulateAccuracyData(PGNSS_FIXDATA_ACCURACY pAccData, const SpoofConfig* config, float hdop, float vdop)
{
    pAccData->Size = sizeof(GNSS_FIXDATA_ACCURACY);
    pAccData->Version = GNSS_DRIVER_VERSION_1;

    if (!PopulateSpecialEnvironmentAccuracy(pAccData, config, hdop, vdop))
    {
        if (config->RtkShieldEnabled)
        {
            // High-precision RTK Carrier-Phase fix simulation to supersede Wi-Fi BSSID triangulation
            pAccData->HorizontalAccuracy = 1;
            pAccData->AltitudeAccuracy = 1;
            pAccData->HeadingAccuracy = 2;
            pAccData->SpeedAccuracy = 1;
            pAccData->HorizontalConfidence = 99;
            pAccData->AltitudeConfidence = 99;
            pAccData->HeadingConfidence = 99;
            pAccData->SpeedConfidence = 99;
            pAccData->HorizontalDilutionOfPrecision = (hdop < 0.6f) ? hdop : 0.6f;
            pAccData->VerticalDilutionOfPrecision = (vdop < 0.8f) ? vdop : 0.8f;
        }
        else
        {
            pAccData->HorizontalAccuracy = (ULONG)((config->Accuracy < 1.0) ? 1.0 : config->Accuracy);
            pAccData->AltitudeAccuracy = (ULONG)((config->Accuracy * 1.5f < 1.0f) ? 1.0f : (config->Accuracy * 1.5f));
            pAccData->HeadingAccuracy = (config->Speed > 0.5) ? 5 : 20;
            pAccData->SpeedAccuracy = 1;
            pAccData->HorizontalConfidence = 95;
            pAccData->AltitudeConfidence = 95;
            pAccData->HeadingConfidence = 95;
            pAccData->SpeedConfidence = 95;
            pAccData->HorizontalDilutionOfPrecision = hdop;
            pAccData->VerticalDilutionOfPrecision = vdop;
        }
    }

    pAccData->PositionDilutionOfPrecision = (float)sqrt(
        pAccData->HorizontalDilutionOfPrecision * pAccData->HorizontalDilutionOfPrecision +
        pAccData->VerticalDilutionOfPrecision * pAccData->VerticalDilutionOfPrecision
    );
}

static void PopulateSatelliteTelemetry(PGNSS_FIXDATA_SATELLITE pSatData, ULONG environmentMode)
{
    pSatData->Size = sizeof(GNSS_FIXDATA_SATELLITE);
    pSatData->Version = GNSS_DRIVER_VERSION_1;

    if (environmentMode == 2 || environmentMode == 3) {
        // Tunnel / Underground: Zero visible satellites
        pSatData->SatelliteCount = 0;
        return;
    }

    ULONG satCount = (environmentMode == 1) ? 5 : 12;
    pSatData->SatelliteCount = satCount;
    for (ULONG i = 0; i < satCount; i++) {
        pSatData->SatelliteArray[i].SatelliteId = i + 1;
        pSatData->SatelliteArray[i].UsedInPositiong = TRUE;
        double minElev = (environmentMode == 1) ? 45.0 : 25.0;
        double elevation = minElev + (double)((i * 17) % (ULONG)(90.0 - minElev));
        pSatData->SatelliteArray[i].Elevation = elevation;
        pSatData->SatelliteArray[i].Azimuth = (double)(i * 30 + 15);

        double radElev = elevation * (M_PI / 180.0);
        double baseSnr = (environmentMode == 1) ? (20.0 + 6.0 * sin(radElev)) : (35.0 + 10.0 * sin(radElev));
        double scint = ((double)(i % 3) - 1.0) * 0.5;
        pSatData->SatelliteArray[i].SignalToNoiseRatio = baseSnr + scint;
    }
}

NTSTATUS CompleteFixRequest(WDFREQUEST Request, ULONG FixSessionID, GNSS_FIXSESSIONTYPE SessionType, const SpoofConfig* config, DriftState* drift)
{
    PGNSS_EVENT pEvent = NULL;
    size_t outBufferSize = 0;

    NTSTATUS status = WdfRequestRetrieveOutputBuffer(Request, sizeof(GNSS_EVENT), (PVOID*)&pEvent, &outBufferSize);
    if (!NT_SUCCESS(status) || pEvent == NULL) {
        TraceEvents(0, 0, "WdfRequestRetrieveOutputBuffer failed: 0x%08X (buffer size: %Iu, expected: %Iu)",
            status, outBufferSize, sizeof(GNSS_EVENT));
        WdfRequestComplete(Request, status);
        return status;
    }

    if (!config || !config->Enabled) {
        TraceEvents(0, 0, "Fix requested but spoofing is disabled");
        WdfRequestComplete(Request, STATUS_UNSUCCESSFUL);
        return STATUS_UNSUCCESSFUL;
    }

    RtlZeroMemory(pEvent, sizeof(GNSS_EVENT));
    pEvent->Size = sizeof(GNSS_EVENT);
    pEvent->Version = GNSS_DRIVER_VERSION_1;
    pEvent->EventType = GNSS_Event_FixAvailable;
    pEvent->EventDataSize = sizeof(GNSS_FIXDATA);

    PGNSS_FIXDATA pFixData = &pEvent->FixData;
    pFixData->Size = sizeof(GNSS_FIXDATA);
    pFixData->Version = GNSS_DRIVER_VERSION_1;
    pFixData->FixSessionID = FixSessionID;
    GetSystemTimeAsFileTime(&pFixData->FixTimeStamp);
    pFixData->IsFinalFix = (SessionType == GNSS_FixSession_SingleShot);
    pFixData->FixStatus = STATUS_SUCCESS;
    pFixData->FixLevelOfDetails = GNSS_FIXDETAIL_BASIC | GNSS_FIXDETAIL_ACCURACY | GNSS_FIXDETAIL_SATELLITE;

    double finalLat = 0.0, finalLon = 0.0, finalAlt = 0.0;
    float hdop = 1.0f, vdop = 1.3f;
    CalculateDriftedPosition(config, drift, &finalLat, &finalLon, &finalAlt, &hdop, &vdop);

    pFixData->BasicData.Size = sizeof(GNSS_FIXDATA_BASIC);
    pFixData->BasicData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->BasicData.Latitude = finalLat;
    pFixData->BasicData.Longitude = finalLon;
    pFixData->BasicData.Altitude = finalAlt;
    pFixData->BasicData.Speed = config->Speed;
    pFixData->BasicData.Heading = config->Heading;

    PopulateAccuracyData(&pFixData->AccuracyData, config, hdop, vdop);
    PopulateSatelliteTelemetry(&pFixData->SatelliteData, config->EnvironmentMode);

    WdfRequestCompleteWithInformation(Request, STATUS_SUCCESS, sizeof(GNSS_EVENT));
    TraceEvents(0, 0, "Completed GNSS_EVENT Fix for Session %u: Lat=%.7f Lon=%.7f Alt=%.2f Acc=%.1f HDOP=%.2f",
        FixSessionID, finalLat, finalLon, finalAlt, config->Accuracy, hdop);

    return STATUS_SUCCESS;
}
