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
#define GNSS_DRIVER_VERSION_2 2
#define GNSS_DRIVER_VERSION_3 3
#define GNSS_DRIVER_VERSION_4 4
#define GNSS_DRIVER_VERSION_5 5
#define GNSS_DRIVER_VERSION_6 6

//
// Official Windows GNSS IOCTLs (FILE_DEVICE_UNKNOWN = 0x22, METHOD_BUFFERED, FILE_ANY_ACCESS)
//
#define IOCTL_GNSS_SEND_PLATFORM_CAPABILITY CTL_CODE(FILE_DEVICE_UNKNOWN, 1,  METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_GET_DEVICE_CAPABILITY    CTL_CODE(FILE_DEVICE_UNKNOWN, 2,  METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_SEND_DRIVERCOMMAND       CTL_CODE(FILE_DEVICE_UNKNOWN, 3,  METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_START_FIXSESSION         CTL_CODE(FILE_DEVICE_UNKNOWN, 16, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_MODIFY_FIXSESSION        CTL_CODE(FILE_DEVICE_UNKNOWN, 17, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_STOP_FIXSESSION          CTL_CODE(FILE_DEVICE_UNKNOWN, 18, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_GET_FIXDATA              CTL_CODE(FILE_DEVICE_UNKNOWN, 19, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_INJECT_AGNSS             CTL_CODE(FILE_DEVICE_UNKNOWN, 32, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_AGNSS             CTL_CODE(FILE_DEVICE_UNKNOWN, 48, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_ERROR             CTL_CODE(FILE_DEVICE_UNKNOWN, 49, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_NI                CTL_CODE(FILE_DEVICE_UNKNOWN, 64, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_NMEA              CTL_CODE(FILE_DEVICE_UNKNOWN, 71, METHOD_BUFFERED, FILE_ANY_ACCESS)
#define IOCTL_GNSS_LISTEN_DRIVER_REQUEST    CTL_CODE(FILE_DEVICE_UNKNOWN, 96, METHOD_BUFFERED, FILE_ANY_ACCESS)

//
// SUPL Version
//
typedef struct {
    ULONG MajorVersion;
    ULONG MinorVersion;
} GNSS_SUPL_VERSION, *PGNSS_SUPL_VERSION;

//
// GNSS Platform Capability Structure
//
typedef struct {
    ULONG Size;
    ULONG Version;
    BOOL  SupportAgnssInjection;
    ULONG AgnssFormatSupported;
    BYTE  Unused[516];
} GNSS_PLATFORM_CAPABILITY, *PGNSS_PLATFORM_CAPABILITY;

//
// GNSS Device Capability Structure (Size: 604 = 0x25C)
//
typedef struct {
    ULONG Size;
    ULONG Version;
    BOOL  SupportMultipleFixSessions;
    BOOL  SupportMultipleAppSessions;
    BOOL  RequireAGnssInjection;
    ULONG AgnssFormatSupported;
    ULONG AgnssFormatPreferred;
    BOOL  SupportDistanceTracking;
    BOOL  SupportContinuousTracking;
    ULONG Reserved1;
    BOOL  Reserved2;
    BOOL  Reserved3;
    BOOL  Reserved4;
    BOOL  Reserved5;
    ULONG GeofencingSupport;
    BOOL  Reserved6;
    BOOL  Reserved7;
    BOOL  SupportCpLocation;
    BOOL  SupportUplV2;
    BOOL  SupportSuplV1;
    BOOL  SupportSuplV2;
    GNSS_SUPL_VERSION SupportedSuplVersion;
    ULONG MaxGeofencesSupported;
    BOOL  SupportMultipleSuplRootCert;
    ULONG GnssBreadCrumbPayloadVersion;
    ULONG MaxGnssBreadCrumbFixes;
    BYTE  Unused[496];
} GNSS_DEVICE_CAPABILITY, *PGNSS_DEVICE_CAPABILITY;

//
// GNSS Driver Command
//
typedef enum {
    GNSS_SetLocationServiceEnabled = 1,
    GNSS_SetLocationNIRequestAllowed = 2,
    GNSS_ForceSatelliteSystem = 3,
    GNSS_ForceOperationMode = 4,
    GNSS_ResetEngine = 9,
    GNSS_ClearAgnssData = 10,
    GNSS_SetSuplVersion = 12,
    GNSS_SetNMEALogging = 13,
    GNSS_SetUplServerAccessInterval = 14,
    GNSS_SetNiTimeoutInterval = 15,
    GNSS_ResetGeofencesTracking = 16,
    GNSS_SetSuplVersion2 = 17,
    GNSS_CustomCommand = 256
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
// GNSS Fix Session Types and Parameters (Size: 588 = 0x24C)
//
typedef enum {
    GNSS_FixSession_SingleShot = 1,
    GNSS_FixSession_DistanceTracking = 2,
    GNSS_FixSession_ContinuousTracking = 3,
    GNSS_FixSession_LKG = 4
} GNSS_FIXSESSIONTYPE;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG ResponseTime;
} GNSS_SINGLESHOT_PARAM, *PGNSS_SINGLESHOT_PARAM;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG MovementThreshold;
} GNSS_DISTANCETRACKING_PARAM, *PGNSS_DISTANCETRACKING_PARAM;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG PreferredInterval;
} GNSS_CONTINUOUSTRACKING_PARAM, *PGNSS_CONTINUOUSTRACKING_PARAM;

typedef struct {
    ULONG Size;
    ULONG Version;
} GNSS_LKGFIX_PARAM, *PGNSS_LKGFIX_PARAM;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG FixSessionID;
    GNSS_FIXSESSIONTYPE SessionType;
    ULONG HorizontalAccuracy;
    ULONG HorizontalConfidence;
    ULONG Reserved[9];
    ULONG FixLevelOfDetails;
    union {
        GNSS_SINGLESHOT_PARAM SingleShotParam;
        GNSS_DISTANCETRACKING_PARAM DistanceParam;
        GNSS_CONTINUOUSTRACKING_PARAM ContinuousParam;
        GNSS_LKGFIX_PARAM LkgFixParam;
        BYTE UnusedParam[268];
    };
    BYTE Unused[256];
} GNSS_FIXSESSION_PARAM, *PGNSS_FIXSESSION_PARAM;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG FixSessionID;
    BYTE  Unused[512];
} GNSS_STOPFIXSESSION_PARAM, *PGNSS_STOPFIXSESSION_PARAM;

//
// GNSS Fix Data details and structures (Size: 2208 = 0x8A0)
//
#define GNSS_FIXDETAIL_BASIC     0x0001
#define GNSS_FIXDETAIL_ACCURACY  0x0002
#define GNSS_FIXDETAIL_SATELLITE 0x0004

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
    ULONG SpeedAccuracy;
    ULONG HorizontalConfidence;
    ULONG HeadingConfidence;
    ULONG AltitudeConfidence;
    ULONG SpeedConfidence;
    float PositionDilutionOfPrecision;
    float HorizontalDilutionOfPrecision;
    float VerticalDilutionOfPrecision;
} GNSS_FIXDATA_ACCURACY, *PGNSS_FIXDATA_ACCURACY;

typedef struct {
    ULONG  SatelliteId;
    BOOL   UsedInPositiong;
    double Elevation;
    double Azimuth;
    double SignalToNoiseRatio;
} GNSS_SATELLITEINFO, *PGNSS_SATELLITEINFO;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG SatelliteCount;
    GNSS_SATELLITEINFO SatelliteArray[64];
} GNSS_FIXDATA_SATELLITE, *PGNSS_FIXDATA_SATELLITE;

typedef struct {
    ULONG Size;
    ULONG Version;
    ULONG FixSessionID;
    FILETIME FixTimeStamp;
    BOOL IsFinalFix;
    NTSTATUS FixStatus;
    ULONG FixLevelOfDetails;
    GNSS_FIXDATA_BASIC BasicData;
    GNSS_FIXDATA_ACCURACY AccuracyData;
    GNSS_FIXDATA_SATELLITE SatelliteData;
} GNSS_FIXDATA, *PGNSS_FIXDATA;
