# 本文件来自 qq-ai-companion 开源示例，已脱敏（路径/账号/密钥均为占位符）。
# 直接运行前请按 docs/SETUP.md 替换为你的真实路径与配置。

# 一键切换「精简模式 / 完整模式」
# 用法：
#   .\mode.ps1 lite    只跑核心（QQ 聊天 + 守护 + 防休眠）
#   .\mode.ps1 full    全部功能（抖音、网页应用、空间、日记、问候、桌宠）
#   .\mode.ps1 status  看现在在跑什么

$NODE = 'C:\path\to\node.exe'
$D = @{
  douyin  = 'C:\path\to\douyin-bot'
  webapps = 'C:\path\to\webapps'
  qzone   = 'C:\path\to\qqzone-poster'
  decor   = 'C:\path\to\qq-decor'
  meme    = 'C:\path\to\qq-meme'
  greet   = 'C:\path\to\qq-sleepgreet'
  pet     = 'C:\path\to\deskpet'
}

$OPTIONAL = @(
  @{ name = '抖音巡游';   match = 'session\.mjs';    start = { Start-Process -FilePath $NODE -ArgumentList 'session.mjs','--daily' -WorkingDirectory $D.douyin -WindowStyle Hidden } },
  @{ name = '网页应用';   match = 'daily\.mjs'; start = { Start-Process -FilePath $NODE -ArgumentList 'daily.mjs' -WorkingDirectory $D.webapps -WindowStyle Hidden } },
  @{ name = '空间巡游';   match = 'hourly-visit';    start = { Start-Process -FilePath $NODE -ArgumentList 'hourly-visit.mjs' -WorkingDirectory $D.qzone -WindowStyle Hidden } },
  @{ name = '日记守护';   match = 'post\.mjs';       start = { Start-Process -FilePath $NODE -ArgumentList 'post.mjs' -WorkingDirectory $D.qzone -WindowStyle Hidden } },
  @{ name = '装扮守护';   match = 'decorate\.mjs';   start = { Start-Process -FilePath $NODE -ArgumentList 'decorate.mjs' -WorkingDirectory $D.decor -WindowStyle Hidden } },
  @{ name = '热梗学习';   match = 'learn\.mjs';      start = { Start-Process -FilePath $NODE -ArgumentList 'learn.mjs' -WorkingDirectory $D.meme -WindowStyle Hidden } },
  @{ name = '问候守护';   match = 'greet\.mjs';      start = { Start-Process -FilePath $NODE -ArgumentList 'greet.mjs' -WorkingDirectory $D.greet -WindowStyle Hidden } },
  @{ name = '桌宠服务';   match = 'pet-server';      start = { Start-Process -FilePath $NODE -ArgumentList 'pet-server.mjs' -WorkingDirectory $D.pet -WindowStyle Hidden } }
)

function Get-OptionalProcs {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
}

function Stop-Optional {
  foreach ($o in $OPTIONAL) {
    $procs = Get-OptionalProcs | Where-Object { $_.CommandLine -match $o.match }
    foreach ($p in $procs) {
      try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "  停 $($o.name) PID $($p.ProcessId)" } catch {}
    }
  }
  # 关掉桌宠/抖音的 Edge 窗口
  foreach ($e in (Get-Process -Name msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match '蓝色大肥鱼|抖音' })) {
    try { Stop-Process -Id $e.Id -Force -ErrorAction SilentlyContinue; Write-Host "  关 Edge 窗口：$($e.MainWindowTitle)" } catch {}
  }
}

function Start-Optional {
  $started = @{}
  foreach ($o in $OPTIONAL) {
    $running = Get-OptionalProcs | Where-Object { $_.CommandLine -match $o.match }
    if ($running) { Write-Host "  $($o.name) 已在运行"; $started[$o.name] = 'already'; continue }
    try {
      & $o.start | Out-Null
      Write-Host "  启动 $($o.name)"
      $started[$o.name] = 'started'
    } catch {
      Write-Host "  启动 $($o.name) 失败：$($_.Exception.Message)"
      $started[$o.name] = 'failed'
    }
  }
  # 等 6 秒后逐个核实，没起来的重试一次
  Start-Sleep -Seconds 6
  foreach ($o in $OPTIONAL) {
    if ($started[$o.name] -eq 'failed') { continue }
    $ok = @(Get-OptionalProcs | Where-Object { $_.CommandLine -match $o.match }).Count -gt 0
    if (-not $ok) {
      Write-Host "  重试 $($o.name)…"
      try { & $o.start | Out-Null } catch { Write-Host "  重试失败：$($_.Exception.Message)" }
    }
  }
  Start-Sleep -Seconds 4
  Write-Host '--- 核实结果 ---'
  foreach ($o in $OPTIONAL) {
    $n = @(Get-OptionalProcs | Where-Object { $_.CommandLine -match $o.match }).Count
    if ($n -gt 0) { Write-Host "  OK  $($o.name)" } else { Write-Host "  未运行  $($o.name)" }
  }
  $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
  Start-Process -FilePath $edge -ArgumentList @(
    '--app=http://127.0.0.1:3210/', '--window-size=260,330', '--window-position=1420,600',
    '--no-first-run', "--user-data-dir=$($D.pet)\edge-profile"
  )
  Write-Host '  打开桌宠窗口'
}

function Show-Status {
  $os = Get-CimInstance Win32_OperatingSystem
  Write-Host "系统内存：可用 $([math]::Round($os.FreePhysicalMemory/1MB,1)) GB / 总 $([math]::Round($os.TotalVisibleMemorySize/1MB,1)) GB"
  Write-Host '核心：'
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    if ($_.CommandLine -match 'src\\bridge\.js') { Write-Host ("  qq-bridge   {0} MB" -f [math]::Round($_.WorkingSetSize/1MB,0)) }
    if ($_.CommandLine -match 'watch\.mjs') { Write-Host ("  掉线守护    {0} MB" -f [math]::Round($_.WorkingSetSize/1MB,0)) }
  }
  Write-Host '可选：'
  $any = $false
  foreach ($o in $OPTIONAL) {
    $p = @(Get-OptionalProcs | Where-Object { $_.CommandLine -match $o.match })
    if ($p.Count -gt 0) { $any = $true; Write-Host "  $($o.name) 运行中 ($($p.Count) 个进程)" }
  }
  if (-not $any) { Write-Host '  （全部未运行）' }
}

$mode = ($args[0] -as [string])
if ($mode) { $mode = $mode.ToLower() } else { $mode = 'status' }
switch ($mode) {
  'lite'   { Write-Host '切到精简模式…'; Stop-Optional; Show-Status }
  'full'   { Write-Host '切到完整模式…'; Start-Optional; Show-Status }
  'status' { Show-Status }
  default  { Write-Host '用法：mode.ps1 lite|full|status' }
}
