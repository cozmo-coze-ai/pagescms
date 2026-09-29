$ErrorActionPreference = 'Stop'
# Interactive only: never pass the token as a command argument or paste it in chat.
$credentialDir = Join-Path $env:USERPROFILE '.codex\credentials\coze-homepage-editor'
New-Item -ItemType Directory -Path $credentialDir -Force | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($sid)
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $credentialDir -AclObject $acl
$secret = Read-Host 'Paste the fine-grained GitHub token (hidden)' -AsSecureString
try {
    if ($secret.Length -lt 20) { throw 'No valid token was entered.' }
    $credentialFile = Join-Path $credentialDir 'github-token.dpapi'
    $encrypted = ConvertFrom-SecureString -SecureString $secret
    [IO.File]::WriteAllText($credentialFile, $encrypted)
    Write-Output "Saved encrypted for this Windows user: $credentialFile"
} finally { $secret.Dispose() }
