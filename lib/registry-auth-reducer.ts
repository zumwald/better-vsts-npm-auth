import {
  isVstsFeedUrl,
  getVstsLabOauthToken,
  getUserAuthToken
} from "./vsts-auth-client";
import { Registry } from "./npm";
const k_VstfCollectionUri = "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI";

export interface IRegistryCollectionShards {
  sameCollection: Array<Registry>;
  differentCollection: Array<Registry>;
}
/**
 * Given an array of Registry objects, returns only those
 * which are unique and correspond to a VSTS feed.
 */
export function filterUniqueVstsRegistries(
  registries: Array<Registry>
): Array<Registry> {
  return registries.filter((e, i) => {
    try {
      let _isUnique = registries.findIndex(v => v.url === e.url) === i;
      let _isVstsRegistry = isVstsFeedUrl(e.url);
      return _isUnique && _isVstsRegistry;
    } catch (e) {
      console.error("exception in filterUniqueVstsRegistries:", e);
      return false;
    }
  });
}

export function isInSameCollection(r: Registry): boolean {
  if (process.env[k_VstfCollectionUri]) {
    return (
      process.env[k_VstfCollectionUri].indexOf(
        r.project + ".visualstudio.com"
      ) > -1
    );
  } else {
    return false;
  }
}

/**
 * Given an array of Registry objects, splits them
 * by the collection their VSTS feed resides in. Only
 * splits by whether they are in the same collection
 * as the current job scope or a different one. This
 * depends on running inside of a VSTS agent context
 * as it depends on SYSTEM_TEAMFOUNDATIONCOLLECTIONURI.
 */
export function shardRegistriesByCollection(
  registries: Array<Registry>
): IRegistryCollectionShards {
  let result: IRegistryCollectionShards = {
    sameCollection: [],
    differentCollection: []
  };

  registries.forEach(r => {
    let sameCollection = isInSameCollection(r);
    if (sameCollection) {
      result.sameCollection.push(r);
    } else {
      result.differentCollection.push(r);
    }
  });

  return result;
}

export async function authenticateRegistries(
  ...registries: Array<Registry>
): Promise<Array<Registry>> {
  let registriesToAuthenticate = filterUniqueVstsRegistries(registries);

  // if we can get an OAuth token for the user, that is
  // preferred because it will work for all VSTS registries
  let labToken = getVstsLabOauthToken();

  if (!labToken) {
    let userToken = await getUserAuthToken();
    registriesToAuthenticate.forEach(r => (r.token = userToken));
    return Promise.resolve(registriesToAuthenticate);
  } else {
    // when we're running in a VSTS build agent, we can use the
    // lab token present in process.env. However, this OAuth
    // token is only valid for feeds in the Project Collection
    // where the build is running.
    let registriesByCollection = shardRegistriesByCollection(
      registriesToAuthenticate
    );

    // use the token exposed in the VSTS environment for use by build tasks
    // details: https://docs.microsoft.com/en-us/vsts/build-release/actions/scripts/powershell#oauth
    registriesByCollection.sameCollection.forEach(r => {
      console.log(`using SYSTEM_ACCESSTOKEN for ${r.url}`);
      r.token = labToken;
    });

    // if there are registries in other VSTS collections, we currently don't
    // support authenticating those. Print a warning message for each of them.
    if (registriesByCollection.differentCollection.length > 0) {
      console.warn(
        `Found ${
          registriesByCollection.differentCollection.length
        } registries ` +
          "which could not be authenticated:\n" +
          registriesByCollection.differentCollection.map(x => `\t${x.url}\n`)
      );
    }

    return registriesByCollection.sameCollection;
  }
}
