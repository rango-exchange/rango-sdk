# Rango Exchange SDK

Documents:

- [Basic-SDK Reference](https://docs.rango.exchange/api-integration/basic-api-single-step/api-reference)
- [Multiple-SDK Reference](https://docs.rango.exchange/api-integration/main-api-multi-step/api-reference)
- [Examples](https://github.com/rango-exchange/rango-sdk/tree/master/examples)
- [Basic-SDK Integration Tutorial](https://docs.rango.exchange/api-integration/basic-api-single-step/tutorial/sdk-example)

## Basic SDK (Single Step Tx)

[![npm version](https://badge.fury.io/js/rango-sdk-basic.svg)](https://badge.fury.io/js/rango-sdk-basic)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/LICENSE)

### Installation

Pin the SDK version to avoid non-reproducible builds and breaking changes.

npm install rango-sdk-basic@1.0.0 --save
# or
yarn add rango-sdk-basic@1.0.0

Commit the lockfile:

package-lock.json
# or
yarn.lock

## Main SDK (Multi Step Tx)

[![npm version](https://badge.fury.io/js/rango-sdk.svg)](https://badge.fury.io/js/rango-sdk)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/LICENSE)

### Installation

Pin the SDK version to avoid non-reproducible builds and breaking changes.

npm install rango-sdk@1.0.0 --save
# or
yarn add rango-sdk@1.0.0

Commit the lockfile:

package-lock.json
# or
yarn.lock

Pinning SDK versions and committing the lockfile prevents production swaps from silently picking up a newer SDK version with changed route, transaction, or quote behavior.