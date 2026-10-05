#pragma once

#include <windows.h>
#include <stdio.h>

#define SARAB_LOG_PREFIX "[SarabGnss] "

inline void SarabTrace(const char* format, ...)
{
    char buffer[512];
    va_list args;
    va_start(args, format);
    _vsnprintf_s(buffer, sizeof(buffer), _TRUNCATE, format, args);
    va_end(args);

    OutputDebugStringA(SARAB_LOG_PREFIX);
    OutputDebugStringA(buffer);
    OutputDebugStringA("\n");
}

#define TraceEvents(level, flags, message, ...) SarabTrace(message, __VA_ARGS__)
