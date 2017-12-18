const fs = require("fs");
const os = require("os");
const path = require("path");
const { Npmrc, Registry } = require("./lib/npm.js");
const config = require("./lib/config.js");
const vstsAuth = require("./lib/vsts-auth-client.js");
const { RegistryAuthReducer } = require("./lib/registry-auth-reducer");
const openUrl = require("openurl2").open;
const uuid = require("uuid/v4");

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

/**
 * @param {Object} e
 * @returns {boolean}
 */
exports.isAuthorizationError = e => e instanceof vstsAuth.AuthorizationError;

/**
 * @param {Object} options
 * @param {string} options.configOverride
 * @param {string} options.npmrcPath
 */
exports.run = options => {
  if (options.configOverride) {
    config.setConfigPath(options.configOverride);
  }

  let configObj = config.get();
  // if npmrcPath isn't specified, default is the working directory
  options.npmrcPath = options.npmrcPath || process.cwd();

  return Promise.all([
    Npmrc.getUserNpmrc().readSettingsFromFile(),
    new Npmrc(options.npmrcPath).readSettingsFromFile()
  ])
    .then(npmrcResults => ({
      userNpmrc: npmrcResults[0],
      projectNpmrc: npmrcResults[1]
    }))
    .then(npmrcResults => {
      let authenticatedRegistries = RegistryAuthReducer.authenticateRegistries(
        npmrcResults.projectNpmrc.getRegistries(),
        npmrcResults.userNpmrc.getRegistries()
      );

      // get the new settings which need to be written to the user npmrc file
      let authSettings = authenticatedRegistries.map(r => r.getAuthSettings());
      Object.assign(npmrcResults.userNpmrc.settings, ...authSettings);
    })
    .catch(e => {
      // if this is running in a CI environment, reject to signal failure
      // otherwise, open the auth page as the error is likely due to
      // the user needing to authorize the app and/or configure their
      // refresh_token
      if (!process.env.BUILD_BUILDID && !process.env.RELEASE_RELEASEID) {
        let consentUrl = `https://app.vssps.visualstudio.com/oauth2/authorize?client_id=${
          configObj.clientId
        }&response_type=Assertion&state=${uuid()}&scope=vso.packaging_write&redirect_uri=${
          configObj.redirectUri
        }`;

        console.log(
          "We need user consent before this script can run. Follow instructions in the browser window that just opened " +
            `and then you can run this script again. If a browser does not open, paste ${consentUrl} into your browser window and follow ` +
            "the instructions to grant permissions."
        );

        if (os.platform() !== "win32") {
          openUrl(consentUrl); // only try to open on *nix systems, Windows refuses to cooperate
        }
      }

      // no matter what, we error out here
      return Promise.reject(e);
    });
};
