const request = require('request');
const config = require('./config.js');

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
    if (!configObj || !configObj.tokenEndpoint || !configObj.refresh_token) {
        const msg = 'Error in vsts-auth-client.getAuthToken with \n\ttokenEndpoint: '
            + configObj && configObj.tokenEndpoint + '\n\trefresh_token: ' + configObj && configObj.refresh_token;
        return Promise.reject(msg);
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

/*
class VstsAuthClient {
    constructor(clientId, tokenEndpoint) {
        // use closure pattern to create private members
        let _vstsApiRequestOptions = {
            json: true,
            headers: {
                'X-TFS-FedAuthRedirect': 'Suppress'
            }
        };



        // define public methods which need to interact with private members
        this.setAuthenticationOption = obj => _requestOptions.auth = obj;
        this.getVstsApiRequestOptions = () => _vstsApiRequestOptions;

        this.getAuthToken = refresh_token => {

        };
    }

    /*getFeedToken(project, feed, cb) {
        // validate input
        if (!project || !feed || !cb) {
            throw new Error('VstsAuthClient.getFeedToken: invalid parameters');
        }

        let options = this.getVstsApiRequestOptions();
        options.baseUrl = `https://${project}.feeds.visualstudio.com/`;

        request.get('_apis/FeedToken/SessionTokens/' + feed, options, (error, response, body) => {
            cb(error, body && body.alternateToken);
        });

        return this;
    }
}*/