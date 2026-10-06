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
            pCaps->SupportMultipleFixSessions = TRUE;
            pCaps->SupportMultipleAppSessions = TRUE;
            pCaps->RequireAGnssInjection = FALSE;
            pCaps->AgnssFormatSupported = 0;
            pCaps->AgnssFormatPreferred = 0;
            pCaps->SupportDistanceTracking = FALSE;
            pCaps->SupportContinuousTracking = TRUE;
            pCaps->GeofencingSupport = 0;
            pCaps->SupportCpLocation = FALSE;
            pCaps->SupportUplV2 = FALSE;
            pCaps->SupportSuplV1 = FALSE;
            pCaps->SupportSuplV2 = FALSE;
            pCaps->SupportedSuplVersion.MajorVersion = 0;
            pCaps->SupportedSuplVersion.MinorVersion = 0;
            pCaps->MaxGeofencesSupported = 0;
            pCaps->SupportMultipleSuplRootCert = FALSE;
            pCaps->GnssBreadCrumbPayloadVersion = 0;
            pCaps->MaxGnssBreadCrumbFixes = 0;
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
            deviceContext->SessionType = pParam->SessionType;
            deviceContext->SessionActive = TRUE;
            ULONG interval = 1000;
            if (pParam->SessionType == GNSS_FixSession_ContinuousTracking && pParam->ContinuousParam.PreferredInterval > 0) {
                interval = pParam->ContinuousParam.PreferredInterval;
            }
            deviceContext->TimeBetweenFixes = interval;
            deviceContext->FixSequenceNumber = 0;
            LoadSpoofConfigFromRegistry(&deviceContext->Config);
            WdfWaitLockRelease(deviceContext->Lock);

            TraceEvents(0, 0, "Started fix session ID: %u, Type: %d, Interval: %u ms",
                deviceContext->ActiveSessionID, (int)deviceContext->SessionType, deviceContext->TimeBetweenFixes);

            // Start periodic timer with immediate first tick
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
            if (pParam->SessionType == GNSS_FixSession_ContinuousTracking && pParam->ContinuousParam.PreferredInterval > 0) {
                deviceContext->TimeBetweenFixes = pParam->ContinuousParam.PreferredInterval;
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

    case IOCTL_GNSS_LISTEN_AGNSS:
    case IOCTL_GNSS_LISTEN_ERROR:
    case IOCTL_GNSS_LISTEN_NI:
    case IOCTL_GNSS_LISTEN_NMEA:
    case IOCTL_GNSS_LISTEN_DRIVER_REQUEST:
    {
        // Forward listener requests to the dedicated manual queue so they stay pending
        status = WdfRequestForwardToIoQueue(Request, deviceContext->ListenQueue);
        if (!NT_SUCCESS(status)) {
            TraceEvents(0, 0, "Forward to ListenQueue failed: 0x%08X", status);
            WdfRequestComplete(Request, status);
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
