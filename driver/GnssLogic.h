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
NTSTATUS CompleteFixRequest(WDFREQUEST Request, ULONG FixSessionID, GNSS_FIXSESSION_TYPE SessionType, const SpoofConfig* config);
