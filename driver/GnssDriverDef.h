#pragma once

#define WIN32_NO_STATUS
#include <windows.h>
#undef WIN32_NO_STATUS
#include <ntstatus.h>
#include <wdf.h>
#include <initguid.h>

//
// Windows GNSS Device Interface GUID:
// {33DE93A2-0199-4A73-B561-8CE1F84033FF}
//
DEFINE_GUID(GUID_DEVINTERFACE_GNSS,
    0x33de93a2, 0x0199, 0x4a73, 0xb5, 0x61, 0x8c, 0xe1, 0xf8, 0x40, 0x33, 0xff);

#define GNSS_DRIVER_VERSION_1 1

//
// GNSS IOCTLs
//
#define IOCTL_GNSS_SEND_PLATFORM_CAPABILITY CTL_CODE(FILE_DEVICE_UNKNOWN, 0x051, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_GET_DEVICE_CAPABILITY    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x052, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_SEND_DRIVERCOMMAND       CTL_CODE(FILE_DEVICE_UNKNOWN, 0x053, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_START_FIXSESSION         CTL_CODE(FILE_DEVICE_UNKNOWN, 0x054, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_MODIFY_FIXSESSION        CTL_CODE(FILE_DEVICE_UNKNOWN, 0x055, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_STOP_FIXSESSION          CTL_CODE(FILE_DEVICE_UNKNOWN, 0x056, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_GET_FIXDATA              CTL_CODE(FILE_DEVICE_UNKNOWN, 0x057, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_GEOFENCE_ALERT    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x058, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_AGNSS_REQUEST     CTL_CODE(FILE_DEVICE_UNKNOWN, 0x05B, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_ERROR             CTL_CODE(FILE_DEVICE_UNKNOWN, 0x060, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_NI                CTL_CODE(FILE_DEVICE_UNKNOWN, 0x062, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_NMEA              CTL_CODE(FILE_DEVICE_UNKNOWN, 0x064, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_DRIVER_REQUEST    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x065, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_BREADCRUMB_ALERT  CTL_CODE(FILE_DEVICE_UNKNOWN, 0x066, METHOD_BUFFERED, FILE_ANY_ACCESS)

//
// GNSS Platform Capability Structure
//
typedef struct {
    ULONG Size;
    ULONG Version;
    BOOL  SupportNVReset;
    BOOL  SupportGeofencing;
    BOOL  SupportBreadcrumbing;
    BYTE  Unused[512];
} GNSS_PLATFORM_CAPABILITY, *PGNSS_PLATFORM_CAPABILITY;

//
// GNSS Device Capability Structure
//
typedef struct {
    ULONG Size;
    ULONG Version;
    BOOL  SupportMultipleFixSessions;
    BOOL  SupportLBS;
    BOOL  SupportDistanceTracking;
    BOOL  SupportContinuousTracking;
    ULONG Reserved1;
    ULONG Reserved2;
    BOOL  SupportGeofencing;
    BOOL  SupportBreadcrumbing;
    BYTE  Unused[512];
} GNSS_DEVICE_CAPABILITY, *PGNSS_DEVICE_CAPABILITY;

//
// GNSS Driver Command
//
typedef enum {
    GNSS_SetLocationServiceEnabled = 0x01,
    GNSS_SetLocationNIRequestAllowed = 0x02,
    GNSS_ForceSatelliteSystem = 0x03,
    GNSS_SetSuplVersion = 0x04,
    GNSS_SetNMEALogging = 0x05,
    GNSS_SetUplSendInterface = 0x06,
    GNSS_SetNiTimeoutInterval = 0x07,
    GNSS_ResetEngine = 0x08,
    GNSS_ClearAgnssData = 0x09,
    GNSS_SetBreadcrumbConfig = 0x0A,
    GNSS_CustomCommand = 0x0100
} GNSS_DRIVERCOMMAND_TYPE;

typedef struct {
    ULONG Size;
    ULONG Version;
    GNSS_DRIVERCOMMAND_TYPE CommandType;
    ULONG Reserved;
    ULONG CommandDataSize;
    BYTE  Unused[512];
    BYTE  CommandData[ANYSIZE_ARRAY];
} GNSS_DRIVERCOMMAND_PARAM, *PGNSS_DRIVERCOMMAND_PARAM;

//
// GNSS Fix Session Types and Parameters
//
typedef enum {
    GNSS_FixSession_SingleShot = 0x01,
    GNSS_FixSession_DistanceTracking = 0x02,
    GNSS_FixSession_ContinuousTracking = 0x03,
    GNSS_FixSession_LBS = 0x04
} GNSS_FIXSESSION_TYPE;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG FixSessionID;
    GNSS_FIXSESSION_TYPE SessionType;
    ULONG HorizontalAccuracy;
    ULONG HorizontalSensitivity;
    ULONG Ticks;
    ULONG TimeBetweenFixes;
    BYTE  Unused[512];
} GNSS_FIXSESSION_PARAM, *PGNSS_FIXSESSION_PARAM;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG FixSessionID;
    BYTE  Unused[512];
} GNSS_STOPFIXSESSION_PARAM, *PGNSS_STOPFIXSESSION_PARAM;

//
// GNSS Fix Data details and structures
//
#define GNSS_FIXDETAIL_BASIC    0x0001
#define GNSS_FIXDETAIL_ACCURACY 0x0002

typedef struct {
    ULONG  Size;
    ULONG  Version;
    double Latitude;
    double Longitude;
    double Altitude;
    double Speed;
    double Heading;
} GNSS_FIXDATA_BASIC, *PGNSS_FIXDATA_BASIC;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG HorizontalAccuracy;
    ULONG HorizontalErrorMajorAxis;
    ULONG HorizontalErrorMinorAxis;
    ULONG HorizontalErrorAngle;
    ULONG HeadingAccuracy;
    ULONG AltitudeAccuracy;
} GNSS_FIXDATA_ACCURACY, *PGNSS_FIXDATA_ACCURACY;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG FixSessionID;
    NTSTATUS FixStatus;
    FILETIME FixTimeStamp;
    BOOL IsFinalFix;
    ULONG FixLevelOfDetails;
    GNSS_FIXDATA_BASIC BasicData;
    GNSS_FIXDATA_ACCURACY AccuracyData;
    BYTE Unused[256];
} GNSS_FIXDATA, *PGNSS_FIXDATA;
