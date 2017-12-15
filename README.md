# better-vsts-npm-auth

Platform agnostic library and acompanying oauth service enabling developers to easily obtain and use tokens for authorizing NPM feeds in VSTS

[![CircleCI](https://circleci.com/gh/zumwald/better-vsts-npm-auth/tree/master.svg?style=svg)](https://circleci.com/gh/zumwald/better-vsts-npm-auth/tree/master)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

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
const input = require('input');

vstsAuth.run()
  .then(() => console.log('woohoo! No more annoying 401s'))
  .catch(e => {
      // we can catch AuthorizationError and prompt our users to
      // authorize the Stateless VSTS NPM OAuth application
      // (or your own application, if you specify an alternate
      // clientId in your config, which you're welcome to do)
      if (vstsAuth.isAuthorizationError(e)){
          // fail if we're running in a lab
          if (process.env['BUILD_BUILDID'] || process.env['RELEASE_RELEASEID']){
              return Promise.reject(e);
          }

          // wait for user input if we're running on a dev box
          // note - I like the input package, but feel free to get your user
          // input however you'd like
          return input.text('paste your refresh_token:').
            then(token => {
                vstsAuth.setRefreshToken(token);

                // not necessary, but nifty if you want to create a
                // seamless local dev startup experience by re-running
                return vstsAuth.run();
            })
      });
```

## Dependency on [stateless-vsts-oauth](https://github.com/zumwald/stateless-vsts-oauth)

VSTS's OAuth flow is documented [here](https://docs.microsoft.com/en-us/vsts/integrate/get-started/authentication/oauth). It requires an internet-facing service to complete the token exchanges. While you're welcome to use an existing service if you have one or build your own if you're so inclined, you can also use this service as-is. It's hosted at https://stateless-vsts-oauth.azurewebsites.net.

## Prior art

While incomplete - the lack of support for \*nix systems was perplexing - [vsts-npm-auth](https://www.npmjs.com/package/vsts-npm-auth) laid the foundation for this project in principle.
