const { isUnique } = require("./extensions");
const {
  isVstsFeedUrl,
  getUserAuthToken,
  getVstsLabOauthToken,
  getServiceEndpoints
} = require("./vsts-auth-client");
const { Registry } = require("./npm");
const { getEndpointAuthorization } = require("vsts-task-lib/task");

class RegistryAuthReducer {
  /**
   *
   * @param {...Registry} registries
   * @returns {Promise<Registry[]>}
   */
  static authenticateRegistries(...registries) {
    let registriesToAuthenticate = registries.filter((e, i, a) => {
      let _isUnique = isUnique(e, i, a);
      let _isVstsRegistry = isVstsFeedUrl(e.url);

      return _isUnique && _isVstsRegistry;
    });

    // if we can get an OAuth token for the user, that is
    // preferred because it will work for all VSTS registries
    let labToken = getVstsLabOauthToken();
    if (!labToken) {
      return getUserAuthToken().then(userToken => {
        registriesToAuthenticate.forEach(r => (r.token = userToken));
        return registriesToAuthenticate;
      });
    } else {
      // if we're running in a VSTS build agent, we can use the
      // lab token present in process.env. However, this OAuth
      // token is only valid for feeds in the Project Collection
      // where the build is running; we have to use a service
      // endpoint to authenticate against registries in other
      // VSTS collections.

      /** @type {Registry[]} */
      let registriesInSameCollection = [];
      /** @type {Registry[]} */
      let registriesInOtherCollection = [];

      /**
       * @param {Registry} r
       */
      const isInSameCollection = r =>
        process.env[k_VstfCollectionUri].indexOf(
          r.project + ".visualstudio.com"
        ) === -1;

      // sort the registries into two segments according to
      // whether they're in the same project collection as
      // the build agent is running in
      registriesToAuthenticate.forEach(r => {
        if (isInSameCollection(r)) {
          registriesInSameCollection.push(r);
        } else {
          registriesInOtherCollection.push(r);
        }
      });

      // use the token exposed in the VSTS environment for use by build tasks
      // details: https://docs.microsoft.com/en-us/vsts/build-release/actions/scripts/powershell#oauth
      registriesInSameCollection.forEach(r => (r.token = labToken));

      let result = Promise.resolve(registriesInSameCollection);

      if (registriesInOtherCollection.length > 0) {
        result = result.then(resolvedRegistries => {
          // first, we need to get the service endpoint registrations for this project
          return getServiceEndpoints().then(endpoints => {
            // iterate through endpoints, if there is a match then get the author
            let processedRegistries = [];

            endpoints.some(e => {
              registriesInOtherCollection.forEach((r, i) => {
                if (r.url === e.url) {
                  let authorization = getEndpointAuthorization(e.id, false);

                  switch (authorization.scheme) {
                    case "UsernamePassword":
                      r.basicAuthSettings.username =
                        authorization.parameters["username"];
                      r.basicAuthSettings.password =
                        authorization.parameters["password"];
                      r.basicAuthSettings.email = r.basicAuthSettings.username; // npm needs an email to be set in order to publish, this is ignored on npmjs
                      break;
                    case "Token":
                      r.basicAuthSettings.email = "VssEmail";
                      r.basicAuthSettings.username = "VssToken";
                      r.basicAuthSettings.password =
                        authorization.parameters["apitoken"];
                      break;
                  }

                  processedRegistries.push(r);
                  registriesInOtherCollection.splice(i, 1); // remove processed element from array to exclude it from further processing
                }
              });

              return registriesInOtherCollection.length === 0; // short-circuit if we've processed all the registries
            });

            return Promise.resolve(
              resolvedRegistries.concat(processedRegistries)
            );
          });
        });
      }

      return result;
    }
  }
}

module.exports = { RegistryAuthReducer };
