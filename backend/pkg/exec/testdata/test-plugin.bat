@echo off
setlocal EnableDelayedExpansion
if defined KUBERNETES_EXEC_INFO echo !KUBERNETES_EXEC_INFO! 1>&2
if defined TEST_OUTPUT echo !TEST_OUTPUT!
if defined TEST_EXIT_CODE (
    exit /b !TEST_EXIT_CODE!
) else (
    exit /b 0
)
