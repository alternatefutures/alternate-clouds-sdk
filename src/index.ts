export { AlternateFuturesSdk } from './AlternateFuturesSdk';
export { PersonalAccessTokenService } from './libs/AccessTokenService/PersonalAccessTokenService';
export { StaticAccessTokenService } from './libs/AccessTokenService/StaticAccessTokenService';
export { ApplicationAccessTokenService } from './libs/AccessTokenService/ApplicationAccessTokenService';
// TODO: decide what to do with createClient exposure shall it be open to users?
export { createClient } from '@alternatefutures/utils-genql-client';

export type { Application } from './clients/applications';
export type { Project } from './clients/projects';
export type { IpfsFile } from './clients/ipfs';
export type { IpnsRecord } from './clients/ipns';
export type { Site, Deployment } from './clients/sites';
export type { StoragePin } from './clients/storage';
export type { EnsRecord } from './clients/ens';
export type { PrivateGateway } from './clients/privateGateway';
export type { Domain, Zone } from './clients/domains';
export type { AFFunction } from './clients/functions';
export type {
  ApplicationWhiteLabelDomain,
  ApplicationWhitelistDomain,
  Client,
  DomainStatus,
  AFFunctionStatus,
} from '@alternatefutures/utils-genql-client';
export type {
  UploadPinResponse,
  UploadProgress,
  UploadContentOptions,
} from './clients/uploadProxy';
export { BillingClient } from './clients/billing';

// Billing types
export type {
  Customer,
  PaymentMethod,
  Subscription,
  Invoice,
  InvoiceLineItem,
  Payment,
  UsageRecord,
  CurrentUsage,
  UsageMetric,
} from './clients/billing';

// Private archives: key-bearing helpers are trusted-backend/operator-only.
export * from './clients/archives';
