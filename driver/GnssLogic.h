// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright (c) 2026 TheMRVX. Licensed under MIT OR Apache-2.0.

#pragma once

#include "GnssDriverDef.h"

// State for 1Hz Gauss-Markov / Ornstein-Uhlenbeck drift filter
struct DriftState {
    double dNorth; // North offset in meters
    double dEast;  // East offset in meters
    double dUp;    // Up offset in meters
    unsigned int seed;
    BOOL initialized;
};

struct SpoofConfig {
    double Latitude;
    double Longitude;
    double Altitude;
    double Accuracy;
    BOOL   Enabled;
    BOOL   DriftEnabled;
    double DriftRadiusMeters;
    double Heading;
    double Speed;
    BOOL   RtkShieldEnabled;
    ULONG  EnvironmentMode;
};

// Reads the current configuration from registry parameters
void LoadSpoofConfigFromRegistry(SpoofConfig* config);

// Fills GNSS_EVENT (wrapping GNSS_FIXDATA) and completes the WDF request
NTSTATUS CompleteFixRequest(WDFREQUEST Request, ULONG FixSessionID, GNSS_FIXSESSIONTYPE SessionType, const SpoofConfig* config, DriftState* drift);
