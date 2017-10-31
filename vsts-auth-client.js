const request = require('request');
const config = require('./config.js');

class AuthorizationError extends Error {
    constructor(...a) {
        super(...a);
    }
}

exports.AuthorizationError = AuthorizationError;
exports.getAuthToken = () => {
    // we can short-circuit in a lab environment where SYSTEM_ACCESSTOKEN is available
    // this avoids the instability of making unnecessary network requests
    // docs: https://docs.microsoft.com/en-us/vsts/build-release/concepts/definitions/build/variables?tabs=batch#predefined-variables
    let lab_token = process.env['SYSTEM_ACCESSTOKEN'];
    if (lab_token) {
        return Promise.resolve(lab_token);
    }

    let configObj = config.get();
    // validate config
    if (!configObj || !configObj.tokenEndpoint) {
        return Promise.reject(new Error('invalid config, missing tokenEndpoint'));
    } else if (!configObj.refresh_token) {
        return Promise.reject(new AuthorizationError('missing refresh_token'));
    }

    return new Promise((resolve, reject) => {
        return request.post(configObj.tokenEndpoint, {
            json: true,
            qs: {
                code: configObj.refresh_token
            }
        }, (err, res, body) => {
            if (err) {
                return reject(err);
            } else if (!body || !body.refresh_token || !body.access_token) {
                return reject('malformed response body:\n' + body);
            } else {
                // stash the refresh_token
                config.set('refresh_token', body.refresh_token);
                return resolve(body.access_token);
            }
        });
    });
};
