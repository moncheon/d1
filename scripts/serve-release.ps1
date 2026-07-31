param(
    [int]$Port = 4174
)

$ErrorActionPreference = 'Stop'
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\release\web'))
$rootPrefix = $releaseRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot 'index.html') -PathType Leaf)) {
    throw "Web release not found: $releaseRoot"
}

function Get-ContentType {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.js'   { return 'text/javascript; charset=utf-8' }
        '.mjs'  { return 'text/javascript; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif'  { return 'image/gif' }
        '.svg'  { return 'image/svg+xml' }
        '.webp' { return 'image/webp' }
        '.ico'  { return 'image/x-icon' }
        '.woff' { return 'font/woff' }
        '.woff2' { return 'font/woff2' }
        '.mp3'  { return 'audio/mpeg' }
        '.ogg'  { return 'audio/ogg' }
        '.wav'  { return 'audio/wav' }
        default { return 'application/octet-stream' }
    }
}

function Write-HttpResponse {
    param(
        [System.IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType,
        [byte[]]$Body,
        [bool]$IncludeBody = $true
    )

    $headers = "HTTP/1.1 $StatusCode $StatusText`r`n" +
        "Content-Type: $ContentType`r`n" +
        "Content-Length: $($Body.Length)`r`n" +
        "Cache-Control: no-store`r`n" +
        "X-Content-Type-Options: nosniff`r`n" +
        "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($IncludeBody -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$running = $true
$allowShutdown = $env:QUOKKA_ALLOW_SHUTDOWN -eq '1'

try {
    $listener.Start()
    $url = "http://127.0.0.1:$Port/"
    Write-Host ''
    Write-Host 'Quokka Pipe Cleaner is running.' -ForegroundColor Green
    Write-Host "URL: $url"
    Write-Host 'Keep this window open. Press Ctrl+C or close it to stop.'
    Write-Host ''

    if ($env:QUOKKA_NO_BROWSER -ne '1') {
        Start-Process $url
    }

    while ($running) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new(
                $stream,
                [System.Text.Encoding]::ASCII,
                $false,
                1024,
                $true
            )
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }
            do {
                $headerLine = $reader.ReadLine()
            } while ($null -ne $headerLine -and $headerLine.Length -gt 0)

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Bad request')
                Write-HttpResponse $stream 400 'Bad Request' 'text/plain; charset=utf-8' $body
                continue
            }

            $method = $parts[0].ToUpperInvariant()
            $requestTarget = $parts[1]
            $uri = [System.Uri]::new("http://127.0.0.1$requestTarget")

            if ($allowShutdown -and $uri.AbsolutePath -eq '/__shutdown__') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Stopping')
                Write-HttpResponse $stream 200 'OK' 'text/plain; charset=utf-8' $body ($method -ne 'HEAD')
                $running = $false
                continue
            }

            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
                Write-HttpResponse $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body
                continue
            }

            $relativePath = [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = 'index.html'
            }
            $relativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $candidate = [System.IO.Path]::GetFullPath((Join-Path $releaseRoot $relativePath))
            $insideRelease = $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)

            if (-not $insideRelease -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                Write-HttpResponse $stream 404 'Not Found' 'text/plain; charset=utf-8' $body ($method -ne 'HEAD')
                continue
            }

            $body = [System.IO.File]::ReadAllBytes($candidate)
            Write-HttpResponse $stream 200 'OK' (Get-ContentType $candidate) $body ($method -ne 'HEAD')
        }
        catch {
            Write-Warning $_.Exception.Message
        }
        finally {
            if ($null -ne $client) {
                $client.Dispose()
            }
        }
    }
}
finally {
    $listener.Stop()
}
