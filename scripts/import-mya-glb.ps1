param(
  [Parameter(Mandatory=$true)]
  [string]$Source
)

$ErrorActionPreference = 'Stop'
$Expected = '2fd4937d69168f4234854dd634f0135e3a92165f16b5918dc52942a78ed09618'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DestinationRelative = 'Assets/UserAssets/Mya.glb'
$Destination = Join-Path $Root $DestinationRelative

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
  throw "Source GLB not found: $Source"
}
$Actual = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) {
  throw "Refusing to import: file is not the exact Mya GLB from the project. Expected $Expected, got $Actual."
}

$Branch = (& git -C $Root branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $Branch -ne 'main') {
  throw "Must be on main to import Mya. Current branch: $Branch"
}
& git -C $Root fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed. No file changes made.' }
$AheadBehind = (& git -C $Root rev-list --left-right --count 'HEAD...origin/main').Trim()
if ($LASTEXITCODE -ne 0 -or $AheadBehind -notmatch '^0\s+0) {
  Write-Host "Local branch differs from origin/main ($AheadBehind). Review/sync before importing."
  throw 'Branch is not synchronized. No file changes made.'
}
$Existing = (& git -C $Root status --porcelain -- $DestinationRelative).Trim()
if ($Existing) {
  throw "Destination already has local changes. Refusing to overwrite: $DestinationRelative"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
Copy-Item -LiteralPath $Source -Destination $Destination -Force

# Create a Unity .meta for the imported GLB from within Unity, then commit it
# separately if desired. We never manufacture an unverified Unity GUID.
& git -C $Root add -- $DestinationRelative
if ($LASTEXITCODE -ne 0) { throw 'Git add failed.' }
& git -C $Root commit -m 'Add exact canonical Mya GLB (SHA-256 verified)' -- $DestinationRelative
if ($LASTEXITCODE -ne 0) {
  Write-Host 'No commit made (perhaps the exact file was already tracked).'
  exit 0
}
Write-Host 'Mya committed locally to main. The repository is public: pushing exposes the model file.'
$Choice = Read-Host 'Push the verified model to public GitHub main? Type YES to continue'
if ($Choice -cne 'YES') {
  Write-Host 'Not pushed. Commit is retained locally for review.'
  exit 0
}
& git -C $Root push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed. Local commit preserved; review remote updates and retry safely.' }
Write-Host 'Exact Mya GLB uploaded to GitHub main.'
) {
  Write-Host "Local branch differs from origin/main ($AheadBehind). Review/sync before importing."
  throw 'Branch is not synchronized. No file changes made.'
}
$Existing = (& git -C $Root status --porcelain -- $DestinationRelative).Trim()
if ($Existing) {
  throw "Destination already has local changes. Refusing to overwrite: $DestinationRelative"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
Copy-Item -LiteralPath $Source -Destination $Destination -Force

# Create a Unity .meta for the imported GLB from within Unity, then commit it
# separately if desired. We never manufacture an unverified Unity GUID.
& git -C $Root add -- $DestinationRelative
if ($LASTEXITCODE -ne 0) { throw 'Git add failed.' }
& git -C $Root commit -m 'Add exact canonical Mya GLB (SHA-256 verified)' -- $DestinationRelative
if ($LASTEXITCODE -ne 0) {
  Write-Host 'No commit made (perhaps the exact file was already tracked).'
  exit 0
}
Write-Host 'Mya committed locally to main. The repository is public: pushing exposes the model file.'
$Choice = Read-Host 'Push the verified model to public GitHub main? Type YES to continue'
if ($Choice -cne 'YES') {
  Write-Host 'Not pushed. Commit is retained locally for review.'
  exit 0
}
& git -C $Root push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed. Local commit preserved; review remote updates and retry safely.' }
Write-Host 'Exact Mya GLB uploaded to GitHub main.'
