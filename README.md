# Overview

This package contains a resolver for the [@dsnp/did-resolver](https://github.com/LibertyDSNP/dsnp-did-resolver) library which enables resolution of `did:dsnp:*` DIDs on the [Frequency](https://github.com/frequency-chain/frequency) blockchain.

# Installation

`npm install @dsnp/did-resolver-frequency`

# Usage

The resolver object can be constructed with Frequency connection information in one of two ways.

1. Construct with provider URI:

```
import { FrequencyResolver } from "@dsnp/did-resolver-frequency";

const frequencyResolver = new FrequencyResolver({
  providerUri: "ws://127.0.0.1:9944",
});
```

If constructed this way, you must call `disconnect()` to explicitly release the connection; the process will not exit if this is not done.

or,

2. Construct with preconfigured `Promise<ApiPromise>` object from `@polkadot/api`:

```
import { FrequencyResolver } from "@dsnp/did-resolver-frequency";

const frequencyResolver = new FrequencyResolver({
  apiPromise: myApiPromise, // from ApiPromise.create(...)
});
```

Summary of options:

| Configuration option | Description |
| --- | --- |
| `providerUri` | Provider URI for Frequency RPC node (optional; alternative to `apiPromise` |
| `apiPromise` | A `Promise<ApiPromise>` (optional; alternative to `providerUri` |

See `.env.example` for example configuration.

Here's a full usage example with the `did-io` DID resolver framework:

```
import { CachedResolver } from "@digitalbazaar/did-io";
import didDsnp from "@dsnp/did-resolver"; 
import { FrequencyResolver } from "@dsnp/did-resolver-frequency";

const frequencyResolver = new FrequencyResolver({
  providerUri: "wss://1.rpc.frequency.xyz",
});

const resolver = new CachedResolver();
resolver.use(didDsnp.driver([ frequencyResolver ]));
const did = "did:dsnp:123456";
const result = await resolver.get({ did });
console.log(JSON.stringify(result, null, 2));

await frequencyResolver.disconnect();

/* Example output:
{
  "@context": [
    "https://www.w3.org/ns/did/v1"
  ],
  "id": "did:dsnp:1",
  "assertionMethod": [
    {
      "@context": "https://w3id.org/security/multikey/v1",
      "id": "did:dsnp:1#z6MktEsFq4c5qFZkj3wq5FZDurXLpG1s9gD7oWDZoS8S5F27",
      "type": "Multikey",
      "controller": "did:dsnp:1",
      "publicKeyMultibase": "z6MktEsFq4c5qFZkj3wq5FZDurXLpG1s9gD7oWDZoS8S5F27"
    }
  ],
  "keyAgreement": []
}
*/
```

## CLI

The example above is provided as a command line script.

```
cp .env.example .env
# uncomment the desired node endpoint
npm run resolve -- 13972
```

# Features

Currently this resolver implements the minimal functionality required to support lookup of public keys by DSNP applications.

- DSNP control keys are listed in the `authentication` array.
- DSNP `keyAgreementPublicKeys` are listed in the `keyAgreement` array.
- DSNP `assertionMethodPublicKeys` are listed in the `assertionMethod` array.
- A user's Frequency handle, if one exists, is noted in the `alsoKnownAs` array with a `did:frqcy:handle:` prefix.

All public keys are encoded using the `Multikey` type.
The `id` consists of the DSNP DID and a URL fragment that is the same as the `publicKeyMultibase` value, which is a multicodec value in `base58btc` encoding.
The decoded value for `ed25519-pub` keys will be 34 bytes, including the two-byte multicodec identifier.
