@echo off
setlocal EnableDelayedExpansion
if defined KUBERNETES_EXEC_INFO echo !KUBERNETES_EXEC_INFO! 1>&2
if defined TEST_CALLS_FILE echo x>>"!TEST_CALLS_FILE!"
if defined TEST_STDERR echo !TEST_STDERR! 1>&2
if defined TEST_SLEEP_SECONDS %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -Command "if ($env:TEST_CHILD_PID_FILE) { Set-Content -Path $env:TEST_CHILD_PID_FILE -Value $PID }; Start-Sleep -Seconds $env:TEST_SLEEP_SECONDS"
if defined TEST_STDERR_HELPER_SECONDS start "" /b %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -Command "Start-Sleep -Seconds $env:TEST_STDERR_HELPER_SECONDS" >NUL
if defined TEST_OUTPUT_B64 (
  %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -Command "[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TEST_OUTPUT_B64)))"
) else (
  echo !TEST_OUTPUT!
)
if defined TEST_EXIT_CODE exit /B !TEST_EXIT_CODE!
exit /B 0
