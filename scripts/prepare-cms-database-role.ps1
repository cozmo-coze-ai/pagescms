$ErrorActionPreference = 'Stop'
$cmsCredentialDir = Join-Path $env:USERPROFILE '.codex\credentials\coze-cms'
$cmsPasswordFile = Join-Path $cmsCredentialDir 'runtime-password.dpapi'
$cmsSetupFile = Join-Path $cmsCredentialDir 'create-cms-login.sql'
if ((Test-Path -LiteralPath $cmsPasswordFile) -or (Test-Path -LiteralPath $cmsSetupFile)) {
    throw 'CMS login setup already exists. Verify it before preparing another credential.'
}

[IO.Directory]::CreateDirectory($cmsCredentialDir) | Out-Null
$cmsIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$cmsAcl = New-Object Security.AccessControl.DirectorySecurity
$cmsAcl.SetAccessRuleProtection($true, $false)
foreach ($cmsPrincipal in @($cmsIdentity, 'NT AUTHORITY\SYSTEM')) {
    $cmsRule = New-Object Security.AccessControl.FileSystemAccessRule($cmsPrincipal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $cmsAcl.AddAccessRule($cmsRule)
}
Set-Acl -LiteralPath $cmsCredentialDir -AclObject $cmsAcl

$cmsRandomBytes = New-Object byte[] 32
$cmsRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
$cmsSecure = $null
try {
    $cmsRandom.GetBytes($cmsRandomBytes)
    $env:CMS_ROLE_SETUP_PASSWORD = [Convert]::ToBase64String($cmsRandomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $cmsSecure = ConvertTo-SecureString $env:CMS_ROLE_SETUP_PASSWORD -AsPlainText -Force
    $cmsSecure | ConvertFrom-SecureString | Set-Content -LiteralPath $cmsPasswordFile -Encoding ascii
    & node (Join-Path $PSScriptRoot 'render-cms-database-role.mjs') $cmsSetupFile
    if ($LASTEXITCODE -ne 0) { throw 'Setup SQL generation failed. Protected credential retained; verify before retrying.' }
    Write-Output "Ready for the owner to run: $cmsSetupFile"
    Write-Output 'Credential stored with Windows encryption. No database connection or production change performed.'
} finally {
    Remove-Item Env:\CMS_ROLE_SETUP_PASSWORD -ErrorAction SilentlyContinue
    [Array]::Clear($cmsRandomBytes, 0, $cmsRandomBytes.Length)
    $cmsRandom.Dispose()
    if ($null -ne $cmsSecure) { $cmsSecure.Dispose() }
}
