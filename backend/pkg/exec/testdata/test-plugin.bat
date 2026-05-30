@echo off
setlocal EnableDelayedExpansion
if defined KUBERNETES_EXEC_INFO echo !KUBERNETES_EXEC_INFO! 1>&2
if defined TEST_OUTPUT_B64 (
  %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -Command "[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_OUTPUT_B64)))"
) else (
  echo !TEST_OUTPUT!
)
if defined TEST_EXIT_CODE exit /B !TEST_EXIT_CODE!
exit /B 0
