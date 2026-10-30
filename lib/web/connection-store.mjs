import { writeName } from '../names.mjs';
import {
  exact,
  hash,
  numeric,
  requestJson,
  seal,
  unseal,
  WebError,
} from "./common.mjs";
import { hex } from "./connection-policy.mjs";
import { validateFundingBinding, fundingMetadata, fundingDigest, fundingEnabled, personalDescriptor } from './funding.mjs';

// Metadata stays ciphertext-free; model execution has a separately gated service-only read.
export function createConnectionStore(config, fetcher = fetch, { now = Date.now } = {}) {
  const scope = hash(
    JSON.stringify([
      "connection-vault-v1",
      config.appId,
      config.installationId,
      config.workspace.id,
      config.workspace.repoId,
    ]),
  );
  const identity = (descriptor) =>
    hash(JSON.stringify([descriptor.id, descriptor.secretRef]));
  async function rpc(operation, descriptor, options = {}) {
    const value = await requestJson(
      fetcher,
      `${config.storageUrl}/rest/v1/rpc/${writeName('database:keel_connection_rpc')}`,
      {
        method: "POST",
        headers: {
          apikey: config.storageKey,
          Authorization: `Bearer ${config.storageKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_operation: operation,
          p_scope: scope,
          p_connection: identity(descriptor),
          p_expected: null,
          p_policy: null,
          p_request: null,
          p_actor: null,
          p_value: null,
          p_health: null,
          ...options,
        }),
      },
      70000,
    );
    // Absence is a valid metadata observation; conflict is only a mutation result.
    // A malformed metadata response must never manufacture generation zero.
    if (operation === "metadata" && value === null) return null;
    if (
      operation !== "metadata" &&
      exact(value, ["conflict"]) &&
      value.conflict === true
    )
      return value;
    if (
      !exact(value, [
        "version",
        "state",
        "policy",
        "request",
        "actor",
        "updatedAt",
        "health",
      ]) ||
      !Number.isInteger(value.version) ||
      value.version < 1 ||
      value.version > 2147483647 ||
      !["present", "removed"].includes(value.state) ||
      !hex(value.policy) ||
      !hex(value.request) ||
      !numeric(value.actor) ||
      typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt)) ||
      (value.state === "removed" && value.health !== null)
    )
      throw new WebError("invalid_connection_store");
    return value;
  }
  async function fundingRpc(operation, descriptor, actor, options = {}) {
    if (!fundingEnabled(config,now()) || !numeric(actor)) throw new WebError('personal_funding_disabled',403);
    const owned = personalDescriptor(descriptor,actor), connection = identity(owned);
    const result = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/${writeName('database:keel_connection_rpc')}`, {
      method:'POST', headers:{apikey:config.storageKey,Authorization:`Bearer ${config.storageKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_operation:operation,p_scope:scope,p_connection:connection,p_expected:null,p_policy:null,p_request:null,p_actor:actor,p_value:null,p_health:null,...options}),
    },150000);
    if(result===null)return null;
    if(exact(result,['conflict'])&&result.conflict===true)throw new WebError('funding_conflict',409);
    if(['personal-key','personal-recovery-key'].includes(operation)) {
      if(!exact(result,['version','policy','value'])||result.version!==options.p_expected||result.policy!==options.p_policy)throw new WebError('invalid_connection_store');
      const data=unseal(result.value,config.connectionEncryptionKey,JSON.stringify(['connection-vault-v1',scope,connection,result.policy,result.version]));
      if(!exact(data,['key'])||typeof data.key!=='string'||!/^[\x21-\x7e]{16,4096}$/.test(data.key))throw new WebError('invalid_connection_store');
      return data.key;
    }
    if(!exact(result,['version','state','policy','request','fundingMetadata','binding'])||!numeric(result.version)||!hex(result.policy)||!hex(result.request)||result.fundingMetadata?.owner!==actor||typeof result.binding!=='string')throw new WebError('invalid_funding_store');
    const binding=validateFundingBinding(unseal(result.binding,config.encryptionKey,JSON.stringify(['personal-funding-v1',scope,connection,actor,result.fundingMetadata.grantVersion,result.fundingMetadata.digest])));
    if(fundingDigest(fundingMetadata(binding))!==fundingDigest(result.fundingMetadata)||binding.connectionGeneration!==result.version||binding.connectionPolicyDigest!==result.policy)throw new WebError('invalid_funding_store');
    return {version:result.version,state:result.state,policy:result.policy,request:result.request,binding,descriptor:owned};
  }
  async function fundingWrite(operation,descriptor,{actor,binding,requestId,key,health=null,expectedVersion=0}) {
    const b=validateFundingBinding(binding),owned=personalDescriptor(descriptor,actor),connection=identity(owned),metadata=fundingMetadata(b);
    if(b.ownerActorId!==actor||!hex(requestId))throw new WebError('funding_owner',403);
    const encrypted=seal(b,config.encryptionKey,JSON.stringify(['personal-funding-v1',scope,connection,actor,b.grant.version,fundingDigest(b)]));
    if(operation==='personal-put'&&(typeof key!=='string'||!/^[\x21-\x7e]{16,4096}$/.test(key)))throw new WebError('invalid_credential',400);
    const value=operation==='personal-put'?seal({key},config.connectionEncryptionKey,JSON.stringify(['connection-vault-v1',scope,connection,b.connectionPolicyDigest,b.connectionGeneration])):encrypted;
    return fundingRpc(operation,descriptor,actor,{p_expected:expectedVersion,p_policy:b.connectionPolicyDigest,p_request:requestId,p_value:value,p_health:{metadata,binding:encrypted,...(operation==='personal-put'?{health}:{})}});
  }
  return {
    readFunding:(descriptor,actor)=>fundingRpc('funding-read',descriptor,actor),
    personalPut:(descriptor,options)=>fundingWrite('personal-put',descriptor,options),
    updateFunding:(descriptor,options)=>fundingWrite('funding-update',descriptor,options),
    readPersonalRecoveryKey:(descriptor,{actor,policyDigest,expectedVersion,attemptId,attemptScope})=>fundingRpc('personal-recovery-key',descriptor,actor,{p_policy:policyDigest,p_expected:expectedVersion,p_health:{attemptId,attemptScope}}),
    readPersonalKey:(descriptor,{actor,policyDigest,expectedVersion,funding})=>fundingRpc('personal-key',descriptor,actor,{p_policy:policyDigest,p_expected:expectedVersion,p_health:funding}),
    metadata: (descriptor) => rpc("metadata", descriptor),
    // Only the fresh-authorized model service may call this, never browser or worker input.
    async readKey(descriptor, { policyDigest, expectedVersion }) {
      if (!hex(descriptor?.secretRef) || typeof descriptor?.id !== "string"
        || !/^[a-z][a-z0-9-]{0,63}$/.test(descriptor.id) || !hex(policyDigest)
        || !Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2147483647
        || !Buffer.isBuffer(config.connectionEncryptionKey) || config.connectionEncryptionKey.length !== 32)
        throw new WebError("invalid_connection_read", 400);
      const value = await requestJson(fetcher, `${config.storageUrl}/rest/v1/rpc/${writeName('database:keel_model_credential_read')}`, {
        method: "POST",
        headers: { apikey: config.storageKey, Authorization: `Bearer ${config.storageKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_scope: scope, p_connection: identity(descriptor), p_policy: policyDigest, p_expected: expectedVersion }),
      }, 20000);
      if (exact(value, ["conflict"]) && value.conflict === true) throw new WebError("connection_generation_changed", 409);
      if (!exact(value, ["version", "policy", "value"]) || value.version !== expectedVersion || value.policy !== policyDigest
        || typeof value.value !== "string" || value.value.length > 16384) throw new WebError("invalid_connection_store");
      let decrypted;
      try {
        decrypted = unseal(value.value, config.connectionEncryptionKey,
          JSON.stringify(["connection-vault-v1", scope, identity(descriptor), policyDigest, expectedVersion]));
      } catch { throw new WebError("invalid_connection_store"); }
      if (!exact(decrypted, ["key"]) || typeof decrypted.key !== "string" || !/^[\x21-\x7e]{16,4096}$/.test(decrypted.key))
        throw new WebError("invalid_connection_store");
      return decrypted.key;
    },
    put(
      descriptor,
      { expectedVersion, policyDigest, requestId, actor, key, health },
    ) {
      const purpose = JSON.stringify([
        "connection-vault-v1",
        scope,
        identity(descriptor),
        policyDigest,
        expectedVersion + 1,
      ]);
      const ciphertext = seal({ key }, config.connectionEncryptionKey, purpose);
      return rpc("put", descriptor, {
        p_expected: expectedVersion,
        p_policy: policyDigest,
        p_request: requestId,
        p_actor: actor,
        p_value: ciphertext,
        p_health: health,
      });
    },
    remove: (descriptor, { expectedVersion, policyDigest, requestId, actor }) =>
      rpc("remove", descriptor, {
        p_expected: expectedVersion,
        p_policy: policyDigest,
        p_request: requestId,
        p_actor: actor,
      }),
  };
}
