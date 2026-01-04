// Useradmin endpoints: user management (list, promote/demote, block) and content moderation
// Protect all actions with admin check
const { getGraphToken, getUserById, getAllUsers, setUserRole, blockUser, unblockUser, connectToDatabase, getBlobServiceClient, getClientPrincipal, getUserAppRoles } = require('../shared/utils');

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

        // Check admin role using the same logic as checkadmin
        let userId = null;
        let roles = [];
        let lookedUp = false;
        let email = principal.userDetails;
        let usersDebug = {};
        let appRoleAssignmentsDebug = null;
        if (email) {
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
        }
        const isAdmin = roles.includes('Admin');
        if (!isAdmin) {
            context.res = {
                status: 403,
                body: { error: 'Admin access required' }
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
                // Add timestamp for cache busting
                const timestamp = Date.now();
                const url = `https://graph.microsoft.com/v1.0/users?$top=500&$count=true&$select=id,displayName,userPrincipalName,mail,accountEnabled&_=${timestamp}`;
                context.log('useradmin: fetch', url);
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${graphToken}`,
                        'ConsistencyLevel': 'eventual',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Prefer': 'return=representation'
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

                // Handle pagination if there are more users
                let allUsers = data.value || [];
                let nextLink = data['@odata.nextLink'];
                while (nextLink) {
                    context.log('useradmin: fetching next page', nextLink);
                    // Add select parameters to nextLink if not present
                    const separator = nextLink.includes('?') ? '&' : '?';
                    const paginatedUrl = `${nextLink}${separator}$select=id,displayName,userPrincipalName,mail,accountEnabled`;
                    const nextRes = await fetch(paginatedUrl, {
                        headers: {
                            Authorization: `Bearer ${graphToken}`,
                            'ConsistencyLevel': 'eventual',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'Prefer': 'return=representation'
                        }
                    });
                    if (nextRes.ok) {
                        const nextData = await nextRes.json();
                        allUsers = allUsers.concat(nextData.value || []);
                        nextLink = nextData['@odata.nextLink'];
                    } else {
                        context.log('useradmin: failed to fetch next page', nextRes.status);
                        break;
                    }
                }

                context.log('useradmin: total users fetched', allUsers.length);
                // Map to expected frontend format
                const users = allUsers.map(u => {
                    // accountEnabled can be true, false, or undefined/null
                    const accountEnabled = u.accountEnabled;
                    const blocked = accountEnabled === false || accountEnabled === null || accountEnabled === undefined;
                    context.log(`useradmin: user ${u.displayName || u.userPrincipalName} - accountEnabled: ${accountEnabled} (type: ${typeof accountEnabled}), blocked: ${blocked}`);
                    context.log(`useradmin: user object keys: ${Object.keys(u).join(', ')}`);
                    return {
                        id: u.id,
                        name: u.displayName || u.userPrincipalName || u.mail,
                        email: u.mail || u.userPrincipalName,
                        isAdmin: false, // Will be determined by checking app roles for each user
                        blocked: blocked
                    };
                });

                // Check admin roles for each user
                for (const user of users) {
                    try {
                        const roles = await getUserAppRoles(user.id);
                        user.isAdmin = roles.includes('Admin');
                    } catch (roleError) {
                        context.log('useradmin: failed to get roles for user', user.id, roleError.message);
                        user.isAdmin = false;
                    }
                }
                context.log('useradmin: users found', users.length);
                context.res = { status: 200, body: { users, totalFetched: allUsers.length, rawGraph: data, requestUrl: url, requestHeaders: { Authorization: 'Bearer ...', ConsistencyLevel: 'eventual' } } };
                return;
            } catch (err) {
                context.log('useradmin: exception', err && err.message, err && err.stack);
                context.res = { status: 500, body: { error: 'Exception in listUsers', details: err && err.message, stack: err && err.stack } };
                return;
            }
        }
        if (action === 'getUser' && req.body && req.body.userId) {
            context.log('useradmin: getUser start', req.body.userId);
            try {
                const graphToken = await getGraphToken();
                const timestamp = Date.now();
                const url = `https://graph.microsoft.com/v1.0/users/${req.body.userId}?$select=id,displayName,userPrincipalName,mail,accountEnabled&_=${timestamp}`;
                context.log('useradmin: fetch user', url);
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${graphToken}`,
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                if (!res.ok) {
                    const text = await res.text();
                    context.log('useradmin: graph error', text);
                    context.res = { status: 500, body: { error: 'Failed to fetch user from Graph', details: text, status: res.status } };
                    return;
                }
                const userData = await res.json();
                context.log(`useradmin: getUser raw data - accountEnabled: ${userData.accountEnabled} (type: ${typeof userData.accountEnabled})`);
                context.log(`useradmin: getUser object keys: ${Object.keys(userData).join(', ')}`);
                const roles = await getUserAppRoles(req.body.userId);
                const accountEnabled = userData.accountEnabled;
                const blocked = accountEnabled === false || accountEnabled === null || accountEnabled === undefined;
                const user = {
                    id: userData.id,
                    name: userData.displayName || userData.userPrincipalName || userData.mail,
                    email: userData.mail || userData.userPrincipalName,
                    isAdmin: roles.includes('Admin'),
                    blocked: blocked
                };
                context.log('useradmin: user fetched', user);
                context.res = { status: 200, body: { user, rawGraph: userData } };
                return;
            } catch (err) {
                context.log('useradmin: exception', err && err.message, err && err.stack);
                context.res = { status: 500, body: { error: 'Exception in getUser', details: err && err.message, stack: err && err.stack } };
                return;
            }
        }
        if (action === 'promoteAdmin' && req.body && req.body.userId) {
            context.log('useradmin: promoteAdmin start', req.body);
            try {
                const db = await connectToDatabase();
                const auditlogCollection = db.collection('auditlog');

                const result = await setUserRole(req.body.userId, 'admin');

                // Add audit log entry
                try {
                    const auditLog = {
                        action: 'promoteAdmin',
                        adminId: userId, // The admin who performed the action
                        targetUserId: req.body.userId,
                        details: `Promoted user ${req.body.userId} to admin role`
                    };
                    await auditlogCollection.insertOne({ ...auditLog, timestamp: new Date() });
                    context.log('useradmin: promoteAdmin - audit log added');
                } catch (auditError) {
                    context.log.warn('useradmin: promoteAdmin - audit log error', auditError.message);
                    // Don't fail the operation if audit logging fails
                }

                context.log('useradmin: promoteAdmin - success');
                context.res = { status: 200, body: { result } };
                return;
            } catch (err) {
                context.log('useradmin: promoteAdmin error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to promote user to admin', details: err && err.message } };
                return;
            }
        }
        if (action === 'demoteAdmin' && req.body && req.body.userId) {
            context.log('useradmin: demoteAdmin start', req.body);
            try {
                const db = await connectToDatabase();
                const auditlogCollection = db.collection('auditlog');

                const result = await setUserRole(req.body.userId, 'user');

                // Add audit log entry
                try {
                    const auditLog = {
                        action: 'demoteAdmin',
                        adminId: userId, // The admin who performed the action
                        targetUserId: req.body.userId,
                        details: `Demoted user ${req.body.userId} from admin role`
                    };
                    await auditlogCollection.insertOne({ ...auditLog, timestamp: new Date() });
                    context.log('useradmin: demoteAdmin - audit log added');
                } catch (auditError) {
                    context.log.warn('useradmin: demoteAdmin - audit log error', auditError.message);
                    // Don't fail the operation if audit logging fails
                }

                context.log('useradmin: demoteAdmin - success');
                context.res = { status: 200, body: { result } };
                return;
            } catch (err) {
                context.log('useradmin: demoteAdmin error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to demote user from admin', details: err && err.message } };
                return;
            }
        }
        if (action === 'blockUser' && req.body && req.body.userId) {
            context.log('useradmin: blockUser start', req.body);
            try {
                const db = await connectToDatabase();
                const auditlogCollection = db.collection('auditlog');

                const result = await blockUser(req.body.userId);

                // Add audit log entry
                try {
                    const auditLog = {
                        action: 'blockUser',
                        adminId: userId, // The admin who performed the action
                        targetUserId: req.body.userId,
                        details: `Blocked user ${req.body.userId}`
                    };
                    await auditlogCollection.insertOne({ ...auditLog, timestamp: new Date() });
                    context.log('useradmin: blockUser - audit log added');
                } catch (auditError) {
                    context.log.warn('useradmin: blockUser - audit log error', auditError.message);
                    // Don't fail the operation if audit logging fails
                }

                context.log('useradmin: blockUser - success');
                context.res = { status: 200, body: { result } };
                return;
            } catch (err) {
                context.log('useradmin: blockUser error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to block user', details: err && err.message } };
                return;
            }
        }
        if (action === 'unblockUser' && req.body && req.body.userId) {
            context.log('useradmin: unblockUser start', req.body);
            try {
                const db = await connectToDatabase();
                const auditlogCollection = db.collection('auditlog');

                const result = await unblockUser(req.body.userId);

                // Add audit log entry
                try {
                    const auditLog = {
                        action: 'unblockUser',
                        adminId: userId, // The admin who performed the action
                        targetUserId: req.body.userId,
                        details: `Unblocked user ${req.body.userId}`
                    };
                    await auditlogCollection.insertOne({ ...auditLog, timestamp: new Date() });
                    context.log('useradmin: unblockUser - audit log added');
                } catch (auditError) {
                    context.log.warn('useradmin: unblockUser - audit log error', auditError.message);
                    // Don't fail the operation if audit logging fails
                }

                context.log('useradmin: unblockUser - success');
                context.res = { status: 200, body: { result } };
                return;
            } catch (err) {
                context.log('useradmin: unblockUser error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to unblock user', details: err && err.message } };
                return;
            }
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
                const auditlogCollection = db.collection('auditlog');

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

                // Add audit log entry
                try {
                    const auditLog = {
                        action: 'deleteScreenshot',
                        adminId: userId, // The admin who performed the action
                        targetUserId: req.body.userId,
                        pokemonId: req.body.pokemonId,
                        screenshotType: req.body.shiny ? 'shiny' : 'regular',
                        details: `Deleted ${req.body.shiny ? 'shiny' : 'regular'} screenshot for Pokemon ${req.body.pokemonId} from user ${req.body.userId}`
                    };
                    await auditlogCollection.insertOne({ ...auditLog, timestamp: new Date() });
                    context.log('useradmin: deleteScreenshot - audit log added');
                } catch (auditError) {
                    context.log.warn('useradmin: deleteScreenshot - audit log error', auditError.message);
                    // Don't fail the operation if audit logging fails
                }

                context.log('useradmin: deleteScreenshot - success');
                context.res = { status: 200, body: { result, message: 'Screenshot deleted' } };
                return;
            } catch (err) {
                context.log('useradmin: deleteScreenshot error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to delete screenshot', details: err && err.message } };
                return;
            }
        }

        // Audit log actions
        if (action === 'getLogs') {
            context.log('useradmin: getLogs start');
            try {
                const db = await connectToDatabase();
                const auditlogCollection = db.collection('auditlog');
                const logs = await auditlogCollection.find({}).sort({ timestamp: -1 }).limit(100).toArray();

                context.log('useradmin: getLogs found', logs.length, 'logs');
                context.res = { status: 200, body: { logs } };
                return;
            } catch (err) {
                context.log('useradmin: getLogs error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to get audit logs', details: err && err.message } };
                return;
            }
        }

        if (action === 'addLog' && req.body && req.body.log) {
            context.log('useradmin: addLog start', req.body.log);
            try {
                const db = await connectToDatabase();
                const auditlogCollection = db.collection('auditlog');

                const log = req.body.log;
                log.timestamp = new Date();

                const result = await auditlogCollection.insertOne(log);

                context.log('useradmin: addLog success');
                context.res = { status: 200, body: { success: true, result } };
                return;
            } catch (err) {
                context.log('useradmin: addLog error', err && err.message);
                context.res = { status: 500, body: { error: 'Failed to add audit log', details: err && err.message } };
                return;
            }
        }

        context.res = { status: 400, body: { error: 'Invalid action or missing parameters' } };
    } catch (fatal) {
        context.log('useradmin: fatal error', fatal && fatal.message, fatal && fatal.stack);
        context.res = { status: 500, body: { error: 'Fatal error in useradmin', details: fatal && fatal.message, stack: fatal && fatal.stack } };
    }
};
