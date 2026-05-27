// @ts-nocheck
import {
  DomainNotFoundError,
  DomainsNotFoundError,
} from '@alternatefutures/errors';
import {
  Client,
  Domain as DomainWithRelations,
  DomainGenqlSelection,
  Zone as ZoneWithRelations,
  ZoneGenqlSelection,
} from '@alternatefutures/utils-genql-client';

import {
  isDomainResponseQuery,
  isDomainsResponseQuery,
} from '../utils/graphql';

type DomainsClientOptions = {
  graphqlClient: Client;
};

export type Domain = Pick<
  DomainWithRelations,
  | 'id'
  | 'zone'
  | 'hostname'
  | 'isVerified'
  | 'updatedAt'
  | 'createdAt'
  | 'dnsConfigs'
  | 'status'
> & {
  // New fields for custom domains with SSL
  verified?: boolean;
  domainType?: 'WEB2' | 'ARNS' | 'ENS' | 'IPNS';
  txtVerificationToken?: string;
  txtVerificationStatus?: 'PENDING' | 'VERIFIED' | 'FAILED';
  dnsVerifiedAt?: string;
  sslStatus?: 'NONE' | 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'FAILED';
  sslIssuedAt?: string;
  sslExpiresAt?: string;
  sslAutoRenew?: boolean;
  arnsName?: string;
  ensName?: string;
  ipnsHash?: string;
  lastDnsCheck?: string;
  dnsCheckAttempts?: number;
  expectedCname?: string;
  expectedARecord?: string;
};

export type Zone = Pick<
  ZoneWithRelations,
  'id' | 'originUrl' | 'createdAt' | 'updatedAt' | 'type' | 'status'
>;

export class DomainsClient {
  private graphqlClient: Client;

  private static DOMAIN_MAPPED_PROPERTIES: DomainGenqlSelection = {
    id: true,
    zone: { id: true, __typename: true },
    hostname: true,
    isVerified: true,
    updatedAt: true,
    createdAt: true,
    dnsConfigs: {
      id: true,
      type: true,
      name: true,
      value: true,
      createdAt: true,
      updatedAt: true,
      __typename: true,
    },
    status: true,
    __typename: true,
  };

  // Extended properties for custom domains with SSL
  private static CUSTOM_DOMAIN_PROPERTIES: DomainGenqlSelection = {
    ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
    verified: true,
    domainType: true,
    txtVerificationToken: true,
    txtVerificationStatus: true,
    dnsVerifiedAt: true,
    sslStatus: true,
    sslIssuedAt: true,
    sslExpiresAt: true,
    sslAutoRenew: true,
    arnsName: true,
    ensName: true,
    ipnsHash: true,
    lastDnsCheck: true,
    dnsCheckAttempts: true,
  };

  private static ZONE_MAPPED_PROPERTIES: ZoneGenqlSelection = {
    id: true,
    originUrl: true,
    createdAt: true,
    updatedAt: true,
    type: true,
    status: true,
    __typename: true,
  };

  constructor(options: DomainsClientOptions) {
    this.graphqlClient = options.graphqlClient;
  }

  // TODO: Check which is the right type
  // Promise<DomainsWithAggregation["data"]> fails for some reason
  public list = async () => {
    const response = await this.graphqlClient.query({
      __name: 'GetDomains',
      domains: {
        data: {
          ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
        },
        __typename: true,
      },
    });

    // TODO: The genql provides `isDomain`
    // But found that for the concurrent `isDomainWithAggregation`
    // used in other parts of the source, would not be
    // correctly computed. Thus, provide a costum utility method
    // to safe-guard. Although, when type/fields change these
    // have to be computed manually. So, would be best to
    // investigate what caused the change.
    if (!isDomainsResponseQuery(response.domains?.data)) {
      throw new DomainsNotFoundError();
    }

    return response.domains.data;
  };

  public get = async ({ domainId }: { domainId: string }) => {
    const response = await this.graphqlClient.query({
      __name: 'GetDomainById',
      domain: {
        __args: {
          where: {
            id: domainId,
          },
        },
        ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
      },
    });

    if (!isDomainResponseQuery(response.domain)) {
      throw new DomainNotFoundError({ domain: { id: domainId } });
    }

    return response.domain;
  };

  public getByHostname = async ({
    hostname,
  }: { hostname: string }): Promise<DomainWithRelations> => {
    const response = await this.graphqlClient.query({
      __name: 'GetDomainByHostname',
      domainByHostname: {
        __args: {
          where: {
            hostname,
          },
        },
        ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
      },
    });

    if (!isDomainResponseQuery(response.domainByHostname)) {
      throw new DomainNotFoundError({ domain: { hostname } });
    }

    return response.domainByHostname;
  };

  public listByZoneId = async ({ zoneId }: { zoneId: string }) => {
    const response = await this.graphqlClient.query({
      __name: 'GetDomainsByZoneId',
      domainsByZoneId: {
        __args: {
          where: {
            zoneId,
          },
        },
        data: {
          ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
        },
        __typename: true,
      },
    });

    if (!isDomainsResponseQuery(response.domainsByZoneId?.data)) {
      throw new DomainsNotFoundError();
    }

    return response.domainsByZoneId.data;
  };

  /**
   * @deprecated Use createCustomDomain instead for new domain creation with SSL support
   */
  public createDomain = async ({
    zoneId,
    hostname,
  }: { zoneId: string; hostname: string }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'CreateDomainLegacy',
      createDomainLegacy: {
        __args: {
          where: {
            zoneId,
          },
          data: {
            hostname,
          },
        },
        // TODO: The `DOMAIN_MAPPED_PROPERTIES` when used here
        // seem to break the query. Thus, using `__scalar` true.
        // Ideally, check what cause need for this change.
        __scalar: true,
      },
    });

    return response.createDomainLegacy;
  };

  public deleteDomain = async ({ domainId }: { domainId: string }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'DeleteDomain',
      deleteDomain: {
        __args: {
          id: domainId,
        },
        ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
      },
    });

    return response.deleteDomain;
  };

  public verifyDomain = async ({ domainId }: { domainId: string }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'VerifyDomain',
      verifyDomain: {
        __args: {
          domainId,
        },
        ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
      },
    });

    return response.verifyDomain;
  };

  public listZones = async (): Promise<Zone[]> => {
    const response = await this.graphqlClient.query({
      __name: 'ListZones',
      zones: { data: DomainsClient.ZONE_MAPPED_PROPERTIES },
    });

    return response.zones.data;
  };

  public getZone = async ({ id }: { id: string }): Promise<Zone> => {
    const response = await this.graphqlClient.query({
      __name: 'GetZone',
      zone: {
        __args: {
          where: {
            id,
          },
        },
        ...DomainsClient.ZONE_MAPPED_PROPERTIES,
      },
    });

    return response.zone;
  };

  public createZoneForSite = async ({
    siteId,
  }: { siteId: string }): Promise<Zone> => {
    const response = await this.graphqlClient.mutation({
      __name: 'CreateZoneForSite',
      createZoneForSite: {
        __args: {
          where: {
            siteId,
          },
        },
        // TODO: Investigate why the previous fields
        // would now throw> Error: type `Zone` does not have a field `zone`
        // ...DomainsClient.DOMAIN_MAPPED_PROPERTIES,
        __scalar: true,
      },
    });

    return response.createZoneForSite;
  };

  public createZoneForPrivateGateway = async (): Promise<Zone> => {
    const response = await this.graphqlClient.mutation({
      __name: 'CreateZoneForPrivateGateway',
      createZoneForPrivateGateway: DomainsClient.ZONE_MAPPED_PROPERTIES,
    });

    return response.createZoneForPrivateGateway;
  };

  public deleteZone = async ({ id }: { id: string }): Promise<Zone> => {
    const response = await this.graphqlClient.mutation({
      __name: 'DeleteZone',
      deleteZone: {
        __args: {
          where: {
            id,
          },
        },
        ...DomainsClient.ZONE_MAPPED_PROPERTIES,
      },
    });

    return response.deleteZone;
  };

  // ============================================
  // New Custom Domains Methods with SSL Support
  // ============================================

  /**
   * Creates a custom domain for a site with DNS verification.
   *
   * Supports multiple domain types including traditional Web2 domains and Web3 domains
   * (ARNS, ENS, IPNS). Choose your preferred DNS verification method.
   *
   * @param options - Domain creation options
   * @param options.siteId - The ID of the site to attach the domain to
   * @param options.hostname - The domain hostname (e.g., 'example.com', 'mysite.eth')
   * @param options.verificationMethod - DNS verification method: 'TXT' (default), 'CNAME', or 'A'
   * @param options.domainType - Domain type: 'WEB2' (default), 'ARNS', 'ENS', or 'IPNS'
   *
   * @returns Promise<Domain> Domain object with verification instructions
   *
   * @example
   * ```typescript
   * // Create a standard web domain with TXT verification
   * const domain = await sdk.domains().createCustomDomain({
   *   siteId: 'site-123',
   *   hostname: 'example.com',
   *   verificationMethod: 'TXT',
   *   domainType: 'WEB2'
   * });
   * console.log(domain.txtVerificationToken); // 'af-verify-abc123'
   * ```
   *
   * @example
   * ```typescript
   * // Create an ENS domain
   * const ensDomain = await sdk.domains().createCustomDomain({
   *   siteId: 'site-123',
   *   hostname: 'mysite.eth',
   *   domainType: 'ENS'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Create domain with CNAME verification
   * const domain = await sdk.domains().createCustomDomain({
   *   siteId: 'site-123',
   *   hostname: 'www.example.com',
   *   verificationMethod: 'CNAME'
   * });
   * ```
   */
  public createCustomDomain = async ({
    siteId,
    hostname,
    verificationMethod = 'TXT',
    domainType = 'WEB2',
  }: {
    siteId: string;
    hostname: string;
    verificationMethod?: 'TXT' | 'CNAME' | 'A';
    domainType?: 'WEB2' | 'ARNS' | 'ENS' | 'IPNS';
  }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'CreateCustomDomain',
      createDomain: {
        __args: {
          input: {
            siteId,
            hostname,
            verificationMethod,
            domainType,
          },
        },
        __scalar: true,
      },
    });

    return response.createDomain;
  };

  /**
   * Verifies domain ownership via DNS record check.
   *
   * This checks if the required DNS records (TXT, CNAME, or A) have been properly
   * configured and are propagating correctly. DNS propagation can take up to 48 hours.
   *
   * @param options - Verification options
   * @param options.domainId - The ID of the domain to verify
   *
   * @returns Promise<boolean> True if verification successful, false otherwise
   *
   * @example
   * ```typescript
   * // Verify domain after adding DNS records
   * const domain = await sdk.domains().createCustomDomain({
   *   siteId: 'site-123',
   *   hostname: 'example.com'
   * });
   *
   * // Add DNS record as instructed, then verify
   * const isVerified = await sdk.domains().verifyCustomDomain({
   *   domainId: domain.id
   * });
   *
   * if (isVerified) {
   *   console.log('Domain verified successfully!');
   * }
   * ```
   */
  public verifyCustomDomain = async ({ domainId }: { domainId: string }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'VerifyCustomDomain',
      verifyDomain: {
        __args: {
          domainId,
        },
        __scalar: true,
      },
    });

    return response.verifyDomain;
  };

  /**
   * Provisions an SSL certificate for a verified domain.
   *
   * Automatically provisions and configures an SSL certificate for your custom domain.
   * The certificate is issued via Let's Encrypt and includes automatic renewal.
   * Domain must be verified before SSL can be provisioned.
   *
   * @param options - SSL provisioning options
   * @param options.domainId - The ID of the verified domain
   * @param options.email - Contact email for SSL expiration notifications and renewal alerts
   *
   * @returns Promise<Domain> Updated domain object with SSL status
   *
   * @example
   * ```typescript
   * // Provision SSL after domain verification
   * const domainWithSsl = await sdk.domains().provisionSsl({
   *   domainId: 'domain-123',
   *   email: 'admin@example.com'
   * });
   *
   * console.log(domainWithSsl.sslStatus); // 'PENDING' or 'ACTIVE'
   * console.log(domainWithSsl.sslAutoRenew); // true
   * ```
   */
  public provisionSsl = async ({
    domainId,
    email,
  }: {
    domainId: string;
    email: string;
  }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'ProvisionSsl',
      provisionSsl: {
        __args: {
          domainId,
          email,
        },
        __scalar: true,
      },
    });

    return response.provisionSsl;
  };

  /**
   * Sets a domain as the primary domain for a site.
   *
   * The primary domain is the main domain used to access your site.
   * Only one domain can be set as primary per site.
   *
   * @param options - Primary domain options
   * @param options.siteId - The ID of the site
   * @param options.domainId - The ID of the domain to set as primary
   *
   * @returns Promise<boolean> True if successful
   *
   * @example
   * ```typescript
   * // Set primary domain for a site
   * await sdk.domains().setPrimaryDomain({
   *   siteId: 'site-123',
   *   domainId: 'domain-456'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Switch primary domain
   * const domains = await sdk.domains().listDomainsForSite({ siteId: 'site-123' });
   * const newPrimary = domains.find(d => d.hostname === 'www.example.com');
   *
   * await sdk.domains().setPrimaryDomain({
   *   siteId: 'site-123',
   *   domainId: newPrimary.id
   * });
   * ```
   */
  public setPrimaryDomain = async ({
    siteId,
    domainId,
  }: {
    siteId: string;
    domainId: string;
  }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'SetPrimaryDomain',
      setPrimaryDomain: {
        __args: {
          siteId,
          domainId,
        },
        __scalar: true,
      },
    });

    return response.setPrimaryDomain;
  };

  /**
   * Removes a custom domain from a site.
   *
   * Permanently deletes a custom domain. This action cannot be undone.
   * The domain can be re-added later if needed.
   *
   * @param options - Deletion options
   * @param options.domainId - The ID of the domain to remove
   *
   * @returns Promise<boolean> True if deletion successful
   *
   * @example
   * ```typescript
   * // Remove a domain
   * await sdk.domains().removeCustomDomain({
   *   domainId: 'domain-123'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Remove all unverified domains
   * const domains = await sdk.domains().listDomainsForSite({ siteId: 'site-123' });
   * const unverified = domains.filter(d => !d.verified);
   *
   * for (const domain of unverified) {
   *   await sdk.domains().removeCustomDomain({ domainId: domain.id });
   * }
   * ```
   */
  public removeCustomDomain = async ({ domainId }: { domainId: string }) => {
    const response = await this.graphqlClient.mutation({
      __name: 'DeleteDomain',
      deleteDomain: {
        __args: {
          id: domainId,
        },
        __scalar: true,
      },
    });

    return response.deleteDomain;
  };

  /**
   * Retrieves DNS verification instructions for a domain.
   *
   * Returns detailed instructions on which DNS records to add for domain verification.
   * Instructions include record type (TXT, CNAME, or A), hostname, and value.
   *
   * @param options - Instruction retrieval options
   * @param options.domainId - The ID of the domain
   *
   * @returns Promise<VerificationInstructions> Object containing DNS record instructions
   *
   * @example
   * ```typescript
   * // Get verification instructions
   * const domain = await sdk.domains().createCustomDomain({
   *   siteId: 'site-123',
   *   hostname: 'example.com'
   * });
   *
   * const instructions = await sdk.domains().getVerificationInstructions({
   *   domainId: domain.id
   * });
   *
   * console.log(instructions.instructions);
   * // Output: "Add a TXT record to your DNS..."
   * console.log(instructions.recordType); // "TXT"
   * console.log(instructions.value); // "af-verify-abc123"
   * ```
   */
  public getVerificationInstructions = async ({
    domainId,
  }: {
    domainId: string;
  }) => {
    const response = await this.graphqlClient.query({
      __name: 'GetVerificationInstructions',
      domainVerificationInstructions: {
        __args: {
          domainId,
        },
        __scalar: true,
      },
    });

    return response.domainVerificationInstructions;
  };

  /**
   * Lists all custom domains associated with a site.
   *
   * Returns all domains (verified and unverified) configured for the specified site.
   * Includes domain status, SSL information, and verification details.
   *
   * @param options - List options
   * @param options.siteId - The ID of the site
   *
   * @returns Promise<Domain[]> Array of domain objects
   *
   * @example
   * ```typescript
   * // List all domains for a site
   * const domains = await sdk.domains().listDomainsForSite({
   *   siteId: 'site-123'
   * });
   *
   * domains.forEach(domain => {
   *   console.log(`${domain.hostname}: ${domain.verified ? 'Verified' : 'Pending'}`);
   *   console.log(`SSL: ${domain.sslStatus}`);
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Filter domains by status
   * const domains = await sdk.domains().listDomainsForSite({ siteId: 'site-123' });
   *
   * const verified = domains.filter(d => d.verified);
   * const withSsl = domains.filter(d => d.sslStatus === 'ACTIVE');
   * const web3 = domains.filter(d => ['ENS', 'ARNS', 'IPNS'].includes(d.domainType));
   *
   * console.log(`Verified: ${verified.length}, SSL Active: ${withSsl.length}, Web3: ${web3.length}`);
   * ```
   */
  public listDomainsForSite = async ({ siteId }: { siteId: string }) => {
    const response = await this.graphqlClient.query({
      __name: 'ListDomainsForSite',
      site: {
        __args: {
          where: {
            id: siteId,
          },
        },
        domains: {
          __scalar: true,
        },
      },
    });

    return response.site?.domains || [];
  };
}
