#include "Driver.h"
#include "Trace.h"

NTSTATUS DriverEntry(
    PDRIVER_OBJECT  DriverObject,
    PUNICODE_STRING RegistryPath
)
{
    WDF_DRIVER_CONFIG config;
    NTSTATUS status;

    TraceEvents(0, 0, "SarabGnss DriverEntry initializing");

    WDF_DRIVER_CONFIG_INIT(&config, SarabEvtDeviceAdd);

    status = WdfDriverCreate(
        DriverObject,
        RegistryPath,
        WDF_NO_OBJECT_ATTRIBUTES,
        &config,
        WDF_NO_HANDLE
    );

    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfDriverCreate failed: 0x%08X", status);
        return status;
    }

    TraceEvents(0, 0, "SarabGnss DriverEntry succeeded");
    return STATUS_SUCCESS;
}

NTSTATUS SarabEvtDeviceAdd(
    WDFDRIVER       Driver,
    PWDFDEVICE_INIT DeviceInit
)
{
    UNREFERENCED_PARAMETER(Driver);
    TraceEvents(0, 0, "SarabEvtDeviceAdd entered");

    return SarabDeviceCreate(DeviceInit);
}
