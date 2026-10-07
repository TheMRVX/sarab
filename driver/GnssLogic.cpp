#include "GnssLogic.h"
#include "Trace.h"
#include <stdlib.h>
#include <math.h>

#define SARAB_REG_PARAMS_PATH L"System\\CurrentControlSet\\Services\\SarabGnss\\Parameters"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

// State for 1Hz Gauss-Markov / Ornstein-Uhlenbeck drift filter
struct DriftState {
    double dNorth; // North offset in meters
    double dEast;  // East offset in meters
    double dUp;    // Up offset in meters
    unsigned int seed;
    BOOL initialized;
};

static DriftState g_Drift = { 0.0, 0.0, 0.0, 0x1337C0DE, FALSE };

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
static void UpdateDrift(double sigma_h, double* out_dNorth, double* out_dEast, double* out_dUp)
{
    if (!g_Drift.initialized) {
        g_Drift.seed = (unsigned int)GetTickCount();
        g_Drift.dNorth = 0.0;
        g_Drift.dEast = 0.0;
        g_Drift.dUp = 0.0;
        g_Drift.initialized = TRUE;
    }

    if (sigma_h <= 0.001) {
        g_Drift.dNorth = 0.0;
        g_Drift.dEast = 0.0;
        g_Drift.dUp = 0.0;
        *out_dNorth = 0.0;
        *out_dEast = 0.0;
        *out_dUp = 0.0;
        return;
    }

    // Autoregressive coefficient alpha = exp(-dt / tau) where dt = 1.0s, tau ~ 9.5s -> alpha = 0.90
    const double alpha = 0.90;
    const double beta_h = sigma_h * sqrt(1.0 - alpha * alpha);

    double zN = 0.0, zE = 0.0;
    GenerateNormalPair(&g_Drift.seed, &zN, &zE);

    double zU = 0.0, zDummy = 0.0;
    GenerateNormalPair(&g_Drift.seed, &zU, &zDummy);

    // Vertical sigma is ~1.5x horizontal in real GNSS
    const double sigma_v = 1.5 * sigma_h;
    const double beta_v = sigma_v * sqrt(1.0 - alpha * alpha);

    // OU mean-reverting random walk
    g_Drift.dNorth = alpha * g_Drift.dNorth + beta_h * zN;
    g_Drift.dEast  = alpha * g_Drift.dEast  + beta_h * zE;
    g_Drift.dUp    = alpha * g_Drift.dUp    + beta_v * zU;

    *out_dNorth = g_Drift.dNorth;
    *out_dEast  = g_Drift.dEast;
    *out_dUp    = g_Drift.dUp;
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

    // Read DriftEnabled (DWORD)
    dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, L"DriftEnabled", NULL, NULL, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS) {
        config->DriftEnabled = (dwValue != 0);
    }

    // Read DriftRadius (REG_SZ or DWORD)
    dataSize = sizeof(dwValue);
    if (RegQueryValueExW(hKey, L"DriftRadius", NULL, NULL, (LPBYTE)&dwValue, &dataSize) == ERROR_SUCCESS) {
        config->DriftRadiusMeters = (double)dwValue;
    } else {
        dataSize = sizeof(strBuffer);
        if (RegQueryValueExW(hKey, L"DriftRadius", NULL, NULL, (LPBYTE)strBuffer, &dataSize) == ERROR_SUCCESS) {
            config->DriftRadiusMeters = _wtof(strBuffer);
            if (config->DriftRadiusMeters < 0.0) config->DriftRadiusMeters = 0.0;
        }
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

    TraceEvents(0, 0, "Loaded spoof config: Lat=%.6f, Lon=%.6f, Alt=%.1f, Acc=%u, Enabled=%d, Drift=%d(%.1fm)",
        config->Latitude, config->Longitude, config->Altitude, config->Accuracy, config->Enabled,
        config->DriftEnabled, config->DriftRadiusMeters);
}

NTSTATUS CompleteFixRequest(WDFREQUEST Request, ULONG FixSessionID, GNSS_FIXSESSIONTYPE SessionType, const SpoofConfig* config)
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

    // Natural drift calculations
    double finalLat = config->Latitude;
    double finalLon = config->Longitude;
    double finalAlt = config->Altitude;
    float hdop = 1.0f;
    float vdop = 1.3f;

    if (config->DriftEnabled && config->DriftRadiusMeters > 0.001) {
        double dNorth = 0.0, dEast = 0.0, dUp = 0.0;
        UpdateDrift(config->DriftRadiusMeters, &dNorth, &dEast, &dUp);

        // Convert displacement in meters to degrees
        const double metersPerDegreeLat = 111132.95;
        double radLat = config->Latitude * (M_PI / 180.0);
        double cosLat = cos(radLat);
        if (fabs(cosLat) < 0.01) cosLat = 0.01;
        double metersPerDegreeLon = 111132.95 * cosLat;

        finalLat += dNorth / metersPerDegreeLat;
        finalLon += dEast / metersPerDegreeLon;
        finalAlt += dUp;

        // Dynamic HDOP/VDOP based on normalized displacement
        double offsetDist = sqrt(dNorth * dNorth + dEast * dEast);
        hdop = (float)(0.9 + 0.3 * (offsetDist / config->DriftRadiusMeters));
        if (hdop < 0.8f) hdop = 0.8f;
        if (hdop > 2.2f) hdop = 2.2f;
        vdop = hdop * 1.3f;
    }

    // Basic fix data
    pFixData->BasicData.Size = sizeof(GNSS_FIXDATA_BASIC);
    pFixData->BasicData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->BasicData.Latitude = finalLat;
    pFixData->BasicData.Longitude = finalLon;
    pFixData->BasicData.Altitude = finalAlt;
    pFixData->BasicData.Speed = 0.0;
    pFixData->BasicData.Heading = 0.0;

    // Accuracy data
    pFixData->AccuracyData.Size = sizeof(GNSS_FIXDATA_ACCURACY);
    pFixData->AccuracyData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->AccuracyData.HorizontalAccuracy = config->Accuracy;
    pFixData->AccuracyData.AltitudeAccuracy = (ULONG)(config->Accuracy * 1.5f);
    pFixData->AccuracyData.HorizontalConfidence = 95;
    pFixData->AccuracyData.AltitudeConfidence = 95;
    pFixData->AccuracyData.PositionDilutionOfPrecision = (float)sqrt(hdop * hdop + vdop * vdop);
    pFixData->AccuracyData.HorizontalDilutionOfPrecision = hdop;
    pFixData->AccuracyData.VerticalDilutionOfPrecision = vdop;

    // Satellite telemetry data (simulate 4 locked GPS satellites with realistic elevation-dependent SNR)
    pFixData->SatelliteData.Size = sizeof(GNSS_FIXDATA_SATELLITE);
    pFixData->SatelliteData.Version = GNSS_DRIVER_VERSION_1;
    pFixData->SatelliteData.SatelliteCount = 4;
    for (ULONG i = 0; i < 4; i++) {
        pFixData->SatelliteData.SatelliteArray[i].SatelliteId = i + 1;
        pFixData->SatelliteData.SatelliteArray[i].UsedInPositiong = TRUE;
        double elevation = 35.0 + i * 15.0; // 35, 50, 65, 80 degrees
        pFixData->SatelliteData.SatelliteArray[i].Elevation = elevation;
        pFixData->SatelliteData.SatelliteArray[i].Azimuth = 45.0 + i * 75.0;

        // Elevation-dependent SNR with micro-scintillation (28 to 44 dB-Hz)
        double radElev = elevation * (M_PI / 180.0);
        double baseSnr = 28.0 + 15.0 * sin(radElev);
        double scint = ((double)(i % 3) - 1.0) * 0.7;
        pFixData->SatelliteData.SatelliteArray[i].SignalToNoiseRatio = baseSnr + scint;
    }

    WdfRequestCompleteWithInformation(Request, STATUS_SUCCESS, sizeof(GNSS_EVENT));
    TraceEvents(0, 0, "Completed GNSS_EVENT Fix for Session %u: Lat=%.7f Lon=%.7f Alt=%.2f Acc=%u HDOP=%.2f",
        FixSessionID, finalLat, finalLon, finalAlt, config->Accuracy, hdop);

    return STATUS_SUCCESS;
}
