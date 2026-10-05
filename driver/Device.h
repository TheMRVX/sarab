#pragma once

#include "GnssDriverDef.h"
#include "GnssLogic.h"

typedef struct _DEVICE_CONTEXT {
    WDFDEVICE   Device;
    WDFQUEUE    DefaultQueue;
    WDFQUEUE    FixDataQueue;       // Manual queue for pending IOCTL_GNSS_GET_FIXDATA
    WDFTIMER    FixTimer;           // Periodic timer for GNSS fix injection
    WDFWAITLOCK Lock;               // Synchronization lock

    ULONG       ActiveSessionID;
    BOOL        SessionActive;
    ULONG       TimeBetweenFixes;   // Milliseconds (default: 1000)

    SpoofConfig Config;
} DEVICE_CONTEXT, *PDEVICE_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(DEVICE_CONTEXT, DeviceGetContext)

NTSTATUS SarabDeviceCreate(PWDFDEVICE_INIT DeviceInit);

EVT_WDF_DEVICE_D0_ENTRY SarabEvtDeviceD0Entry;
EVT_WDF_DEVICE_D0_EXIT  SarabEvtDeviceD0Exit;
EVT_WDF_TIMER           SarabEvtFixTimer;
