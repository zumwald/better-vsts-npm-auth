const vstsAuthClient = require("./vsts-auth-client");
const { Registry } = require("./npm");
const k_VstfCollectionUri = "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI";

class RegistryAuthReducer {
  /**
   * Given an array of Registry objects, returns only those
   * which are unique and correspond to a VSTS feed.
   * @param {Registry[]} registries
   * @returns {Registry[]}
   */
  static filterUniqueVstsRegistries(registries) {
    return registries.filter((e, i, a) => {
      let _isUnique = registries.findIndex(v => v.url === e.url) === i;
      let _isVstsRegistry = vstsAuthClient.isVstsFeedUrl(e.url);
      return _isUnique && _isVstsRegistry;
    });
  }

  /**
   * @typedef RegistryCollectionShards
   * @property {Registry[]} sameCollection
   * @property {Registry[]} differentCollection
   */
  /**
   * Given an array of Registry objects, splits them
   * by the collection their VSTS feed resides in. Only
   * splits by whether they are in the same collection
   * as the current job scope or a different one. This
   * depends on running inside of a VSTS agent context
   * as it depends on SYSTEM_TEAMFOUNDATIONCOLLECTIONURI.
   * @param {Registry[]} registries
   * @returns {RegistryCollectionShards}
   */
  static shardRegistriesByCollection(registries) {
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
      ) !== -1;

    registries.forEach(r => {
      if (isInSameCollection(r)) {
        registriesInSameCollection.push(r);
      } else {
        registriesInOtherCollection.push(r);
      }
    });

    return {
      sameCollection: registriesInSameCollection,
      differentCollection: registriesInOtherCollection
    };
  }

  /**
   * Given an array of Registry objects, fetches
   * auth credentials from the current VSTS collection's
   * service endpoints. If a given Registry does not
   * have a service endpoint configuration, a warning
   * message is printed and it is omitted from the result.
   * @param {Registry[]} registries
   * @returns {Promise<Registry[]>}
   */
  static authenticateRegistriesWithServiceEndpoint(registries) {
    // first, we need to get the service endpoint registrations for this project
    return vstsAuthClient.getServiceEndpoints().then(endpoints => {
      let processedRegistries = [];
      console.log(
        "processing service endpoint authorization, found",
        endpoints.length,
        "endpoints."
      );

      const { getEndpointAuthorization } = require("vsts-task-lib/task");

      // we use Array.prototype.some here so that we can bail
      // out early if we've processed all of the endpoints we
      // need.
      endpoints.some(endpoint => {
        let registryIndex = registries.findIndex(r => r.url === endpoint.url);

        // if none of our registries match this endpoint,
        // move on to process the next endpoint
        if (registryIndex === -1) {
          return false;
        }

        let registry = registries[registryIndex];

        let authorization = getEndpointAuthorization(endpoint.id, false);
        switch (authorization.scheme) {
          case "UsernamePassword":
            registry.basicAuthSettings.username =
              authorization.parameters["username"];
            registry.basicAuthSettings.password =
              authorization.parameters["password"];
            registry.basicAuthSettings.email =
              registry.basicAuthSettings.username; // npm needs an email to be set in order to publish, this is ignored on npmjs
            break;
          case "Token":
            registry.token = authorization.parameters["apitoken"];
            break;
        }

        processedRegistries.push(registry);
        registries.splice(registryIndex, 1);

        // if we've processed all the registries, return true
        // to short-circuit the loop and exit early
        return registries.length <= 0;
      });

      // if there are still unprocessed registries, it means we didn't have any
      // endpoint authorizations configured for them. Write a warning to the user.
      if (registries.length > 0) {
        console.warn(
          "Unable to find authorization for the following registries outside of the collection:",
          registries.map(r => `\n\t${r.url}`).join("")
        );
      }

      return Promise.resolve(processedRegistries);
    });
  }

  /**
   *
   * @param {...Registry} registries
   * @returns {Promise<Registry[]>}
   */
  static authenticateRegistries(...registries) {
    let registriesToAuthenticate = RegistryAuthReducer.filterUniqueVstsRegistries(
      registries
    );

    // if we can get an OAuth token for the user, that is
    // preferred because it will work for all VSTS registries
    let labToken = vstsAuthClient.getVstsLabOauthToken();
    if (!labToken) {
      return vstsAuthClient.getUserAuthToken().then(userToken => {
        registriesToAuthenticate.forEach(r => (r.token = userToken));
        return registriesToAuthenticate;
      });
    } else {
      // when we're running in a VSTS build agent, we can use the
      // lab token present in process.env. However, this OAuth
      // token is only valid for feeds in the Project Collection
      // where the build is running; we have to use a service
      // endpoint to authenticate against registries in other
      // VSTS collections.
      let registriesByCollection = RegistryAuthReducer.shardRegistriesByCollection(
        registriesToAuthenticate
      );

      // use the token exposed in the VSTS environment for use by build tasks
      // details: https://docs.microsoft.com/en-us/vsts/build-release/actions/scripts/powershell#oauth
      registriesByCollection.sameCollection.forEach(r => (r.token = labToken));

      let result = Promise.resolve(registriesByCollection.sameCollection);

      // if there are registries in other VSTS collections, we'll need to get
      // the auth credentials from a configured service endpoint. This will
      // be an async call, so we'll need to chain the result variable with
      // the Promise for the service endpoint result
      if (registriesByCollection.differentCollection.length > 0) {
        result = result.then(resolvedRegistries => {
          let processedRegistries = RegistryAuthReducer.authenticateRegistriesWithServiceEndpoint(
            registriesByCollection.differentCollection
          );

          return processedRegistries.then(newRegistries =>
            resolvedRegistries.concat(newRegistries)
          );
        });
      }

      return result;
    }
  }
}

module.exports = {
  RegistryAuthReducer
};
