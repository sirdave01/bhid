$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

$baseUri = [Uri]"http://localhost:3000"
$loginUri = [Uri]::new($baseUri, "/api/auth/login")
$refreshUri = [Uri]::new($baseUri, "/api/auth/refresh")
$cookieJar = New-Object System.Net.CookieContainer
$cookieHandler = New-Object System.Net.Http.HttpClientHandler
$cookieHandler.CookieContainer = $cookieJar
$cookieClient = [System.Net.Http.HttpClient]::new($cookieHandler)
$noCookieHandler = New-Object System.Net.Http.HttpClientHandler
$noCookieHandler.UseCookies = $false
$noCookieClient = [System.Net.Http.HttpClient]::new($noCookieHandler)
$manualCookieHandler = New-Object System.Net.Http.HttpClientHandler
$manualCookieHandler.UseCookies = $false
$manualCookieClient = [System.Net.Http.HttpClient]::new($manualCookieHandler)

$allPassed = $true
$originalRefreshToken = $null
$replacementRefreshToken = $null
$securePassword = $null
$passwordPointer = [IntPtr]::Zero

function Invoke-BhidRequest {
    param(
        [Parameter(Mandatory = $true)]
        [System.Net.Http.HttpClient]$Client,

        [Parameter(Mandatory = $true)]
        [Uri]$Uri,

        [Parameter(Mandatory = $true)]
        [System.Net.Http.HttpMethod]$Method,

        [string]$JsonBody,

        [string]$RefreshToken
    )

    $request = [System.Net.Http.HttpRequestMessage]::new($Method, $Uri)

    try {
        if ($PSBoundParameters.ContainsKey("JsonBody")) {
            $request.Content = [System.Net.Http.StringContent]::new(
                $JsonBody,
                [System.Text.Encoding]::UTF8,
                "application/json"
            )
        }

        if ($PSBoundParameters.ContainsKey("RefreshToken")) {
            $request.Headers.TryAddWithoutValidation(
                "Cookie",
                "bhid_refresh=$RefreshToken"
            ) | Out-Null
        }

        $response = $Client.SendAsync($request).GetAwaiter().GetResult()

        try {
            return [int]$response.StatusCode
        }
        finally {
            $response.Dispose()
        }
    }
    finally {
        $request.Dispose()
    }
}

function Invoke-BhidScenario {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Request
    )

    try {
        $status = & $Request
        Write-Host ("{0}: HTTP {1}" -f $Name, $status)
        return $status
    }
    catch {
        Write-Host ("{0}: REQUEST FAILED" -f $Name)
        $script:allPassed = $false
        return $null
    }
}

function Assert-BhidStatus {
    param(
        [string]$Name,
        [Nullable[int]]$Actual,
        [int]$Expected
    )

    if ($null -eq $Actual -or $Actual -ne $Expected) {
        $script:allPassed = $false
    }
}

try {
    $email = Read-Host "Existing test account email"
    $securePassword = Read-Host "Existing test account password" -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        $securePassword
    )
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        $passwordPointer
    )
    $loginBody = @{
        email    = $email
        password = $password
    } | ConvertTo-Json -Compress
    $password = $null

    $loginStatus = Invoke-BhidScenario "1. Login" {
        Invoke-BhidRequest `
            -Client $cookieClient `
            -Uri $loginUri `
            -Method ([System.Net.Http.HttpMethod]::Post) `
            -JsonBody $loginBody
    }
    Assert-BhidStatus "Login" $loginStatus 200
    $loginBody = $null

    if ($loginStatus -eq 200) {
        $originalCookie = $cookieJar.GetCookies($refreshUri)["bhid_refresh"]

        if ($null -ne $originalCookie -and $originalCookie.Value) {
            $originalRefreshToken = $originalCookie.Value
            Write-Host "2. Original refresh cookie captured locally (value suppressed)"
        }
        else {
            Write-Host "2. Original refresh cookie: NOT ISSUED"
            $allPassed = $false
        }

        if ($null -ne $originalRefreshToken) {
            $refreshStatus = Invoke-BhidScenario "3. Refresh with cookie jar" {
                Invoke-BhidRequest `
                    -Client $cookieClient `
                    -Uri $refreshUri `
                    -Method ([System.Net.Http.HttpMethod]::Post)
            }
            Assert-BhidStatus "Refresh with cookie jar" $refreshStatus 200

            if ($refreshStatus -eq 200) {
                $replacementCookie = $cookieJar.GetCookies($refreshUri)["bhid_refresh"]

                if (
                    $null -ne $replacementCookie -and
                    $replacementCookie.Value -and
                    $replacementCookie.Value -ne $originalRefreshToken
                ) {
                    $replacementRefreshToken = $replacementCookie.Value
                }
                else {
                    Write-Host "3. Replacement refresh cookie: NOT ISSUED"
                    $allPassed = $false
                }
            }

            $replayStatus = Invoke-BhidScenario "4. Replay original refresh token" {
                Invoke-BhidRequest `
                    -Client $manualCookieClient `
                    -Uri $refreshUri `
                    -Method ([System.Net.Http.HttpMethod]::Post) `
                    -RefreshToken $originalRefreshToken
            }
            Assert-BhidStatus "Replay original refresh token" $replayStatus 401

            if ($null -ne $replacementRefreshToken) {
                $familyStatus = Invoke-BhidScenario "5. Refresh replacement after family revocation" {
                    Invoke-BhidRequest `
                        -Client $cookieClient `
                        -Uri $refreshUri `
                        -Method ([System.Net.Http.HttpMethod]::Post)
                }
                Assert-BhidStatus "Replacement after family revocation" $familyStatus 401
            }
            else {
                Write-Host "5. Replacement after family revocation: SKIPPED (no replacement cookie)"
                $allPassed = $false
            }
        }
        else {
            Write-Host "3. Refresh with cookie jar: SKIPPED (no original cookie)"
            Write-Host "4. Replay original refresh token: SKIPPED (no original cookie)"
            Write-Host "5. Replacement after family revocation: SKIPPED (no replacement cookie)"
            $allPassed = $false
        }
    }
    else {
        Write-Host "2. Original refresh cookie: SKIPPED (login did not succeed)"
        Write-Host "3. Refresh with cookie jar: SKIPPED (login did not succeed)"
        Write-Host "4. Replay original refresh token: SKIPPED (login did not succeed)"
        Write-Host "5. Replacement after family revocation: SKIPPED (login did not succeed)"
    }

    $missingCookieStatus = Invoke-BhidScenario "6. Refresh without cookie" {
        Invoke-BhidRequest `
            -Client $noCookieClient `
            -Uri $refreshUri `
            -Method ([System.Net.Http.HttpMethod]::Post)
    }
    Assert-BhidStatus "Refresh without cookie" $missingCookieStatus 401

    if ($allPassed) {
        Write-Host "All runnable authentication refresh checks passed."
        exit 0
    }

    Write-Host "One or more authentication refresh checks failed or were skipped."
    exit 1
}
finally {
    $originalRefreshToken = $null
    $replacementRefreshToken = $null
    $loginBody = $null

    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }

    if ($null -ne $securePassword) {
        $securePassword.Dispose()
    }

    $cookieClient.Dispose()
    $noCookieClient.Dispose()
    $manualCookieClient.Dispose()
}
