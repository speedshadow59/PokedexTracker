// Useradmin endpoints: user management (list, promote/demote, block) and content moderation
// Protect all actions with admin check
const { getGraphToken, getUserById, getAllUsers, setUserRole, blockUser, connectToDatabase, getBlobServiceClient, getClientPrincipal, getUserAppRoles } = require('../shared/utils');

module.exports = async function (context, req) {
    context.log('useradmin: function start');

    try {
        // Copy authentication logic from checkadmin
        const principal = getClientPrincipal(req);
        context.log('useradmin: principal', principal);
        if (!principal || !principal.userId) {
            context.res = {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
                body: { error: 'Not authenticated', isAdmin: false }
            };
            return;
        }

        // Check admin role (copy full logic from checkadmin)
        let roles = [];
        let lookedUp = false;
        let userId = principal.userId;
        let email = principal.userDetails;
        let usersDebug = {};
        let appRoleAssignmentsDebug = null;

        try {
            roles = await getUserAppRoles(userId);
        } catch (e) {
            context.log('useradmin: direct role lookup failed, trying user lookup', e.message);
            roles = [];
        }

        // If no roles found and we have email, try extensive user lookup like checkadmin
        if ((!roles || !roles.length) && email) {
            try {
                const graphToken = await getGraphToken();
                const encode = encodeURIComponent;

                // 1. Try userPrincipalName eq email
                let url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(email)}'&$select=id,userPrincipalName`;
                let res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
                let data = res.ok ? await res.json() : null;
                usersDebug.byEmail = data;

                if (!(data && Array.isArray(data.value) && data.value.length)) {
                    // 2. Try external UPN (B2B guest)
                    let extUpn = email;
                    if (email.includes('@')) {
                        const match = email.match(/^([^@]+)@([^@]+)$/);
                        if (match) {
                            const local = match[1].replace(/\./g, '_');
                            const domain = match[2].replace(/\./g, '_');
                            extUpn = `${local}_${domain}#EXT#@lpielikysgmail.onmicrosoft.com`;
                        }
                    }
                    url = `https://graph.microsoft.com/v1.0/users?$filter=userPrincipalName eq '${encode(extUpn)}'&$select=id,userPrincipalName`;
                    res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
                    data = res.ok ? await res.json() : null;
                    usersDebug.byExtUpn = data;
                }

                if (!(data && Array.isArray(data.value) && data.value.length)) {
                    // 3. Try mail eq email
                    url = `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encode(email)}'&$select=id,userPrincipalName`;
                    res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
                    data = res.ok ? await res.json() : null;
                    usersDebug.byMail = data;
                }

                if (!(data && Array.isArray(data.value) && data.value.length)) {
                    // 4. Try otherMails/any(x:x eq email)
                    url = `https://graph.microsoft.com/v1.0/users?$filter=otherMails/any(x:x eq '${encode(email)}')&$select=id,userPrincipalName`;
                    res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
                    data = res.ok ? await res.json() : null;
                    usersDebug.byOtherMails = data;
                }

                if (!(data && Array.isArray(data.value) && data.value.length)) {
                    // 5. Try startswith(userPrincipalName, local part)
                    const local = email.split('@')[0];
                    url = `https://graph.microsoft.com/v1.0/users?$filter=startswith(userPrincipalName,'${encode(local)}')&$select=id,userPrincipalName`;
                    res = await fetch(url, { headers: { Authorization: `Bearer ${graphToken}` } });
                    data = res.ok ? await res.json() : null;
                    usersDebug.byStartsWith = data;
                }

                // Use first match found
                let found = null;
                for (const key of ['byEmail','byExtUpn','byMail','byOtherMails','byStartsWith']) {
                    if (usersDebug[key] && Array.isArray(usersDebug[key].value) && usersDebug[key].value.length) {
                        found = usersDebug[key].value[0];
                        break;
                    }
                }

                if (found) {
                    userId = found.id;
                    lookedUp = true;
                    let appRoleUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/appRoleAssignments`;
                    let appRoleRes = await fetch(appRoleUrl, { headers: { Authorization: `Bearer ${graphToken}` } });
                    appRoleAssignmentsDebug = appRoleRes.ok ? await appRoleRes.json() : null;
                    roles = await getUserAppRoles(userId);
                }
            } catch (lookupError) {
                context.log('useradmin: user lookup failed', lookupError.message);
                roles = [];
            }
        }

        const isAdmin = roles.includes('Admin');

        if (!isAdmin) {
            context.res = {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
                body: { error: 'Admin access required', isAdmin: false, debug: { roles, lookedUp, userId, email, usersDebug } }
            };
            return;
        }

        const action = req.query.action || (req.body && req.body.action);
        if (!action) {
            context.res = { status: 400, body: { error: 'Missing action' } };
            context.log('useradmin: missing action');
            return;
        }

        context.log('useradmin: action', action);
        // User management actions
        if (action === 'listUsers') {
            context.log('useradmin: listUsers start');
            try {
                const graphToken = await getGraphToken();
                context.log('useradmin: got graph token');
                const url = 'https://graph.microsoft.com/v1.0/users?$top=100&$count=true';
                context.log('useradmin: fetch', url);
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${graphToken}`,
                        'ConsistencyLevel': 'eventual'
                    }
                });
                context.log('useradmin: fetch done', res.status, res.statusText);
                const text = await res.text();
                let data = {};
                try { data = JSON.parse(text); } catch (e) { data = { parseError: e.message, raw: text }; }
                if (!res.ok) {
                    context.log('useradmin: graph error', text);
                    context.res = { status: 500, body: { error: 'Failed to fetch users from Graph', details: text, status: res.status, statusText: res.statusText, raw: data, requestUrl: url, requestHeaders: { Authorization: 'Bearer ...', ConsistencyLevel: 'eventual' } } };
                    return;
                }
                // Map to expected frontend format
                const users = (data.value || []).map(u => ({
                    id: u.id,
                    name: u.displayName || u.userPrincipalName || u.mail,
                    email: u.mail || u.userPrincipalName,
                    isAdmin: false, // Optionally, fetch roles per user if needed
                    blocked: u.accountEnabled === false
                }));
                context.log('useradmin: users found', users.length);
                context.res = { status: 200, body: { users, rawGraph: data, requestUrl: url, requestHeaders: { Authorization: 'Bearer ...', ConsistencyLevel: 'eventual' } } };
                return;
            } catch (err) {
                context.log('useradmin: exception', err && err.message, err && err.stack);
                context.res = { status: 500, body: { error: 'Exception in listUsers', details: err && err.message, stack: err && err.stack } };
                return;
            }
        }
        if (action === 'promoteAdmin' && req.body && req.body.userId) {
            const result = await setUserRole(req.body.userId, 'admin');
            context.res = { status: 200, body: { result } };
            return;
        }
        if (action === 'demoteAdmin' && req.body && req.body.userId) {
            const result = await setUserRole(req.body.userId, 'user');
            context.res = { status: 200, body: { result } };
            return;
        }
        if (action === 'blockUser' && req.body && req.body.userId) {
            const result = await blockUser(req.body.userId);
            context.res = { status: 200, body: { result } };
            return;
        }

        // Content moderation actions
        if (action === 'listMedia') {
            context.log('useradmin: listMedia start');
            try {
                const db = await connectToDatabase();
                const userdexCollection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');
                const screenshots = await userdexCollection.find({
                    $or: [
                        { screenshot: { $exists: true, $ne: null } },
                        { screenshotShiny: { $exists: true, $ne: null } }
                    ]
                }).toArray();

                // Transform to media items
                const media = [];
                for (const doc of screenshots) {
                    if (doc.screenshot) {
                        media.push({
                            id: `${doc.userId}-${doc.pokemonId}-regular`,
                            userId: doc.userId,
                            pokemonId: doc.pokemonId,
                            type: 'screenshot',
                            url: doc.screenshot,
                            shiny: false,
                            removed: false
                        });
                    }
                    if (doc.screenshotShiny) {
                        media.push({
                            id: `${doc.userId}-${doc.pokemonId}-shiny`,
                            userId: doc.userId,
                            pokemonId: doc.pokemonId,
                            type: 'screenshot',
                            url: doc.screenshotShiny,
                            shiny: true,
                            removed: false
                        });
                    }
                }

                context.log('useradmin: listMedia found', media.length, 'items');
                context.res = { status: 200, body: { media } };
                return;
            } catch (err) {
                context.log('useradmin: listMedia error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to list media', details: err && err.message } };
                return;
            }
        }

        if (action === 'deleteScreenshot' && req.body && req.body.userId && req.body.pokemonId && req.body.shiny !== undefined) {
            context.log('useradmin: deleteScreenshot start', req.body);
            try {
                const db = await connectToDatabase();
                const userdexCollection = db.collection(process.env.COSMOS_DB_COLLECTION_NAME || 'userdex');

                // Find the document
                const doc = await userdexCollection.findOne({
                    userId: req.body.userId,
                    pokemonId: parseInt(req.body.pokemonId)
                });

                if (!doc) {
                    context.log('useradmin: deleteScreenshot - user pokemon not found');
                    context.res = { status: 404, body: { error: 'User Pokemon entry not found' } };
                    return;
                }

                const field = req.body.shiny ? 'screenshotShiny' : 'screenshot';
                const screenshotUrl = doc[field];

                if (!screenshotUrl) {
                    context.log('useradmin: deleteScreenshot - screenshot not found');
                    context.res = { status: 404, body: { error: 'Screenshot not found' } };
                    return;
                }

                // Delete from blob storage
                try {
                    context.log('useradmin: deleteScreenshot - deleting blob');
                    const blobServiceClient = getBlobServiceClient();
                    const containerName = process.env.BLOB_STORAGE_CONNECTION_STRING ? 'pokemon-media' : 'pokemon-media';
                    const containerClient = blobServiceClient.getContainerClient(containerName);

                    const url = new URL(screenshotUrl);
                    const blobName = url.pathname.split(`/${containerName}/`)[1].split('?')[0];

                    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                    await blockBlobClient.deleteIfExists();
                    context.log('useradmin: deleteScreenshot - blob deleted');
                } catch (blobError) {
                    context.log.warn('useradmin: deleteScreenshot - blob delete error', blobError.message);
                }

                // Update database to remove the screenshot reference
                const updateData = { [field]: null };
                const result = await userdexCollection.updateOne(
                    { userId: req.body.userId, pokemonId: parseInt(req.body.pokemonId) },
                    { $set: updateData }
                );

                context.log('useradmin: deleteScreenshot - success');
                context.res = { status: 200, body: { result, message: 'Screenshot deleted' } };
                return;
            } catch (err) {
                context.log('useradmin: deleteScreenshot error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to delete screenshot', details: err && err.message } };
                return;
            }
        }

        context.res = { status: 400, body: { error: 'Invalid action or missing parameters' } };
    } catch (fatal) {
        context.log('useradmin: fatal error', fatal && fatal.message, fatal && fatal.stack);
        context.res = { status: 500, body: { error: 'Fatal error in useradmin', details: fatal && fatal.message, stack: fatal && fatal.stack } };
    }
};
