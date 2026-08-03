"use strict";

/**
 * Owns static command, keyword, and registry metadata for Windows scripting intelligence.
 */

const BATCH_COMMANDS = Object.freeze({
  assoc: "Displays or modifies file extension associations.",
  attrib: "Displays or changes file attributes.",
  call: "Calls one batch program or labeled subroutine from another.",
  cd: "Displays or changes the current directory.",
  chdir: "Displays or changes the current directory.",
  choice: "Prompts the user to choose from a list of choices.",
  cls: "Clears the console window.",
  copy: "Copies one or more files.",
  del: "Deletes one or more files.",
  dir: "Lists files and directories.",
  echo: "Displays messages or toggles command echoing.",
  endlocal: "Ends localization of environment changes in a batch file.",
  erase: "Deletes one or more files.",
  exit: "Exits the command interpreter or current batch script.",
  for: "Runs a command for each item in a set.",
  goto: "Jumps execution to a label in the current batch script.",
  if: "Performs conditional processing in a batch script.",
  md: "Creates a directory.",
  mkdir: "Creates a directory.",
  move: "Moves files or renames files and directories.",
  pause: "Suspends processing and waits for a key press.",
  popd: "Restores the previous directory saved by pushd.",
  pushd: "Saves the current directory and changes to another directory.",
  rd: "Removes a directory.",
  rem: "Records a comment in a batch file.",
  ren: "Renames files or directories.",
  rename: "Renames files or directories.",
  rmdir: "Removes a directory.",
  set: "Displays, sets, or removes environment variables.",
  setlocal: "Begins localization of environment changes in a batch file.",
  shift: "Shifts replaceable batch parameters.",
  start: "Starts a separate window to run a program or command.",
  title: "Sets the console window title.",
  type: "Displays the contents of a text file.",
  xcopy: "Copies files and directory trees."
});

const BATCH_ARGUMENT_MODIFIERS = Object.freeze([
  "%0", "%1", "%2", "%3", "%4", "%5", "%6", "%7", "%8", "%9",
  "%*", "%~1", "%~f1", "%~d1", "%~p1", "%~n1", "%~x1", "%~s1", "%~a1", "%~t1", "%~z1", "%~dp1", "%~nx1"
]);

function powershellCommand(category, description, aliases, examples) {
  return Object.freeze({ category, description, aliases, examples });
}

function normalizePowerShellDataKey(value) {
  return String(value || "").toLowerCase();
}

const POWERSHELL_COMMANDS = Object.freeze({
  "add-content": powershellCommand("Content", "Appends text or objects to an existing item without replacing the current content.", ["ac"], ["Add-Content -Path .\\app.log -Value \"Started\"", "Get-Date | Add-Content .\\run.log"]),
  "clear-content": powershellCommand("Content", "Deletes the contents of an item while leaving the item itself in place.", ["clc"], ["Clear-Content -Path .\\app.log", "Clear-Content -Path .\\cache.txt -Confirm"]),
  "clear-host": powershellCommand("Host", "Clears the visible text in the current host window.", ["cls", "clear"], ["Clear-Host"]),
  "clear-variable": powershellCommand("Variables", "Deletes the value stored in a variable without deleting the variable entry.", ["clv"], ["Clear-Variable -Name result", "Clear-Variable -Name temp -Scope Script"]),
  "compare-object": powershellCommand("Objects", "Compares two sets of objects and reports values that are different.", ["compare", "diff"], ["Compare-Object -ReferenceObject $before -DifferenceObject $after", "Compare-Object (Get-Content a.txt) (Get-Content b.txt)"]),
  "compress-archive": powershellCommand("Archive", "Creates a ZIP archive from files or directories.", [], ["Compress-Archive -Path .\\logs\\* -DestinationPath logs.zip", "Compress-Archive -Path .\\src -DestinationPath src.zip -Force"]),
  "convertfrom-json": powershellCommand("Data", "Creates PowerShell objects from JSON text.", [], ["$config = Get-Content .\\appsettings.json -Raw | ConvertFrom-Json", "$response = Invoke-RestMethod https://example.com/api"]),
  "convertto-json": powershellCommand("Data", "Converts objects into JSON text.", [], ["Get-Process -Name pwsh | ConvertTo-Json -Depth 3", "$config | ConvertTo-Json | Set-Content .\\config.json"]),
  "copy-item": powershellCommand("Files and providers", "Copies files, directories, registry keys, or provider items to another location.", ["copy", "cp", "cpi"], ["Copy-Item -Path .\\app.config -Destination .\\backup\\", "Copy-Item .\\src -Destination .\\archive\\src -Recurse"]),
  "enter-pssession": powershellCommand("Remoting", "Starts an interactive PowerShell remoting session with a remote computer.", ["etsn"], ["Enter-PSSession -ComputerName server01", "Enter-PSSession -Session $session"]),
  "expand-archive": powershellCommand("Archive", "Extracts files from a ZIP archive.", [], ["Expand-Archive -Path .\\logs.zip -DestinationPath .\\logs", "Expand-Archive .\\package.zip .\\package -Force"]),
  "export-csv": powershellCommand("Data", "Saves objects as CSV rows, typically for spreadsheets or later Import-Csv processing.", ["epcsv"], ["Get-Service | Export-Csv .\\services.csv -NoTypeInformation", "$rows | Export-Csv .\\report.csv -Append"]),
  "foreach-object": powershellCommand("Objects", "Runs a script block once for each object received from the pipeline.", ["foreach"], ["1..3 | ForEach-Object { $_ * 2 }", "Get-ChildItem *.log | ForEach-Object { $_.FullName }"]),
  "format-list": powershellCommand("Formatting", "Formats object properties as a vertical list for detailed inspection.", ["fl"], ["Get-Service spooler | Format-List *", "Get-Process pwsh | Format-List Name,Id,Path"]),
  "format-table": powershellCommand("Formatting", "Formats selected object properties as a table.", ["ft"], ["Get-Process | Format-Table Name,Id,CPU -AutoSize", "Get-Service | Format-Table Status,Name,DisplayName"]),
  "get-childitem": powershellCommand("Files and providers", "Lists child items in file-system, registry, certificate, environment, and other provider locations.", ["dir", "gci", "ls"], ["Get-ChildItem -Path . -Recurse -Filter *.ps1", "Get-ChildItem Env:", "Get-ChildItem HKCU:\\Software"]),
  "get-command": powershellCommand("Discovery", "Finds cmdlets, functions, aliases, scripts, and applications available in the current session.", ["gcm"], ["Get-Command *Service*", "Get-Command -Module Microsoft.PowerShell.Management", "Get-Command -CommandType Function"]),
  "get-content": powershellCommand("Content", "Reads text or data from a file or other provider item.", ["cat", "gc", "type"], ["Get-Content -Path .\\app.log -Tail 50", "$json = Get-Content .\\package.json -Raw"]),
  "get-credential": powershellCommand("Security", "Prompts for a user name and password and returns a credential object.", [], ["$cred = Get-Credential", "$cred = Get-Credential -UserName CONTOSO\\deploy"]),
  "get-date": powershellCommand("System", "Returns the current date and time or formats a date value.", [], ["Get-Date", "Get-Date -Format o", "(Get-Date).AddDays(7)"]),
  "get-error": powershellCommand("Errors", "Displays detailed error information for the most recent errors.", [], ["Get-Error", "Get-Error -Newest 3"]),
  "get-executionpolicy": powershellCommand("Security", "Shows the PowerShell script execution policy for the current scope or all scopes.", [], ["Get-ExecutionPolicy", "Get-ExecutionPolicy -List"]),
  "get-help": powershellCommand("Discovery", "Shows help for cmdlets, functions, scripts, providers, and about topics.", ["help", "man"], ["Get-Help Get-ChildItem -Examples", "Get-Help about_If", "Get-Help Invoke-RestMethod -Online"]),
  "get-history": powershellCommand("Session", "Gets commands entered during the current session.", ["h", "history", "ghy"], ["Get-History", "Get-History -Count 20"]),
  "get-item": powershellCommand("Files and providers", "Gets a file, directory, registry key, environment variable, or other provider item.", ["gi"], ["Get-Item -Path .\\README.md", "Get-Item Env:Path", "Get-Item HKCU:\\Software"]),
  "get-location": powershellCommand("Files and providers", "Gets the current working location for the active provider.", ["gl", "pwd"], ["Get-Location", "Get-Location -PSProvider FileSystem"]),
  "get-member": powershellCommand("Discovery", "Shows the properties, methods, and events available on pipeline objects.", ["gm"], ["Get-Process | Get-Member", "\"text\" | Get-Member -MemberType Method"]),
  "get-module": powershellCommand("Modules", "Lists modules imported into the session or available on module paths.", ["gmo"], ["Get-Module", "Get-Module -ListAvailable", "Get-Module Microsoft.PowerShell.Management"]),
  "get-process": powershellCommand("Processes", "Gets process objects for local or remote running processes.", ["gps", "ps"], ["Get-Process", "Get-Process -Name pwsh", "Get-Process | Sort-Object CPU -Descending | Select-Object -First 5"]),
  "get-random": powershellCommand("Utility", "Returns random numbers or randomly selected input objects.", [], ["Get-Random -Minimum 1 -Maximum 100", "\"red\", \"green\", \"blue\" | Get-Random"]),
  "get-service": powershellCommand("Services", "Gets service objects from the local computer or a remote computer.", ["gsv"], ["Get-Service", "Get-Service -Name spooler", "Get-Service | Where-Object Status -eq Running"]),
  "get-variable": powershellCommand("Variables", "Gets variables from the current session.", ["gv"], ["Get-Variable", "Get-Variable -Name ErrorActionPreference"]),
  "group-object": powershellCommand("Objects", "Groups objects that contain the same value for a property.", ["group"], ["Get-Process | Group-Object ProcessName", "Get-Service | Group-Object Status"]),
  "import-csv": powershellCommand("Data", "Creates objects from rows in a CSV file.", ["ipcsv"], ["$rows = Import-Csv .\\services.csv", "Import-Csv .\\users.csv | Where-Object Enabled -eq true"]),
  "import-module": powershellCommand("Modules", "Adds commands from a module to the current session.", ["ipmo"], ["Import-Module Microsoft.PowerShell.Management", "Import-Module .\\Tools.psm1 -Force"]),
  "invoke-command": powershellCommand("Remoting", "Runs commands locally or on remote computers and returns the output.", ["icm"], ["Invoke-Command -ComputerName server01 -ScriptBlock { Get-Service }", "Invoke-Command -Session $session -FilePath .\\deploy.ps1"]),
  "invoke-expression": powershellCommand("Execution", "Evaluates a string as a PowerShell command. Use carefully with trusted input only.", ["iex"], ["Invoke-Expression \"Get-Process pwsh\"", "$command = \"Get-Date\"; Invoke-Expression $command"]),
  "invoke-restmethod": powershellCommand("Network", "Sends an HTTP or HTTPS request and converts structured responses such as JSON or XML into objects.", ["irm"], ["$data = Invoke-RestMethod https://api.example.com/status", "Invoke-RestMethod -Method Post -Uri $uri -Body $body"]),
  "invoke-webrequest": powershellCommand("Network", "Sends an HTTP or HTTPS request and returns response metadata, content, links, forms, and headers.", ["iwr", "curl", "wget"], ["Invoke-WebRequest https://example.com -OutFile page.html", "$response = Invoke-WebRequest -Uri $uri"]),
  "join-path": powershellCommand("Files and providers", "Combines path parts using the provider-specific separator.", [], ["Join-Path $HOME \"Documents\"", "Join-Path -Path $root -ChildPath \"logs\\app.log\""]),
  "measure-object": powershellCommand("Objects", "Calculates count, sum, average, minimum, and maximum values for objects or properties.", ["measure"], ["Get-ChildItem | Measure-Object", "Get-ChildItem -File | Measure-Object Length -Sum"]),
  "move-item": powershellCommand("Files and providers", "Moves files, directories, registry keys, or provider items to another location.", ["mi", "move", "mv"], ["Move-Item .\\old.txt .\\archive\\", "Move-Item .\\build .\\dist -Force"]),
  "new-item": powershellCommand("Files and providers", "Creates a file, directory, registry key, symbolic link, or other provider item.", ["ni"], ["New-Item -ItemType Directory -Path .\\logs", "New-Item -ItemType File -Path .\\notes.txt"]),
  "new-pssession": powershellCommand("Remoting", "Creates a persistent PowerShell remoting session.", ["nsn"], ["$session = New-PSSession -ComputerName server01", "New-PSSession -ComputerName server01 -Credential $cred"]),
  "out-file": powershellCommand("Output", "Sends output to a file with explicit encoding and append options.", [], ["Get-Process | Out-File .\\processes.txt", "\"done\" | Out-File .\\status.txt -Append"]),
  "read-host": powershellCommand("Host", "Reads a line of input from the user.", [], ["$name = Read-Host \"Name\"", "$secret = Read-Host \"Password\" -AsSecureString"]),
  "receive-job": powershellCommand("Jobs", "Gets results produced by background jobs.", ["rcjb"], ["Receive-Job -Id 1", "Receive-Job -Job $job -Keep"]),
  "remove-item": powershellCommand("Files and providers", "Deletes files, directories, registry keys, variables, aliases, or other provider items.", ["del", "erase", "rd", "ri", "rm", "rmdir"], ["Remove-Item .\\temp.txt", "Remove-Item .\\build -Recurse -Force"]),
  "remove-job": powershellCommand("Jobs", "Deletes background jobs from the current session.", ["rjb"], ["Remove-Job -Id 1", "Get-Job | Remove-Job -Force"]),
  "remove-pssession": powershellCommand("Remoting", "Closes persistent PowerShell remoting sessions.", ["rsn"], ["Remove-PSSession -Session $session", "Get-PSSession | Remove-PSSession"]),
  "remove-variable": powershellCommand("Variables", "Deletes a variable from the current session or selected scope.", ["rv"], ["Remove-Variable -Name temp", "Remove-Variable -Name result -Scope Script"]),
  "rename-item": powershellCommand("Files and providers", "Renames a provider item without moving it to a different parent location.", ["ren", "rni"], ["Rename-Item .\\old.txt new.txt", "Rename-Item HKCU:\\Software\\OldName NewName"]),
  "resolve-path": powershellCommand("Files and providers", "Resolves wildcard or relative paths into provider-qualified paths.", ["rvpa"], ["Resolve-Path .\\*.ps1", "Resolve-Path ~"]),
  "restart-service": powershellCommand("Services", "Stops and starts one or more services.", [], ["Restart-Service -Name spooler", "Restart-Service -DisplayName \"Print Spooler\" -Force"]),
  "select-object": powershellCommand("Objects", "Selects specific properties, calculated properties, or a subset of objects.", ["select"], ["Get-Process | Select-Object Name,Id,CPU -First 10", "Get-Service | Select-Object Name,Status"]),
  "select-string": powershellCommand("Content", "Searches text for matches using simple patterns or regular expressions.", ["sls"], ["Select-String -Path *.log -Pattern \"error\"", "Get-Content .\\app.log | Select-String \"failed\""]),
  "set-content": powershellCommand("Content", "Writes content to an item, replacing any existing content.", ["sc"], ["Set-Content -Path .\\out.txt -Value \"done\"", "$json | Set-Content .\\config.json -Encoding UTF8"]),
  "set-executionpolicy": powershellCommand("Security", "Changes the PowerShell script execution policy for a selected scope.", [], ["Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned", "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"]),
  "set-location": powershellCommand("Files and providers", "Changes the current working location for the active provider.", ["cd", "chdir", "sl"], ["Set-Location C:\\Windows", "Set-Location $HOME", "Set-Location HKCU:\\Software"]),
  "set-strictmode": powershellCommand("Execution", "Controls how strictly PowerShell enforces coding rules for expressions and script blocks.", [], ["Set-StrictMode -Version Latest", "Set-StrictMode -Off"]),
  "set-variable": powershellCommand("Variables", "Creates or changes the value of a variable.", ["set", "sv"], ["Set-Variable -Name path -Value $HOME", "Set-Variable -Name mode -Value Debug -Option ReadOnly"]),
  "sort-object": powershellCommand("Objects", "Sorts objects by property values or script block results.", ["sort"], ["Get-Process | Sort-Object CPU -Descending", "Get-Service | Sort-Object Status,Name"]),
  "split-path": powershellCommand("Files and providers", "Returns selected parts of a path, such as parent, leaf, qualifier, or extension.", [], ["Split-Path C:\\Windows\\notepad.exe -Parent", "Split-Path .\\logs\\app.log -Leaf"]),
  "start-job": powershellCommand("Jobs", "Starts a background job in the current session.", ["sajb"], ["$job = Start-Job -ScriptBlock { Get-Process }", "Start-Job -FilePath .\\long-task.ps1"]),
  "start-process": powershellCommand("Processes", "Starts a local process and optionally passes arguments, changes working directory, or waits for exit.", ["saps", "start"], ["Start-Process notepad.exe", "Start-Process powershell.exe -ArgumentList \"-NoProfile\" -Wait"]),
  "start-service": powershellCommand("Services", "Starts one or more stopped services.", ["sasv"], ["Start-Service -Name spooler", "Get-Service -Name bits | Start-Service"]),
  "start-transcript": powershellCommand("Session", "Starts recording commands and output from the current session to a transcript file.", [], ["Start-Transcript -Path .\\session.log", "Start-Transcript -Append"]),
  "stop-process": powershellCommand("Processes", "Stops one or more running processes.", ["kill", "spps"], ["Stop-Process -Name notepad", "Get-Process notepad | Stop-Process -Force"]),
  "stop-service": powershellCommand("Services", "Stops one or more running services.", ["spsv"], ["Stop-Service -Name spooler", "Stop-Service -Name spooler -Force"]),
  "stop-transcript": powershellCommand("Session", "Stops recording the active transcript.", [], ["Stop-Transcript"]),
  "tee-object": powershellCommand("Output", "Saves command output to a file or variable and also passes it through the pipeline.", ["tee"], ["Get-Process | Tee-Object -FilePath .\\processes.txt", "Get-Service | Tee-Object -Variable services"]),
  "test-connection": powershellCommand("Network", "Sends ICMP echo requests or TCP checks to test connectivity.", [], ["Test-Connection server01 -Count 2", "Test-Connection 8.8.8.8 -Quiet"]),
  "test-netconnection": powershellCommand("Network", "Displays diagnostic information for TCP, route, and name-resolution connectivity tests.", ["tnc"], ["Test-NetConnection example.com -Port 443", "Test-NetConnection server01 -InformationLevel Detailed"]),
  "test-path": powershellCommand("Files and providers", "Checks whether every part of a file-system or provider path exists.", [], ["Test-Path $PROFILE", "if (-not (Test-Path .\\logs)) { New-Item -ItemType Directory .\\logs }"]),
  "trace-command": powershellCommand("Diagnostics", "Traces how PowerShell components process an expression or command.", [], ["Trace-Command -Name ParameterBinding -Expression { Get-Process pwsh } -PSHost", "Trace-Command -Name CommandDiscovery -Expression { Get-Command git } -PSHost"]),
  "wait-job": powershellCommand("Jobs", "Waits until one or more background jobs finish.", ["wjb"], ["Wait-Job -Id 1", "$job | Wait-Job -Timeout 30"]),
  "wait-process": powershellCommand("Processes", "Waits for one or more processes to stop before continuing.", ["wpps"], ["Wait-Process -Name notepad", "Start-Process notepad -PassThru | Wait-Process"]),
  "where-object": powershellCommand("Objects", "Filters pipeline objects based on a script block or property comparison.", ["where"], ["Get-Process | Where-Object CPU -gt 100", "Get-Service | Where-Object Status -eq Running"]),
  "write-debug": powershellCommand("Output", "Writes a message to the debug stream.", [], ["Write-Debug \"Entering deployment step\"", "$DebugPreference = \"Continue\"; Write-Debug \"Visible\""]),
  "write-error": powershellCommand("Output", "Writes an error record to the error stream without necessarily stopping the script.", [], ["Write-Error \"Build failed\"", "Write-Error -Message \"Missing config\" -Category ObjectNotFound"]),
  "write-host": powershellCommand("Output", "Writes text directly to the host UI, optionally with colors.", [], ["Write-Host \"Done\" -ForegroundColor Green", "Write-Host \"Deploying $name\""]),
  "write-output": powershellCommand("Output", "Writes objects to the success output stream so callers can capture or pipe them.", ["echo", "write"], ["Write-Output $result", "Write-Output \"ready\""]),
  "write-verbose": powershellCommand("Output", "Writes a message to the verbose stream when verbose output is enabled.", [], ["Write-Verbose \"Loading configuration\"", "Write-Verbose \"Step complete\" -Verbose"]),
  "write-warning": powershellCommand("Output", "Writes a warning message to the warning stream.", [], ["Write-Warning \"Using default configuration\"", "Write-Warning \"Disk space is low\""])
});

const POWERSHELL_ALIASES = Object.freeze(Object.entries(POWERSHELL_COMMANDS).reduce((aliases, [command, metadata]) => {
  for (const alias of metadata.aliases || []) aliases[normalizePowerShellDataKey(alias)] = command;
  return aliases;
}, {}));

const POWERSHELL_PARAMETERS = Object.freeze([
  "-Path", "-LiteralPath", "-Filter", "-Recurse", "-Force", "-ErrorAction", "-WhatIf", "-Confirm",
  "-Name", "-Value", "-InputObject", "-FilePath", "-ArgumentList", "-WorkingDirectory", "-NoNewWindow"
]);

const POWERSHELL_KEYWORDS = Object.freeze({
  begin: "Starts the begin block of an advanced function or script block.",
  break: "Exits a loop, switch statement, or trap statement.",
  catch: "Handles terminating errors thrown from the matching try block.",
  continue: "Skips the rest of the current loop iteration.",
  do: "Starts a loop that runs while or until a condition is met.",
  else: "Runs when the preceding if condition is false.",
  elseif: "Adds another condition to an if statement.",
  end: "Starts the end block of an advanced function or script block.",
  exit: "Exits the current PowerShell session, script, or scope with an optional exit code.",
  filter: "Declares a filter function that processes pipeline input.",
  finally: "Runs cleanup code after try and catch blocks complete.",
  for: "Runs a statement list while a condition remains true.",
  foreach: "Iterates over each item in a collection.",
  function: "Declares a named PowerShell function.",
  if: "Runs a statement list when a condition evaluates to true.",
  in: "Separates the loop variable from the collection in foreach statements.",
  param: "Declares parameters for a script, function, or script block.",
  process: "Starts the process block of an advanced function or script block.",
  return: "Returns control to the caller with an optional value.",
  switch: "Evaluates input against one or more matching clauses.",
  throw: "Creates a terminating error.",
  trap: "Defines a handler for terminating errors.",
  try: "Starts a protected block whose terminating errors can be handled by catch or finally.",
  until: "Runs a loop until a condition becomes true.",
  while: "Runs a loop while a condition remains true."
});

const POWERSHELL_MEMBERS = Object.freeze({
  Attributes: powershellCommand(".NET and file-system members", "File-system attribute flags used by Get-ChildItem, DirectoryInfo, FileInfo, and related providers.", [], ["Get-ChildItem | Where-Object { $_.Attributes -match 'Directory' }", "Get-ChildItem -Attributes !Directory"]),
  Count: powershellCommand(".NET and object members", "Property that returns the number of items in a collection or array-like object.", [], ["$files.Count", "if ($errors.Count -gt 0) { Write-Warning \"Errors found\" }"]),
  Directory: powershellCommand(".NET and file-system members", "File-system directory attribute value used when testing or filtering file-system items.", [], ["Get-ChildItem -Attributes Directory", "Get-ChildItem | Where-Object { $_.PSIsContainer }"]),
  Environment: powershellCommand(".NET types", ".NET type that exposes process environment data, machine information, and paths for well-known folders.", [], ["[Environment]::MachineName", "[Environment]::GetFolderPath('Desktop')", "[Environment]::GetEnvironmentVariable('Path')"]),
  Error: powershellCommand("Automatic variables", "Automatic variable containing recent error objects for the current session, newest first.", [], ["$Error[0]", "$Error.Clear()", "Get-Error -Newest 1"]),
  Fonts: powershellCommand("Special folders", "Special folder name for the Windows Fonts directory when used with Environment.GetFolderPath.", [], ["[Environment]::GetFolderPath('Fonts')", "$fonts = [Environment]::GetFolderPath([Environment+SpecialFolder]::Fonts)"]),
  GetFolderPath: powershellCommand(".NET Environment methods", "Returns the absolute path for a named special folder value from Environment.SpecialFolder, such as Fonts, Desktop, or ApplicationData.", [], ["[Environment]::GetFolderPath('Fonts')", "$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)", "Set-Location ([Environment]::GetFolderPath('MyDocuments'))"]),
  SpecialFolder: powershellCommand(".NET Environment enums", "Enumeration of well-known Windows folder names accepted by Environment.GetFolderPath.", [], ["[Environment+SpecialFolder]::Fonts", "[Enum]::GetNames([Environment+SpecialFolder])"])
});

const REGISTRY_HIVES = Object.freeze({
  HKEY_CLASSES_ROOT: "File associations and COM registration data.",
  HKEY_CURRENT_USER: "Configuration for the current user profile.",
  HKEY_LOCAL_MACHINE: "Machine-wide configuration.",
  HKEY_USERS: "Configuration for all loaded user profiles.",
  HKEY_CURRENT_CONFIG: "Current hardware profile configuration.",
  HKCR: "Short form of HKEY_CLASSES_ROOT.",
  HKCU: "Short form of HKEY_CURRENT_USER.",
  HKLM: "Short form of HKEY_LOCAL_MACHINE.",
  HKU: "Short form of HKEY_USERS.",
  HKCC: "Short form of HKEY_CURRENT_CONFIG."
});

const REGISTRY_VALUE_TYPES = Object.freeze({
  "\"\"": "Default unnamed registry value.",
  "\"Name\"": "Named registry value.",
  "dword:": "32-bit DWORD value encoded as eight hexadecimal digits.",
  "hex:": "Binary REG_BINARY data encoded as comma-separated hexadecimal bytes.",
  "hex(2):": "Expandable string REG_EXPAND_SZ encoded as UTF-16LE hexadecimal bytes.",
  "hex(7):": "Multi-string REG_MULTI_SZ encoded as UTF-16LE hexadecimal bytes.",
  "-": "Deletes the named registry value."
});

const REGISTRY_VALUE_NAMES = Object.freeze([
  "@", "\"DisplayName\"", "\"Description\"", "\"Path\"", "\"InstallPath\"", "\"Version\"", "\"Enabled\""
]);

module.exports = {
  BATCH_ARGUMENT_MODIFIERS,
  BATCH_COMMANDS,
  POWERSHELL_ALIASES,
  POWERSHELL_COMMANDS,
  POWERSHELL_KEYWORDS,
  POWERSHELL_MEMBERS,
  POWERSHELL_PARAMETERS,
  REGISTRY_HIVES,
  REGISTRY_VALUE_NAMES,
  REGISTRY_VALUE_TYPES
};