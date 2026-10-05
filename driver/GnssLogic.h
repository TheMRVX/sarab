#pragma once

#include "GnssDriverDef.h"

struct SpoofConfig {
    double Latitude;
    double Longitude;
    double Altitude;
    ULONG  Accuracy;
    BOOL   Enabled;
};

// Reads the current configuration from registry parameters
void LoadSpoofConfigFromRegistry(SpoofConfig* config);

// Fills GNSS_FIXDATA and completes the WDF request
NTSTATUS CompleteFixRequest(WDFREQUEST Request, ULONG FixSessionID, const SpoofConfig* config);
