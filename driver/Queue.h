#pragma once

#include "Device.h"

NTSTATUS SarabQueueInitialize(WDFDEVICE Device);

EVT_WDF_IO_QUEUE_IO_DEVICE_CONTROL SarabEvtIoDeviceControl;
EVT_WDF_IO_QUEUE_IO_STOP           SarabEvtIoStop;
