@echo off
setlocal enabledelayedexpansion

rem Create two arrays with all logs, except one that might be currently open
set /a delfilecount=0
set /a movfilecount=0
for %%a in (combat_*.txt) do (
   2>nul (
      >>"%%a" echo off
   ) && (
      set "delfile[%%a]=1"
      set "movfile[%%a]=1"
      set /a delfilecount=delfilecount+1
      set /a movfilecount=movfilecount+1
   ) || (
      echo Log file currently open: %%a
      set openfile=%%a
   )
)

if !delfilecount!==0 (
   echo No saved logs detected. Make sure this batch file is in the same directory as all of your SWTOR combat logs. Usually that's "<My Documents>\Star Wars - The Old Republic\CombatLogs"
   goto END
)

rem Remove files to save from the del array
for /F "delims=" %%a in ('findstr /ipm /c:"EnterCombat" combat_*.txt') do (
   if not "%openfile%"=="%%a" (
      set "delfile[%%a]="
      set /a delfilecount=delfilecount-1
   )
)

if !delfilecount!==0 (
   echo No logs deleted.
) else (
   rem Delete remaining files in the del array, and remove them from mov array
   for /F "tokens=2 delims=[]" %%a in ('set delfile[') do (
      set "movfile[%%a]="
      set /a movfilecount=movfilecount-1
      echo Deleting %%a
      del "%%a"
   )
   echo !delfilecount! logs deleted.
)

rem Make sure saveencounters.txt exists
if not exist "saveencounters.txt" (
   echo Operations Training Dummy> saveencounters.txt
   echo Combat Training Target>> saveencounters.txt
   echo Eternity Vault>> saveencounters.txt
   echo Karagga's Palace>> saveencounters.txt
   echo Denova>> saveencounters.txt
   echo Asation>> saveencounters.txt
   echo Darvannis>> saveencounters.txt
   echo The Dread Fortress>> saveencounters.txt
   echo The Dread Palace>> saveencounters.txt
   echo The Ravagers>> saveencounters.txt
   echo Temple of Sacrifice>> saveencounters.txt
   echo Valley of the Machine Gods>> saveencounters.txt
   echo Dxun - The CI-004 Facility>> saveencounters.txt
   echo Toborro's Palace Courtyard>> saveencounters.txt
   echo Hive of the Mountain Queen>> saveencounters.txt
   echo R-4 Anomaly>> saveencounters.txt
   echo ------------------------------------------------
   echo ------------------- NOTE -----------------------
   echo ------------------------------------------------
   echo saveencounters.txt did not exist prior to running this batch file, so no combat logs were moved. That file has now been created with a basic list of instances and bosses to save. You should check saveencounters.txt to make sure you like the list. Feel free to delete any lines with encounters that you do not want to keep, and add new lines with an instance name, boss name, etc. that you want to keep, one per line. Any combat log with that instance, boss, etc. in it will be kept where it is, and any other log will be moved to the misc directory out of the way.
   echo.
   echo Once you are satisfied with the list, run this batch file again to automatically organize your combat logs as specified.
   echo ------------------------------------------------
) else (
   rem Remove files to preserve from the mov array
   for /F "delims=" %%a in ('findstr /ipm /g:"saveencounters.txt" combat_*.txt') do (
      set "movfile[%%a]="
      set /a movfilecount=movfilecount-1
   )

   if !movfilecount!==0 (
      echo No logs moved.
   ) else (
      rem Move remaining files
      if not exist "misc\" mkdir misc
      for /F "tokens=2 delims=[]" %%a in ('set movfile[') do (
         echo Moving %%a
         move "%%a" misc\ >nul
      )
      echo !movfilecount! logs moved.
   )
   echo Done.
)
:END
pause