const request = require("request");
const jwt = require("jsonwebtoken");
const config = require("./config");

const k_REFRESH_TOKEN = "refresh_token";
const k_VstfCollectionUri = "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI";
const k_VstfTeamProjectId = "SYSTEM_TEAMPROJECTID";

class AuthorizationError extends Error {
  constructor(...a) {
    super(...a);
  }
}

/**
 * @returns {boolean}
 */
exports.getVstsLabOauthToken = () => process.env["SYSTEM_ACCESSTOKEN"];

/**
 * @param {string} url
 */
exports.isVstsFeedUrl = url =>
  url.indexOf("pkgs.visualstudio.com/_packaging") > -1;

exports.AuthorizationError = AuthorizationError;

/**
 * @param {string} token
 */
exports.setRefreshToken = token => config.set(k_REFRESH_TOKEN, token);

/**
 * @returns {string}
 */
exports.getUserAuthToken = () => {
  let configObj = config.get();
  // validate config
  if (!configObj || !configObj.tokenEndpoint) {
    return Promise.reject(new Error("invalid config, missing tokenEndpoint"));
  } else if (!configObj[k_REFRESH_TOKEN]) {
    return Promise.reject(new AuthorizationError("missing " + k_REFRESH_TOKEN));
  }

  return new Promise((resolve, reject) => {
    return request.post(
      configObj.tokenEndpoint,
      {
        json: true,
        qs: {
          code: configObj[k_REFRESH_TOKEN]
        }
      },
      (err, res, body) => {
        if (err) {
          return reject(err);
        } else if (!body || !body[k_REFRESH_TOKEN] || !body.access_token) {
          return reject("malformed response body:\n" + body);
        } else {
          // stash the refresh_token
          config.set(k_REFRESH_TOKEN, body[k_REFRESH_TOKEN]);
          return resolve(body.access_token);
        }
      }
    );
  }).then(accessToken => {
    // VSTS auth service doesn't accomodate clock skew well
    // in these "JIT" scenarios. Check if the token nbf is
    // after our time, and wait for the difference if it is.
    let newTokenDecoded = jwt.decode(accessToken);
    console.log(
      "\nnew token received:",
      "\n\tnbf:",
      newTokenDecoded && newTokenDecoded.nbf,
      "\n\texp:",
      newTokenDecoded && newTokenDecoded.exp,
      "\n\tscope:",
      newTokenDecoded && newTokenDecoded.scp
    );

    return new Promise((resolve, reject) => {
      const NOW_IN_EPOCH = Math.floor(Date.now() / 1000);
      if (newTokenDecoded.nbf > NOW_IN_EPOCH) {
        const timeToWaitInMs =
          Math.floor(newTokenDecoded.nbf - NOW_IN_EPOCH) * 1000;
        console.log(
          "waiting out clock skew of",
          timeToWaitInMs,
          "milliseconds."
        );
        setTimeout(() => resolve(), timeToWaitInMs);
      } else {
        resolve();
      }
    }).then(() => accessToken);
  });
};

/**
 * @typedef {Object} ServiceEndpoint
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string} url
 */

/**
 * @returns {Promise<ServiceEndpoint[]>}
 */
exports.getServiceEndpoints = () => {
  return new Promise((resolve, reject) => {
    const endpoint = `${process.env[k_VstfCollectionUri]}DefaultCollection/${
      process.env[k_VstfTeamProjectId]
    }/_apis/distributedtask/serviceendpoints?api-version=3.0-preview.1`;
    const labToken = getVstsLabOauthToken();

    request.get(
      endpoint,
      {
        json: true,
        auth: {
          bearer: labToken
        }
      },
      (err, res, body) => {
        if (err) {
          reject(err);
        } else if (!body || !body.value) {
          reject("malformed response");
        } else {
          resolve(body.value);
        }
      }
    );
  });
};
