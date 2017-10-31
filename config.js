const fs = require('fs');
const os = require('os');
const path = require('path');
const ini = require('ini');

const configPath = path.join(os.homedir(), '.vstsnpmauthrc');

const defaults = {
    clientId: 'DE516D90-B63E-4994-BA64-881EA988A9D2',
    redirectUri: 'https://stateless-vsts-oauth.azurewebsites.net/oauth-callback',
    tokenEndpoint: 'https://stateless-vsts-oauth.azurewebsites.net/token-refresh'
    //resourceId: '499b84ac-1321-427f-aa17-267ca6975798' // resourceId for vsts - should not need to be overridden
}

class Config {
    static set(key, val) {
        let configObj = Config.get();

        configObj[key] = val;

        Config.write(configObj);
    }

    static write(obj) {
        let configContents = ini.encode(obj);
        fs.writeFileSync(configPath, configContents);
    }

    static get() {
        let configContents = '';

        try {
            // we're deliberately using a sync call here because
            // otherwise the yargs command doesn't prevent the 
            // rest of the program from running
            configContents = fs.readFileSync(configPath, 'utf8');
        } catch (e) {
            // the config file is optional, so if it doesn't exist
            // just swallow the error and return the default (empty)
            // object. Otherwise, throw the error.
            if (e.code !== 'ENOENT') {
                throw e;
            }
        }

        let configObj = ini.parse(configContents);
        // merge with defaults, with user specified config taking precedence
        return Object.assign({}, defaults, configObj);
    }
}

module.exports = Config;