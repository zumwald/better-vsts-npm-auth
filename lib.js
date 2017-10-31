const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const npm = require('./npm.js');
const config = require('./config.js');
const vstsAuth = require('./vsts-auth-client.js');
const openUrl = require('openurl2').open;
const uuid = require('uuid/v4');

/**
 * Authentication library for maintaining an up-to-date
 * authentication token in the user's npmrc for interfacing with
 * VSTS feeds
 * 
 * Workflow:
 *   1.    read into memory the npmrc credentials from the given project
 *         in order to see which registries we need credentials for
 *   2.a   if there are credentials in ~/.npmrc, verify that the token
 *         has more than 1 week until it expires
 *   2.b   if not, request an access_token and store the
 *         new credentials in ~/.npmrc
 *
 *   A note on authentication & authorization:
 *         this program should not prompt the user unless absolutely
 *         necessary. Authentication should only be needed once, when
 *         this program is run for the very first time on a device.
 *         Any subsequent authorization needs (such as for step 2.b
 *         above) should use the cached refresh_token to gain a fresh
 *         access_token for authorization.
 */

exports.setRefreshToken = vstsAuth.setRefreshToken;
exports.isAuthorizationError = e => e instanceof vstsAuth.AuthorizationError;
exports.run = argv => {
    // argv is optional, if it's not provided then load the default config
    argv = argv || config.get();
    // set default for npmrcPath
    argv.npmrcPath = argv.npmrcPath || process.cwd();

    return Promise.all([
        new npm.Npmrc(os.homedir()).readSettingsFromFile(),
        new npm.Npmrc(argv.npmrcPath).readSettingsFromFile()
    ]).then(npmrcResults => ({
        userNpmrc: npmrcResults[0],
        projectNpmrc: npmrcResults[1]
    })).then(npmrcResults => {
        // get project registries which we need credentials for (restrict to
        // visualstudio.com hosted registries)
        const isVstsFeedUrl = r => r && r.indexOf('pkgs.visualstudio.com/_packaging') > -1;
        let projectRegistries = npmrcResults.projectNpmrc.getRegistries()
            .filter(r => isVstsFeedUrl(r.url));
        console.log('Found the following project registries needed for the', argv.npmrcPath, 'project:\n', projectRegistries.map(r => '\t' + r.url).join('\n'));

        // hydrate token info for registries for which we already have auth
        projectRegistries.forEach(r => {
            let authKeys = r.getAuthKeys();
            let authKey = authKeys && authKeys[0];

            if (authKey) {
                r.token = npmrcResults.userNpmrc.settings[authKey];
            }
        });

        // if the registry has a token, ensure it's not expiring
        // returns the registries which need authorization
        const ONE_WEEK = 604800000;
        const ADD_TOKEN_MSG = 'adding it to list of tokens to retrieve';
        projectRegistries = projectRegistries.filter(r => {
            // filter the registries to only return those which are
            // missing a token, or that have a token that is about
            // to expire
            if (!r.token) {
                console.log('Token for', r.url, 'does not exist;', ADD_TOKEN_MSG);
                return true;
            } else {
                let decodedToken = jwt.decode(r.token);

                // if token is invalid or expires in less than a week,
                // replace it with an empty token
                if (!decodedToken
                    || !decodedToken.exp
                    || ((decodedToken.exp * 1000) < (Date.now() + ONE_WEEK))
                ) {
                    console.log('Token for', r.url, 'will expire;', ADD_TOKEN_MSG);
                    return true;
                }
            }

            // token exists and was a valid JWT within the expiry,
            // no need to process the registry
            return false;
        });

        return vstsAuth.getAuthToken().then(accessToken => {
            let newConfig = projectRegistries.reduce((c, r) => {
                r.getAuthKeys().forEach(k => {
                    c[k] = accessToken;
                });
                return c;
            }, {});

            Object.assign(npmrcResults.userNpmrc.settings, newConfig);
            return npmrcResults.userNpmrc.saveSettingsToFile();
        }).catch(e => {
            // if this is running in a CI environment, reject to signal failure
            // otherwise, open the auth page as the error is likely due to
            // the user needing to authorize the app and/or configure their
            // refresh_token
            if (!process.env.BUILD_BUILDID && !process.env.RELEASE_RELEASEID) {
                let consentUrl = `https://app.vssps.visualstudio.com/oauth2/authorize?client_id=${argv.clientId}&response_type=Assertion&state=${uuid()}&scope=vso.packaging_write&redirect_uri=${argv.redirectUri}`;
                console.log('We need user consent before this script can run. Follow instructions in the browser window that just opened ' +
                    `and then you can run this script again. If a browser does not open, paste ${consentUrl} into your browser window and follow ` +
                    'the instructions to grant permissions.');
                openUrl(consentUrl);
            }

            // no matter what, we error out here
            return Promise.reject(e);
        });
    });
};