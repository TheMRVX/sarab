#pragma once

#include "Device.h"

WDF_EXTERN_C_START

DRIVER_INITIALIZE DriverEntry;
EVT_WDF_DRIVER_DEVICE_ADD SarabEvtDeviceAdd;

WDF_EXTERN_C_END
