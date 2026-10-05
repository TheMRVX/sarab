#pragma once

#include "Device.h"

WDF_EXTERN_C_START

NTSTATUS DriverEntry(
    _In_ PDRIVER_OBJECT  DriverObject,
    _In_ PUNICODE_STRING RegistryPath
);

EVT_WDF_DRIVER_DEVICE_ADD SarabEvtDeviceAdd;

WDF_EXTERN_C_END
