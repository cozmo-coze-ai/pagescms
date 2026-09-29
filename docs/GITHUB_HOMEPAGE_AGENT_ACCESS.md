# GitHub access for the ChatGPT homepage editor

Updated 2026-09-29. The owner supplied a fine-grained GitHub token and asked
for persistent access for future agents. Its value is stored outside Git,
encrypted with Windows DPAPI for the current Windows user:

`C:\Users\cozmo\.codex\credentials\coze-homepage-editor\github-token.dpapi`

The credential directory grants access only to the current Windows user and
SYSTEM, with inherited permissions disabled. The encrypted file inherits
these restrictions. Another machine or Windows identity cannot normally
decrypt it. Never place the decrypted value in documentation, source,
plugin archives, logs, command arguments or chat.

## Verified access

- Intended repository: `cozmo-coze-ai/coze_client`; production branch: `main`.
- Authenticated read-only requests to the repository and main Git reference
  succeeded on 2026-09-29.
- Main commit at verification: `01fdc3f4b4ed7697c9de14838fa2da6a39ae5e1b`.
- Write permission was subsequently verified by the hosted connector creating
  commit `0d068def60e653738479bc5079ee5d185eae0019` on the isolated
  `coze-homepage-preview` branch. It only adds a CSS comment for the connection
  test; main was not advanced. Token expiry was not independently verified.
- The token is installed as `GITHUB_TOKEN` on `coze-homepage-editor`.
  Hosted OAuth, homepage reads and preview creation succeeded. Real ChatGPT
  installation and an approved publication still require separate verification.

## Owner sign-in

The connector uses a separate random owner connection key, not the GitHub or
Cloudflare credential. Only its SHA-256 hash is stored in `TEAM_MEMBERS_JSON`.
Its protected local file is
`C:\Users\cozmo\.codex\credentials\coze-homepage-editor\owner-connection-key.dpapi`.
Use `coze_homepage_editor/scripts/copy-owner-connection-key.ps1` to copy it to
the clipboard for the connector's OAuth form; never paste it into a chat.
Only the owner is provisioned currently. Create a distinct member/key record
for each teammate before sharing access; never share the owner's key.

The intended fine-grained permission is Contents: Read and write on this
repository only, with automatic Metadata read. Do not assume access to other
repositories or use the credential for unrelated work.

## Safe reuse

CMS migration follow-up (2026-09-29): under the owner's separate CMS migration
authorization, this saved token also successfully pushed the reviewed migration
and deployment fixes to `cozmo-coze-ai/pagescms/main`. The default cached Git
credential returned HTTP 403. Use process-scoped Git authentication from this
encrypted file; do not replace the global credential helper or install this key
in the CMS runtime. The production migration source is the isolated
`C:\COZE_CORP\pagescms-cloudflare-release` checkout; unrelated unfinished work
remains in the original CMS checkout.

Run under the same Windows user. Keep the credential in memory and print only
selected non-secret results:

```powershell
$ghSecure = (Get-Content -LiteralPath 'C:\Users\cozmo\.codex\credentials\coze-homepage-editor\github-token.dpapi' -Raw).Trim() | ConvertTo-SecureString
$ghHeaders = @{
    Authorization = 'Bearer ' + [Net.NetworkCredential]::new('', $ghSecure).Password
    Accept = 'application/vnd.github+json'
    'User-Agent' = 'coze-homepage-editor'
    'X-GitHub-Api-Version' = '2022-11-28'
}
try {
    $ref = Invoke-RestMethod -Uri 'https://api.github.com/repos/cozmo-coze-ai/coze_client/git/ref/heads/main' -Headers $ghHeaders
    $ref.object.sha
} finally {
    $ghHeaders.Clear()
    $ghSecure.Dispose()
}
```

Do not enable verbose HTTP logging. When setting the authorized Worker's
secret, load this file and pass the value through a protected input stream;
never write a plaintext intermediate file. The originally supplied token
appeared in chat; replace it through the secure input script when rotating
credentials, and revoke the old token in GitHub.

Secure replacement script:
[`coze_homepage_editor/scripts/save-github-token.ps1`](../../coze_homepage_editor/scripts/save-github-token.ps1).
The script prompts with hidden input and outputs only the encrypted file path.

Current implementation and remaining activation steps:
[`coze_homepage_editor/README.md`](../../coze_homepage_editor/README.md).
Cloudflare access: [CLOUDFLARE_AGENT_ACCESS.md](CLOUDFLARE_AGENT_ACCESS.md).
