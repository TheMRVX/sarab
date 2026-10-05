#include "Device.h"
#include "Queue.h"
#include "Trace.h"

NTSTATUS SarabDeviceCreate(PWDFDEVICE_INIT DeviceInit)
{
    WDF_PNPPOWER_EVENT_CALLBACKS pnpPowerCallbacks;
    WDF_OBJECT_ATTRIBUTES deviceAttributes;
    WDFDEVICE device;
    PDEVICE_CONTEXT deviceContext;
    NTSTATUS status;

    WDF_PNPPOWER_EVENT_CALLBACKS_INIT(&pnpPowerCallbacks);
    pnpPowerCallbacks.EvtDeviceD0Entry = SarabEvtDeviceD0Entry;
    pnpPowerCallbacks.EvtDeviceD0Exit  = SarabEvtDeviceD0Exit;
    WdfDeviceInitSetPnpPowerEventCallbacks(DeviceInit, &pnpPowerCallbacks);

    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&deviceAttributes, DEVICE_CONTEXT);

    status = WdfDeviceCreate(&DeviceInit, &deviceAttributes, &device);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfDeviceCreate failed: 0x%08X", status);
        return status;
    }

    deviceContext = DeviceGetContext(device);
    deviceContext->Device = device;
    deviceContext->ActiveSessionID = 0;
    deviceContext->SessionType = GNSS_FixSession_ContinuousTracking;
    deviceContext->SessionActive = FALSE;
    deviceContext->TimeBetweenFixes = 1000;
    deviceContext->FixSequenceNumber = 0;

    // Create device interface for Windows Location Framework (lfsvc)
    status = WdfDeviceCreateDeviceInterface(device, &GUID_DEVINTERFACE_GNSS, NULL);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfDeviceCreateDeviceInterface failed: 0x%08X", status);
        return status;
    }

    // Create WaitLock for context synchronization
    WDF_OBJECT_ATTRIBUTES lockAttributes;
    WDF_OBJECT_ATTRIBUTES_INIT(&lockAttributes);
    lockAttributes.ParentObject = device;
    status = WdfWaitLockCreate(&lockAttributes, &deviceContext->Lock);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfWaitLockCreate failed: 0x%08X", status);
        return status;
    }

    // Create manual queue for holding pending IOCTL_GNSS_GET_FIXDATA requests
    WDF_IO_QUEUE_CONFIG manualQueueConfig;
    WDF_IO_QUEUE_CONFIG_INIT(&manualQueueConfig, WdfIoQueueDispatchManual);
    WDF_OBJECT_ATTRIBUTES queueAttributes;
    WDF_OBJECT_ATTRIBUTES_INIT(&queueAttributes);
    queueAttributes.ParentObject = device;

    status = WdfIoQueueCreate(device, &manualQueueConfig, &queueAttributes, &deviceContext->FixDataQueue);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfIoQueueCreate for manual fix queue failed: 0x%08X", status);
        return status;
    }

    // Create periodic timer for GNSS fix injection
    WDF_TIMER_CONFIG timerConfig;
    WDF_TIMER_CONFIG_INIT_PERIODIC(&timerConfig, SarabEvtFixTimer, 1000);
    WDF_OBJECT_ATTRIBUTES timerAttributes;
    WDF_OBJECT_ATTRIBUTES_INIT(&timerAttributes);
    timerAttributes.ParentObject = device;

    status = WdfTimerCreate(&timerConfig, &timerAttributes, &deviceContext->FixTimer);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfTimerCreate failed: 0x%08X", status);
        return status;
    }

    // Initialize default I/O queue for incoming IOCTLs
    status = SarabQueueInitialize(device);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "SarabQueueInitialize failed: 0x%08X", status);
        return status;
    }

    // Initial load of spoof parameters
    LoadSpoofConfigFromRegistry(&deviceContext->Config);

    TraceEvents(0, 0, "Sarab GNSS device created successfully");
    return STATUS_SUCCESS;
}

NTSTATUS SarabEvtDeviceD0Entry(WDFDEVICE Device, WDF_POWER_DEVICE_STATE PreviousState)
{
    UNREFERENCED_PARAMETER(PreviousState);
    PDEVICE_CONTEXT deviceContext = DeviceGetContext(Device);

    TraceEvents(0, 0, "SarabEvtDeviceD0Entry");
    LoadSpoofConfigFromRegistry(&deviceContext->Config);

    return STATUS_SUCCESS;
}

NTSTATUS SarabEvtDeviceD0Exit(WDFDEVICE Device, WDF_POWER_DEVICE_STATE TargetState)
{
    UNREFERENCED_PARAMETER(TargetState);
    PDEVICE_CONTEXT deviceContext = DeviceGetContext(Device);

    TraceEvents(0, 0, "SarabEvtDeviceD0Exit");
    WdfTimerStop(deviceContext->FixTimer, TRUE);

    return STATUS_SUCCESS;
}

VOID SarabEvtFixTimer(WDFTIMER Timer)
{
    WDFDEVICE device = (WDFDEVICE)WdfTimerGetParentObject(Timer);
    PDEVICE_CONTEXT deviceContext = DeviceGetContext(device);

    WdfWaitLockAcquire(deviceContext->Lock, NULL);

    if (deviceContext->SessionActive) {
        // Refresh coordinates on each tick so any registry change by CLI is picked up instantly
        LoadSpoofConfigFromRegistry(&deviceContext->Config);

        WDFREQUEST request = NULL;
        while (NT_SUCCESS(WdfIoQueueRetrieveNextRequest(deviceContext->FixDataQueue, &request)) && request != NULL) {
            deviceContext->FixSequenceNumber++;
            CompleteFixRequest(request, deviceContext->ActiveSessionID, deviceContext->SessionType, &deviceContext->Config);
            request = NULL;
        }
    }

    WdfWaitLockRelease(deviceContext->Lock);
}
