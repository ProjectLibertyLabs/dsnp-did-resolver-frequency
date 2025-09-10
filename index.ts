import avro from "avsc";
import { base58btc } from "multiformats/bases/base58";
import { dsnp } from "@dsnp/frequency-schemas";
import { DSNPResolver } from "@dsnp/did-resolver";
import { options } from "@frequency-chain/api-augment";
import { WsProvider, ApiPromise } from "@polkadot/api";
import { bnToU8a, u8aToHex, hexToString } from "@polkadot/util";
import { xxhashAsHex } from "@polkadot/util-crypto";

const publicKeyAvroSchema = avro.Type.forSchema(dsnp.publicKey as avro.Schema);

function storageItemKeyAsHex(module: string, method: string) {
  return xxhashAsHex(module, 128) + xxhashAsHex(method, 128).substring(2);
}

const keyCountStorageKeyHex = storageItemKeyAsHex(
  "Msa",
  "PublicKeyCountForMsaId",
);
const displayNameStorageKeyHex = storageItemKeyAsHex(
  "Handles",
  "MSAIdToDisplayName",
);

type VerificationMethod = {
  "@context": "https://w3id.org/security/multikey/v1";
  id: string;
  type: "Multikey";
  controller: string;
  publicKeyMultibase: string;
};

function makeVerificationMethod(
  controller: string,
  publicKeyMultibase: string,
): VerificationMethod {
  return {
    "@context": "https://w3id.org/security/multikey/v1",
    id: `${controller}#${publicKeyMultibase}`,
    type: "Multikey",
    controller,
    publicKeyMultibase,
  };
}

export class FrequencyResolver implements DSNPResolver {
  private providerUri: string | null = null;
  private _singletonApi: Promise<ApiPromise> | null = null;
  private keyAgreementSchemaId: number | null = null;
  private assertionMethodSchemaId: number | null = null;
  private initialized: boolean = false;

  constructor(options: {
    providerUri?: string;
    apiPromise?: Promise<ApiPromise>;
  }) {
    if (options.providerUri) {
      this.providerUri = options.providerUri;
    } else if (options.apiPromise != null) {
      this._singletonApi = options.apiPromise;
    } else {
      throw new Error("providerUri or apiPromise is required");
    }
  }

  async getApi(): Promise<ApiPromise> {
    if (this._singletonApi == null) {
      this._singletonApi = ApiPromise.create({
        provider: new WsProvider(this.providerUri as string),
        throwOnConnect: true,
        ...options,
      });
    }
    return this._singletonApi;
  }

  async disconnect() {
    if (this._singletonApi === null) return;
    const api = await this.getApi();
    await api.disconnect();
    this._singletonApi = null;
  }

  private async getPublicKeysForSchema(
    dsnpUserId: bigint,
    schemaId: number,
  ): Promise<string[]> {
    const { items } = await (
      await this.getApi()
    ).rpc.statefulStorage.getItemizedStorage(dsnpUserId, schemaId);

    return items.map((item: { payload: Uint8Array }) => {
      const payloadAvro = item.payload;
      const onChainPublicKey = publicKeyAvroSchema.fromBuffer(
        Buffer.from(payloadAvro),
      ).publicKey;
      // Work around keys stored without multicodec
      const publicKeyMulticodec =
        onChainPublicKey.length === 32
          ? new Uint8Array([0xec, 0x01, ...onChainPublicKey])
          : onChainPublicKey;

      return base58btc.encode(publicKeyMulticodec);
    });
  }

  private async initialize() {
    const api = await this.getApi();

    // Get the appropriate schemaIds for the chain we're connecting to
    try {
      this.keyAgreementSchemaId = await dsnp.getSchemaId(
        "public-key-key-agreement",
        "1.2",
        api.genesisHash.toString(),
      );
    } catch (_error) {
      this.keyAgreementSchemaId = null;
    }

    try {
      this.assertionMethodSchemaId = await dsnp.getSchemaId(
        "public-key-assertion-method",
        "1.3",
        api.genesisHash.toString(),
      );
    } catch (_error) {
      this.assertionMethodSchemaId = null;
    }
    this.initialized = true;
  }

  async resolve(dsnpUserId: bigint): Promise<object | null> {
    if (!this.initialized) {
      this.initialize();
    }

    const api = await this.getApi();

    // Determine if MSA exists by checking public key count
    const msaUint8a = bnToU8a(dsnpUserId, { bitLength: 64 });
    const keyCountKey =
      keyCountStorageKeyHex +
      xxhashAsHex(msaUint8a).substring(2) +
      u8aToHex(msaUint8a).substring(2);
    const keyCountResult = await api.rpc.state.getStorage(keyCountKey);
    if (Number(keyCountResult) == 0) {
      return null;
    }

    const controller = `did:dsnp:${dsnpUserId}`;
    const authentication: VerificationMethod[] = [];

    // msa.getKeysByMsaId: Option<KeyInfoResponse>
    const keysResult = await api.rpc.msa.getKeysByMsaId(msaUint8a);
    for (const msa_key of keysResult.unwrap().msa_keys) {
      authentication.push(
        makeVerificationMethod(
          controller,
          base58btc.encode(new Uint8Array([0xef, 0x01, ...msa_key.toU8a()])),
        ),
      );
    }

    // Get handle if exists
    const handleKey =
      displayNameStorageKeyHex +
      xxhashAsHex(msaUint8a).substring(2) +
      u8aToHex(msaUint8a).substring(2);

    const handleResult = await api.rpc.state.getStorage(handleKey);

    let handle;
    // bytes are: scale-encoded length + handle.xx + u32 blocknum
    if (handleResult) {
      const hexStr = handleResult.toString();
      handle = hexToString("0x" + hexStr.substring(4, hexStr.length - 8));
    }
    const alsoKnownAs = handle ? ["did:frqcy:handle:" + handle] : [];

    let assertionMethod: VerificationMethod[] = [];
    if (this.assertionMethodSchemaId) {
      const assertionMethodKeys = await this.getPublicKeysForSchema(
        dsnpUserId,
        this.assertionMethodSchemaId,
      );
      assertionMethod = assertionMethodKeys.map(
        (publicKeyMultibase: string) => {
          return makeVerificationMethod(controller, publicKeyMultibase);
        },
      );
    }

    let keyAgreement: VerificationMethod[] = [];
    if (this.keyAgreementSchemaId) {
      const keyAgreementKeys = await this.getPublicKeysForSchema(
        dsnpUserId,
        this.keyAgreementSchemaId,
      );
      keyAgreement = keyAgreementKeys.map((publicKeyMultibase) => {
        return makeVerificationMethod(controller, publicKeyMultibase);
      });
    }

    // Return the DID document object
    return {
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: `did:dsnp:${dsnpUserId}`,
      authentication,
      assertionMethod,
      keyAgreement,
      alsoKnownAs,
    };
  }
}
