$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $env:USERPROFILE '.codex\credentials\coze-homepage-editor\owner-connection-key.dpapi'
$secret = (Get-Content -LiteralPath $credentialPath -Raw).Trim() | ConvertTo-SecureString
try {
    Set-Clipboard -Value ([Net.NetworkCredential]::new('', $secret).Password)
    Write-Host 'Connection key copied. Paste only into the COZE connection sign-in form, then clear the clipboard.'
} finally {
    $secret.Dispose()
}
