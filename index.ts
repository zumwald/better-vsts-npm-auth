import { Npmrc } from "./lib/npm";
import { Config, IConfigDictionary } from "./lib/config";
import { authenticateRegistries } from "./lib/registry-auth-reducer";
import { AuthorizationError } from "./lib/vsts-auth-client";
const uuid = require("uuid/v4");

export { setRefreshToken } from "./lib/vsts-auth-client";

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

export function isAuthorizationError(e: Error): boolean {
  return e instanceof AuthorizationError;
}

export interface IRunOptions {
  configOverride: string;
  npmrcPath: string;
}

export async function run(options: IRunOptions) {
  let configObj: IConfigDictionary;

  try {
    if (options.configOverride) {
      Config.setConfigPath(options.configOverride);
    }

    configObj = Config.get();
    // if npmrcPath isn't specified, default is the working directory
    options.npmrcPath = options.npmrcPath || process.cwd();

    let [userNpmrc, projectNpmrc] = await Promise.all([
      Npmrc.getUserNpmrc().readSettingsFromFile(),
      new Npmrc(options.npmrcPath).readSettingsFromFile()
    ]);

    let authenticatedRegistries = await authenticateRegistries(
      ...projectNpmrc.getRegistries(),
      ...userNpmrc.getRegistries()
    );

    // get the new settings which need to be written to the user npmrc file
    console.log(
      "Authenticating the following registries:\n",
      authenticatedRegistries.map(r => `\t${r.url}\n`).join("")
    );
    let authSettings = authenticatedRegistries.map(r => r.getAuthSettings());
    Object.assign(userNpmrc.settings, ...authSettings);

    await userNpmrc.saveSettingsToFile();
  } catch (e) {
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
        "\n*****\n" +
          "We need user consent before this script can run.\n\n" +
          "Follow instructions in the browser window that just opened, or if a browser does not open,\n" +
          "manually browse to this url and follow the instructions there:\n\n" +
          `${consentUrl}\n\n` +
          "Then run better-vsts-npm-auth again after consent has been granted.\n*****\n"
      );
    }

    // no matter what, we error out here
    throw e;
  }
}
