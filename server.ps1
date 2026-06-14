$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:5500/')
$listener.Start()
Write-Host 'Server started on http://localhost:5500'
while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
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
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ctx.Response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
        $ctx.Response.Headers.Add("Pragma", "no-cache")
        $ctx.Response.ContentLength64 = $bytes.LongLength
        $ctx.Response.OutputStream.Write($bytes, 0, [int]$bytes.LongLength)
    } else {
        $ctx.Response.StatusCode = 404
        $ctx.Response.ContentLength64 = 0
    }
    $ctx.Response.OutputStream.Flush()
    $ctx.Response.OutputStream.Close()
}
