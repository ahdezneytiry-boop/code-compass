param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bundleRoot = $PSScriptRoot
$packagePath = Join-Path $bundleRoot 'code-compass-zh-0.4.0.vsix'
function Find-Code {
    $paths = @((Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'), (Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd'))
    $command = Get-Command code.cmd -ErrorAction SilentlyContinue
    if ($command) { $paths += $command.Source }
    return $paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if ($CheckOnly) {
    [pscustomobject]@{ CodeFound = [bool](Find-Code); PackageFound = (Test-Path -LiteralPath $packagePath); Mode = '检查模式，未安装或打开任何文件' } | ConvertTo-Json
    exit 0
}
$form = New-Object System.Windows.Forms.Form
$form.Text = '知码 · 安装与开始'
$form.Size = New-Object System.Drawing.Size(610,430)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI',10)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$title = New-Object System.Windows.Forms.Label
$title.Text = '准备好后，点一次“安装知码”即可。'
$title.SetBounds(28,24,540,44)
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI',14)
$form.Controls.Add($title)
$status = New-Object System.Windows.Forms.Label
$status.SetBounds(28,80,540,120)
$status.AutoSize = $false
$form.Controls.Add($status)
$install = New-Object System.Windows.Forms.Button
$install.Text = '安装知码'
$install.SetBounds(28,214,170,44)
$form.Controls.Add($install)
$download = New-Object System.Windows.Forms.Button
$download.Text = '下载 VS Code'
$download.SetBounds(214,214,160,44)
$form.Controls.Add($download)
$open = New-Object System.Windows.Forms.Button
$open.Text = '打开练习'
$open.SetBounds(390,214,160,44)
$open.Enabled = $false
$form.Controls.Add($open)
$help = New-Object System.Windows.Forms.LinkLabel
$help.Text = '不会操作？打开一步一步的说明'
$help.SetBounds(28,286,520,30)
$form.Controls.Add($help)
$tip = New-Object System.Windows.Forms.Label
$tip.Text = '不会安装 Python、Node.js 或数据库，也不会更改你的代码。'
$tip.SetBounds(28,328,540,40)
$form.Controls.Add($tip)
$script:codePath = Find-Code
if ($script:codePath) { $status.Text = '已找到 VS Code。安装通常需要十几秒。' } else { $status.Text = '还没有找到 VS Code。先点“下载 VS Code”，安装完成后关闭本窗口，再双击 01-install.cmd。'; $install.Enabled = $false }
if (!(Test-Path -LiteralPath $packagePath)) { $status.Text = '没有找到安装包。请先把整个压缩包“全部解压缩”，再运行本程序。'; $install.Enabled = $false }
$download.Add_Click({ [System.Diagnostics.Process]::Start('https://code.visualstudio.com/Download') | Out-Null })
$help.Add_LinkClicked({ [System.Diagnostics.Process]::Start((Join-Path $bundleRoot '先读我.html')) | Out-Null })
$install.Add_Click({
    $install.Enabled = $false; $status.Text = '正在安装，请稍等。完成后这里会显示结果。'; $form.Refresh()
    try {
        $versionLines = & $script:codePath --version 2>&1
        $versionLine = $versionLines | Where-Object { "$_" -match '^\d+\.\d+\.\d+' } | Select-Object -First 1
        if (!$versionLine -or [version]([regex]::Match("$versionLine",'^\d+\.\d+\.\d+').Value) -lt [version]'1.85.0') { throw 'VS Code 版本过旧或无法识别，请先从官网更新。' }
        $installed = & $script:codePath --list-extensions --show-versions 2>&1
        $existing = $installed | Where-Object { "$_" -match '^local-learning\.code-compass-zh@' } | Select-Object -First 1
        if ($existing -and [version]("$existing".Split('@')[-1]) -ge [version]'0.4.0') { $status.Text = '已安装这一版或更新版本，无需重复安装。现在可以点“打开练习”。'; $open.Enabled = $true; return }
        $result = & $script:codePath --install-extension $packagePath 2>&1
        $result | Out-File -LiteralPath (Join-Path $bundleRoot '安装结果.txt') -Encoding utf8
        if ($LASTEXITCODE -ne 0) { throw '安装没有完成。请查看本文件夹中的“安装结果.txt”，或按说明中的备用方法安装。' }
        $check = & $script:codePath --list-extensions --show-versions 2>&1
        if (!($check | Where-Object { "$_" -eq 'local-learning.code-compass-zh@0.4.0' })) { throw '还没有确认安装成功。请关闭 VS Code 后重新尝试，或使用备用安装方法。' }
        $status.Text = '安装成功！点击“打开练习”。如果 VS Code 提示重新加载窗口，请点击它。'
        $open.Enabled = $true
    } catch { $status.Text = "这次没有安装成功：`r`n$($_.Exception.Message)"; $install.Enabled = $true }
})
$open.Add_Click({
    $practice = Join-Path $bundleRoot '练习项目'
    if (Test-Path -LiteralPath $practice) { & $script:codePath --new-window $practice | Out-Null; $status.Text = '练习已打开。在 VS Code 中点击“知码”图标，再点击“从这里开始”。' }
    else { $status.Text = '没有找到练习项目。请在 VS Code 中按 Ctrl+Shift+P，输入“知码：从这里开始”。' }
})
[void]$form.ShowDialog()
