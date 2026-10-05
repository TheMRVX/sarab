#include "Queue.h"
#include "Trace.h"

NTSTATUS SarabQueueInitialize(WDFDEVICE Device)
{
    WDF_IO_QUEUE_CONFIG queueConfig;
    NTSTATUS status;

    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&queueConfig, WdfIoQueueDispatchParallel);
    queueConfig.EvtIoDeviceControl = SarabEvtIoDeviceControl;
    queueConfig.EvtIoStop = SarabEvtIoStop;

    status = WdfIoQueueCreate(Device, &queueConfig, WDF_NO_OBJECT_ATTRIBUTES, WDF_NO_HANDLE);
    if (!NT_SUCCESS(status)) {
        TraceEvents(0, 0, "WdfIoQueueCreate default queue failed: 0x%08X", status);
        return status;
    }

    return STATUS_SUCCESS;
}

VOID SarabEvtIoDeviceControl(
    WDFQUEUE   Queue,
    WDFREQUEST Request,
    size_t     OutputBufferLength,
    size_t     InputBufferLength,
    ULONG      IoControlCode
)
{
    UNREFERENCED_PARAMETER(OutputBufferLength);
    UNREFERENCED_PARAMETER(InputBufferLength);

    WDFDEVICE device = WdfIoQueueGetDevice(Queue);
    PDEVICE_CONTEXT deviceContext = DeviceGetContext(device);
    NTSTATUS status = STATUS_SUCCESS;
    size_t bytesReturned = 0;

    switch (IoControlCode)
    {
    case IOCTL_GNSS_SEND_PLATFORM_CAPABILITY:
    {
        TraceEvents(0, 0, "IOCTL_GNSS_SEND_PLATFORM_CAPABILITY received");
        status = STATUS_SUCCESS;
        WdfRequestComplete(Request, status);
        break;
    }

    case IOCTL_GNSS_GET_DEVICE_CAPABILITY:
    {
        TraceEvents(0, 0, "IOCTL_GNSS_GET_DEVICE_CAPABILITY received");
        PGNSS_DEVICE_CAPABILITY pCaps = NULL;
        size_t bufferSize = 0;

        status = WdfRequestRetrieveOutputBuffer(Request, sizeof(GNSS_DEVICE_CAPABILITY), (PVOID*)&pCaps, &bufferSize);
        if (NT_SUCCESS(status) && pCaps != NULL) {
            RtlZeroMemory(pCaps, sizeof(GNSS_DEVICE_CAPABILITY));
            pCaps->Size = sizeof(GNSS_DEVICE_CAPABILITY);
            pCaps->Version = GNSS_DRIVER_VERSION_1;
            pCaps->SupportMultipleFixSessions = FALSE;
            pCaps->SupportLBS = TRUE;
            pCaps->SupportDistanceTracking = FALSE;
            pCaps->SupportContinuousTracking = TRUE;
            pCaps->SupportGeofencing = FALSE;
            pCaps->SupportBreadcrumbing = FALSE;
            bytesReturned = sizeof(GNSS_DEVICE_CAPABILITY);
            status = STATUS_SUCCESS;
        }
        WdfRequestCompleteWithInformation(Request, status, bytesReturned);
        break;
    }

    case IOCTL_GNSS_SEND_DRIVERCOMMAND:
    {
        TraceEvents(0, 0, "IOCTL_GNSS_SEND_DRIVERCOMMAND received");
        status = STATUS_SUCCESS;
        WdfRequestComplete(Request, status);
        break;
    }

    case IOCTL_GNSS_START_FIXSESSION:
    {
        PGNSS_FIXSESSION_PARAM pParam = NULL;
        size_t bufferSize = 0;

        status = WdfRequestRetrieveInputBuffer(Request, sizeof(GNSS_FIXSESSION_PARAM), (PVOID*)&pParam, &bufferSize);
        if (NT_SUCCESS(status) && pParam != NULL) {
            WdfWaitLockAcquire(deviceContext->Lock, NULL);
            deviceContext->ActiveSessionID = pParam->FixSessionID;
            deviceContext->SessionActive = TRUE;
            deviceContext->TimeBetweenFixes = (pParam->TimeBetweenFixes > 0) ? pParam->TimeBetweenFixes : 1000;
            LoadSpoofConfigFromRegistry(&deviceContext->Config);
            WdfWaitLockRelease(deviceContext->Lock);

            TraceEvents(0, 0, "Started fix session ID: %u, Interval: %u ms",
                deviceContext->ActiveSessionID, deviceContext->TimeBetweenFixes);

            // Start periodic timer
            WdfTimerStart(deviceContext->FixTimer, WDF_REL_TIMEOUT_IN_MS(10));
            status = STATUS_SUCCESS;
        }
        WdfRequestComplete(Request, status);
        break;
    }

    case IOCTL_GNSS_MODIFY_FIXSESSION:
    {
        PGNSS_FIXSESSION_PARAM pParam = NULL;
        size_t bufferSize = 0;

        status = WdfRequestRetrieveInputBuffer(Request, sizeof(GNSS_FIXSESSION_PARAM), (PVOID*)&pParam, &bufferSize);
        if (NT_SUCCESS(status) && pParam != NULL) {
            WdfWaitLockAcquire(deviceContext->Lock, NULL);
            if (pParam->TimeBetweenFixes > 0) {
                deviceContext->TimeBetweenFixes = pParam->TimeBetweenFixes;
            }
            WdfWaitLockRelease(deviceContext->Lock);
            status = STATUS_SUCCESS;
        }
        WdfRequestComplete(Request, status);
        break;
    }

    case IOCTL_GNSS_STOP_FIXSESSION:
    {
        TraceEvents(0, 0, "IOCTL_GNSS_STOP_FIXSESSION received");
        WdfWaitLockAcquire(deviceContext->Lock, NULL);
        deviceContext->SessionActive = FALSE;
        WdfTimerStop(deviceContext->FixTimer, FALSE);
        WdfWaitLockRelease(deviceContext->Lock);

        // Cancel any pending requests in the fix queue
        WdfIoQueuePurge(deviceContext->FixDataQueue, NULL, NULL);
        WdfIoQueueStart(deviceContext->FixDataQueue);

        status = STATUS_SUCCESS;
        WdfRequestComplete(Request, status);
        break;
    }

    case IOCTL_GNSS_GET_FIXDATA:
    {
        // Forward the request to the manual pending queue
        status = WdfRequestForwardToIoQueue(Request, deviceContext->FixDataQueue);
        if (!NT_SUCCESS(status)) {
            TraceEvents(0, 0, "Forward to FixDataQueue failed: 0x%08X", status);
            WdfRequestComplete(Request, status);
        } else {
            // Trigger timer immediately to service the request promptly if session is active
            WdfWaitLockAcquire(deviceContext->Lock, NULL);
            if (deviceContext->SessionActive) {
                WdfTimerStart(deviceContext->FixTimer, WDF_REL_TIMEOUT_IN_MS(5));
            }
            WdfWaitLockRelease(deviceContext->Lock);
        }
        break;
    }

    default:
        TraceEvents(0, 0, "Unsupported IOCTL: 0x%08X", IoControlCode);
        WdfRequestComplete(Request, STATUS_NOT_SUPPORTED);
        break;
    }
}

VOID SarabEvtIoStop(
    WDFQUEUE   Queue,
    WDFREQUEST Request,
    ULONG      ActionFlags
)
{
    UNREFERENCED_PARAMETER(Queue);
    TraceEvents(0, 0, "SarabEvtIoStop: ActionFlags=0x%08X", ActionFlags);

    if (ActionFlags & WdfRequestStopActionSuspend) {
        WdfRequestStopAcknowledge(Request, FALSE);
    } else if (ActionFlags & WdfRequestStopActionPurge) {
        WdfRequestCancelSentRequest(Request);
    }
}
