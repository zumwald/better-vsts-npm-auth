# better-vsts-npm-auth
Platform agnostic library and acompanying oauth service enabling developers to easily obtain and use tokens for authorizing NPM feeds in VSTS

## Installation
While not necessary, _better-vsts-npm-auth_ was built to be used as a global module.
`npm i -g better-vsts-npm-auth`

## Usage
### Command line
Best for ad-hoc cases. The CLI comes with fully descriptive help docs, you can run them via `better-vsts-npm-auth --help`.

### API
Provided for direct integration with application-specific tooling. On my team, we use this in our [preinstall script](https://docs.npmjs.com/misc/scripts) for our project to harden our system against annoying token expirations needlessly breaking our development mojo.

Example:
```
const vstsAuth = require('better-vsts-npm-auth');

vstsAuth.run()
  .then(() => console.log('woohoo! No more annoying 401s'));
```

## Dependency on [stateless-vsts-oauth](https://github.com/zumwald/stateless-vsts-oauth)
VSTS's OAuth flow is documented [here](https://docs.microsoft.com/en-us/vsts/integrate/get-started/authentication/oauth). It requires an internet-facing service to complete the token exchanges. While you're welcome to use an existing service if you have one or build your own if you're so inclined, you can also use this service as-is. It's hosted at https://stateless-vsts-oauth.azurewebsites.net.

## Prior art
While incomplete - the lack of support for *nix systems was perplexing - [vsts-npm-auth](https://www.npmjs.com/package/vsts-npm-auth) laid the foundation for this project in principle.