$root = $PSScriptRoot
$port = 5501

# ── File watcher — tracks changes ──────────────────────────────────────────────
$watcher = [System.IO.FileSystemWatcher]::new($root)
$watcher.IncludeSubdirectories = $false
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite
$watcher.Filter = '*.*'
$watcher.EnableRaisingEvents = $true

$global:lastChangeTime = [datetime]::UtcNow

$onChange = {
    $f = $Event.SourceEventArgs.Name
    if ($f -match '\.(html|css|js|svg|png|jpg)$') {
        $global:lastChangeTime = [datetime]::UtcNow
        Write-Host "🔄 Changed: $f"
    }
}
Register-ObjectEvent $watcher Changed -Action $onChange | Out-Null
Register-ObjectEvent $watcher Created -Action $onChange | Out-Null

# ── Live-reload snippet injected into every HTML response ──────────────────────
$liveReloadSnippet = @'
<script>
(function(){
  var last = null;
  setInterval(function(){
    fetch('/__ping?t=' + Date.now())
      .then(function(r){ return r.text(); })
      .then(function(t){ if(last !== null && t !== last) location.reload(); last = t; })
      .catch(function(){});
  }, 800);
})();
</script>
'@

# ── HTTP listener ──────────────────────────────────────────────────────────────
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "✅ Server started on http://localhost:$port  (live-reload enabled)"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()

    # ── Ping endpoint for live-reload ──────────────────────────────────────────
    if ($ctx.Request.Url.LocalPath -eq '/__ping') {
        $ts = $global:lastChangeTime.Ticks.ToString()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($ts)
        $ctx.Response.ContentType = 'text/plain'
        $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
        $ctx.Response.ContentLength64 = $bytes.LongLength
        $ctx.Response.OutputStream.Write($bytes, 0, [int]$bytes.LongLength)
        $ctx.Response.OutputStream.Flush()
        $ctx.Response.OutputStream.Close()
        continue
    }

    # ── Normal file serving ────────────────────────────────────────────────────
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')
    if ($path -eq '' -or $path -eq '/') { $path = 'nav.html' }
    $file = Join-Path $root $path

    if (Test-Path $file) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.js'   { 'application/javascript' }
            '.svg'  { 'image/svg+xml' }
            '.png'  { 'image/png' }
            '.jpg'  { 'image/jpeg' }
            default { 'application/octet-stream' }
        }
        $ctx.Response.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')
        $ctx.Response.Headers.Add('Pragma', 'no-cache')

        if ($ext -eq '.html') {
            $html = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
            $html = $html -replace '</body>', "$liveReloadSnippet</body>"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
        } else {
            $bytes = [System.IO.File]::ReadAllBytes($file)
        }

        $ctx.Response.ContentLength64 = $bytes.LongLength
        $ctx.Response.OutputStream.Write($bytes, 0, [int]$bytes.LongLength)
    } else {
        $ctx.Response.StatusCode = 404
        $ctx.Response.ContentLength64 = 0
    }

    $ctx.Response.OutputStream.Flush()
    $ctx.Response.OutputStream.Close()
}
