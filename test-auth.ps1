# Test authenticated endpoints after signin
# 1. Open browser to: https://jolly-sand-089c0af03.3.azurestaticapps.net/.auth/login/aad
# 2. Sign in with l.pielikys@gmail.com  
# 3. After signin, run these commands in the same browser session (copy cookies):

Write-Host "Testing authenticated endpoints..."
Write-Host "`n1. Sign in at: https://jolly-sand-089c0af03.3.azurestaticapps.net/.auth/login/aad"
Write-Host "2. After signin, get your cookies from browser DevTools (Application > Cookies)"
Write-Host "3. Then test these URLs in the same browser session:"
Write-Host "   - https://jolly-sand-089c0af03.3.azurestaticapps.net/.auth/me (shows your user info)"
Write-Host "   - https://jolly-sand-089c0af03.3.azurestaticapps.net/api/roles (should show ['authenticated'])"
Write-Host "   - https://jolly-sand-089c0af03.3.azurestaticapps.net/api/admincheck (should show isAdmin and roles)"
Write-Host "`nIf admincheck returns empty roles or error, check:"
Write-Host "   - AZURE_CLIENT_ID is set in SWA API app settings"
Write-Host "   - AZURE_CLIENT_SECRET is set with the actual secret Value"
Write-Host "   - Graph permission AppRoleAssignment.Read.All is consented"
Write-Host "   - User is assigned to Admins role in Entra Enterprise Applications"
