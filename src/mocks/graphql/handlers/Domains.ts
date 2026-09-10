import { graphql as executeGraphql, buildSchema } from 'graphql';
import { HttpResponse } from 'msw';

import { localhost } from '@mocks/graphql/config';
import { schemaStr } from '@mocks/graphql/schema';

const schema = buildSchema(schemaStr);

// Default custom domain fields for existing domains (set to null for backward compatibility)
const defaultCustomDomainFields = {
  verified: null,
  domainType: null,
  txtVerificationToken: null,
  txtVerificationStatus: null,
  dnsVerifiedAt: null,
  sslStatus: null,
  sslIssuedAt: null,
  sslExpiresAt: null,
  sslAutoRenew: null,
  arnsName: null,
  ensName: null,
  ipnsHash: null,
  lastDnsCheck: null,
  dnsCheckAttempts: null,
};

const queries = [
  localhost.query('GetDomains', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        domains: {
          data: [
            {
              __typename: 'Domain',
              createdAt: '2023-03-24T09:05:13.641Z',
              dnsConfigs: [
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-03-23T09:05:13.641Z',
                  id: 'clgmg76ch000208mid5o30du0',
                  name: 'hostname',
                  type: 'CNAME',
                  updatedAt: '2023-03-23T09:05:13.641Z',
                  value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
                },
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-03-23T10:05:13.641Z',
                  id: 'clgmgbj4h000308mi8aai0pli',
                  name: 'hostname',
                  type: 'CNAME',
                  updatedAt: '2023-03-23T10:05:13.641Z',
                  value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
                },
              ],
              hostname: 'electronic.co',
              id: 'clgmfj1pa000108lc0g5i7d32',
              isVerified: true,
              status: 'ACTIVE',
              updatedAt: '2023-03-24T09:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'clgmfj874000208lc2e9ccglf',
              },
            },
            {
              __typename: 'Domain',
              createdAt: '2023-03-24T10:05:13.641Z',
              dnsConfigs: [],
              hostname: 'eshop-electronic.co',
              id: 'clgmfj874000208lc2e9ccglf',
              isVerified: false,
              status: 'VERIFYING_FAILED',
              updatedAt: '2023-03-24T10:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'clgmfj874000208lc2e9ccglf',
              },
            },
            {
              __typename: 'Domain',
              createdAt: '2023-03-28T10:05:13.641Z',
              dnsConfigs: [
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-02-28T10:04:33.641Z',
                  id: 'cln2226gc000208la1egftrd4',
                  name: '_dnslink',
                  type: 'CNAME',
                  updatedAt: '2023-02-28T10:04:33.641Z',
                  value: 'blue-green-yellow.dev.on-af-test.app',
                },
              ],
              hostname: 'blog-electornic.co',
              id: 'clgnslqvg000108l6hg5ea3u0',
              isVerified: false,
              status: 'CREATING',
              updatedAt: '2023-03-28T10:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'clgow7wob000508jog5gfanj9',
              },
            },
            {
              __typename: 'Domain',
              createdAt: '2023-03-28T10:05:13.641Z',
              dnsConfigs: [
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-02-28T10:04:33.641Z',
                  id: 'ckmhgsu0x011008mney5h0bu',
                  name: '_dnslink',
                  type: 'CNAME',
                  updatedAt: '2023-02-28T10:04:33.641Z',
                  value: '_dnslink.white-black-silver.dev.on-af-test.app',
                },
              ],
              hostname: 'dnslink-electornic.co',
              id: 'clgnslqvg000108l6hg5ea3u1',
              isVerified: true,
              status: 'ACTIVE',
              updatedAt: '2023-03-28T10:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'clgow7wob000508jog5gfanj9',
              },
            },
            {
              __typename: 'Domain',
              createdAt: '2023-03-24T10:05:13.641Z',
              dnsConfigs: [
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-02-28T10:04:33.641Z',
                  id: 'ckmhgsu0x011008mney3h03bu',
                  name: '_dnslink',
                  type: 'CNAME',
                  updatedAt: '2023-02-28T10:04:33.641Z',
                  value: 'one-knife-yellow.dev.on-af-test.app',
                },
              ],
              hostname: 'static.eshop-electronic.co',
              id: 'clmhwwted000108mnajduel68',
              isVerified: true,
              status: 'ACTIVE',
              updatedAt: '2023-03-24T10:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'cljfq6n2y000008lb4oy403bc',
              },
            },
            {
              __typename: 'Domain',
              createdAt: '2023-02-28T10:05:13.641Z',
              dnsConfigs: [
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-02-28T10:04:33.641Z',
                  id: 'cln2226gc000208la1egogfn3',
                  name: 'hostname',
                  type: 'CNAME',
                  updatedAt: '2023-02-28T10:04:33.641Z',
                  value: 'cljfqzrcg000208jy6677aqv1.afcdn.xyz',
                },
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-02-28T10:04:33.641Z',
                  id: 'cln2226gc000208laurhtg4d5',
                  name: '_dnslink',
                  type: 'CNAME',
                  updatedAt: '2023-02-28T10:04:33.641Z',
                  value: 'blue-green-yellow.dev.on-af-test.app',
                },
              ],
              hostname: 'documents-electronic.co',
              id: 'cln21wwwa000008la7e0kbvd7',
              isVerified: false,
              status: 'CREATED',
              updatedAt: '2023-02-28T10:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'cljfqzrcg000208jy6677aqv1',
              },
            },
          ],
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.query('GetDomainById', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        domain: {
          __typename: 'Domain',
          createdAt: '2023-03-24T09:05:13.641Z',
          dnsConfigs: [
            {
              __typename: 'DnsConfig',
              createdAt: '2023-03-23T09:05:13.641Z',
              id: 'clgmg76ch000208mid5o30du0',
              name: 'hostname',
              type: 'CNAME',
              updatedAt: '2023-03-23T09:05:13.641Z',
              value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
            },
            {
              __typename: 'DnsConfig',
              createdAt: '2023-03-23T10:05:13.641Z',
              id: 'clgmgbj4h000308mi8aai0pli',
              name: 'hostname',
              type: 'CNAME',
              updatedAt: '2023-03-23T10:05:13.641Z',
              value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
            },
          ],
          hostname: 'electronic.co',
          id: 'clgmfj1pa000108lc0g5i7d32',
          isVerified: true,
          status: 'ACTIVE',
          updatedAt: '2023-03-24T09:05:13.641Z',
          zone: {
            __typename: 'Zone',
            id: 'clgmfj874000208lc2e9ccglf',
          },
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.query('GetDomainByHostname', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        domainByHostname: {
          __typename: 'Domain',
          createdAt: '2023-03-24T09:05:13.641Z',
          dnsConfigs: [
            {
              __typename: 'DnsConfig',
              createdAt: '2023-03-23T09:05:13.641Z',
              id: 'clgmg76ch000208mid5o30du0',
              name: 'hostname',
              type: 'CNAME',
              updatedAt: '2023-03-23T09:05:13.641Z',
              value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
            },
            {
              __typename: 'DnsConfig',
              createdAt: '2023-03-23T10:05:13.641Z',
              id: 'clgmgbj4h000308mi8aai0pli',
              name: 'hostname',
              type: 'CNAME',
              updatedAt: '2023-03-23T10:05:13.641Z',
              value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
            },
          ],
          hostname: 'electronic.co',
          id: 'clgmfj1pa000108lc0g5i7d32',
          isVerified: true,
          status: 'ACTIVE',
          updatedAt: '2023-03-24T09:05:13.641Z',
          zone: {
            __typename: 'Zone',
            id: 'clgmfj874000208lc2e9ccglf',
          },
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.query('GetDomainsByZoneId', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        domainsByZoneId: {
          data: [
            {
              __typename: 'Domain',
              createdAt: '2023-03-24T09:05:13.641Z',
              dnsConfigs: [
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-03-23T09:05:13.641Z',
                  id: 'clgmg76ch000208mid5o30du0',
                  name: 'hostname',
                  type: 'CNAME',
                  updatedAt: '2023-03-23T09:05:13.641Z',
                  value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
                },
                {
                  __typename: 'DnsConfig',
                  createdAt: '2023-03-23T10:05:13.641Z',
                  id: 'clgmgbj4h000308mi8aai0pli',
                  name: 'hostname',
                  type: 'CNAME',
                  updatedAt: '2023-03-23T10:05:13.641Z',
                  value: 'clgmfj874000208lc2e9ccglf.b-cdn.net',
                },
              ],
              hostname: 'electronic.co',
              id: 'clgmfj1pa000108lc0g5i7d32',
              isVerified: true,
              status: 'ACTIVE',
              updatedAt: '2023-03-24T09:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'clgmfj874000208lc2e9ccglf',
              },
            },
            {
              __typename: 'Domain',
              createdAt: '2023-03-24T10:05:13.641Z',
              dnsConfigs: [],
              hostname: 'eshop-electronic.co',
              id: 'clgmfj874000208lc2e9ccglf',
              isVerified: false,
              status: 'VERIFYING_FAILED',
              updatedAt: '2023-03-24T10:05:13.641Z',
              zone: {
                __typename: 'Zone',
                id: 'clgmfj874000208lc2e9ccglf',
              },
            },
          ],
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.query('ListZones', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        zones: {
          data: [
            {
              __typename: 'Zone',
              createdAt: '2022-12-24T09:04:13.641Z',
              id: 'clgmfj874000208lc2e9ccglf',
              originUrl:
                'https://ipfs.io/ipfs/QmXYsy8xLYRaDbgDNeSthWSNneKM13Vb1FHV8LC4DghHy2',
              status: 'CREATED',
              type: 'SITE',
              updatedAt: '2022-12-24T09:04:13.641Z',
            },
            {
              __typename: 'Zone',
              createdAt: '2022-12-28T10:04:13.641Z',
              id: 'clgow7wob000508jog5gfanj9',
              originUrl:
                'https://bafybeifyvm5aa2z35jnpehvg3hfflazesjfma53yekmhz7dckqn4buvr7q.ipfs.gateway-ipfs.afsandbox.xyz',
              status: 'CREATED',
              type: 'SITE',
              updatedAt: '2022-12-28T10:04:13.641Z',
            },
            {
              __typename: 'Zone',
              createdAt: '2022-04-25T09:04:13.641Z',
              id: 'clj76kw6i000008l2ekmz6ahd',
              originUrl:
                'https://bafybeib5qbrx6xdrdvuxt2wsvfsrwwvu42bfh6pycm677qjkl66heelc2e.ipfs.gateway-ipfs.afsandbox.xyz',
              status: 'CREATED',
              type: 'PRIVATE_GATEWAY',
              updatedAt: '2022-04-25T10:04:13.641Z',
            },
            {
              __typename: 'Zone',
              createdAt: '2022-12-30T11:04:13.641Z',
              id: 'clje357cc000108jse08c2t6m',
              originUrl:
                'https://ipfs.io/ipfs/QmdG8HaQAYccz22zLgJ33trzu8g6wjF6e48YbBEZhbz342',
              status: 'CREATING_FAILED',
              type: 'SITE',
              updatedAt: '2022-12-30T11:04:13.641Z',
            },
            {
              __typename: 'Zone',
              createdAt: '2022-12-24T09:04:13.641Z',
              id: 'cljfq6n2y000008lb4oy403bc',
              originUrl: 'https://dedicated-gateway-ipfs.afsandbox.xyz',
              status: 'CREATED',
              type: 'PRIVATE_GATEWAY',
              updatedAt: '2022-12-24T09:04:13.641Z',
            },
            {
              __typename: 'Zone',
              createdAt: '2023-02-28T10:04:13.641Z',
              id: 'cljfqzrcg000208jy6677aqv1',
              originUrl: 'https://dedicated-gateway-ipfs.afsandbox.xyz',
              status: 'CREATED',
              type: 'PRIVATE_GATEWAY',
              updatedAt: '2023-02-28T10:04:13.641Z',
            },
          ],
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.query('GetZone', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        zone: {
          __typename: 'Zone',
          createdAt: '2022-12-24T09:04:13.641Z',
          id: 'clgmfj874000208lc2e9ccglf',
          originUrl:
            'https://ipfs.io/ipfs/QmXYsy8xLYRaDbgDNeSthWSNneKM13Vb1FHV8LC4DghHy2',
          status: 'CREATED',
          type: 'SITE',
          updatedAt: '2022-12-24T09:04:13.641Z',
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.query(
    'GetVerificationInstructions',
    async ({ query, variables }) => {
      const res = await executeGraphql({
        schema,
        source: query,
        variableValues: variables,
        rootValue: {
          domainVerificationInstructions: {
            __typename: 'DomainVerificationInstructions',
            method: 'TXT',
            recordType: 'TXT',
            hostname: '_af-verify.example.com',
            value: 'af-verify-abc123xyz',
            instructions:
              'Add a TXT record to your DNS with the following values:\nName: _af-verify.example.com\nValue: af-verify-abc123xyz',
          },
        },
      });

      return HttpResponse.json({
        data: res.data,
        errors: res.errors,
      });
    },
  ),
  localhost.query('ListDomainsForSite', async () => {
    // Return mock data directly without schema validation
    return HttpResponse.json({
      data: {
        site: {
          __typename: 'Site',
          id: 'site-123',
          domains: [
            {
              __typename: 'Domain',
              id: 'domain-1',
              hostname: 'example.com',
              verified: true,
              domainType: 'WEB2',
              txtVerificationStatus: 'VERIFIED',
              sslStatus: 'ACTIVE',
              sslAutoRenew: true,
              sslIssuedAt: '2023-11-01T00:00:00.000Z',
              sslExpiresAt: '2024-01-30T00:00:00.000Z',
              dnsCheckAttempts: 1,
              createdAt: '2023-10-01T00:00:00.000Z',
              updatedAt: '2023-11-01T00:00:00.000Z',
            },
            {
              __typename: 'Domain',
              id: 'domain-2',
              hostname: 'www.example.com',
              verified: false,
              domainType: 'WEB2',
              txtVerificationStatus: 'PENDING',
              sslStatus: 'NONE',
              sslAutoRenew: true,
              dnsCheckAttempts: 0,
              createdAt: '2023-11-06T00:00:00.000Z',
              updatedAt: '2023-11-06T00:00:00.000Z',
            },
          ],
        },
      },
    });
  }),
];

const mutations = [
  // Legacy create domain mutation (uses data/where)
  localhost.mutation('CreateDomainLegacy', async () => {
    return HttpResponse.json({
      data: {
        createDomainLegacy: {
          __typename: 'Domain',
          createdAt: new Date().toISOString(),
          dnslinkStatus: null,
          errorMessage: null,
          hostname: 'super-eshop.xyz',
          id: `cli2ymypd000208l86gjd6p17`,
          isVerified: false,
          status: 'CREATING',
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }),
  // New custom domain mutation (uses input)
  localhost.mutation('CreateCustomDomain', async ({ query }) => {
    // Parse query to find values passed by genql
    // genql inlines string values with quotes and enum values without quotes
    let domainType = 'WEB2';
    let hostname = 'example.com';
    let verificationMethod = 'TXT';

    // Extract domainType from query string (genql uses various formats)
    const domainTypeMatch = query.match(/domainType:\s*(\w+)/);
    if (domainTypeMatch) {
      domainType = domainTypeMatch[1];
    }

    // Extract hostname from query using multiple patterns
    // Try: hostname: "value" or hostname:"value"
    const hostnameMatch =
      query.match(/hostname:\s*"([^"]+)"/) ||
      query.match(/hostname:"([^"]+)"/);
    if (hostnameMatch) {
      hostname = hostnameMatch[1];
    }

    // Extract verificationMethod from query
    const verificationMatch = query.match(/verificationMethod:\s*"([^"]+)"/);
    if (verificationMatch) {
      verificationMethod = verificationMatch[1];
    }

    return HttpResponse.json({
      data: {
        createDomain: {
          __typename: 'Domain',
          id: `domain-${Date.now()}`,
          hostname: hostname,
          verified: false,
          domainType: domainType,
          txtVerificationToken: 'af-verify-abc123xyz',
          txtVerificationStatus: 'PENDING',
          dnsVerifiedAt: null,
          sslStatus: 'NONE',
          sslIssuedAt: null,
          sslExpiresAt: null,
          sslAutoRenew: true,
          arnsName: domainType === 'ARNS' ? hostname : null,
          ensName: domainType === 'ENS' ? hostname : null,
          ipnsHash: domainType === 'IPNS' ? hostname : null,
          lastDnsCheck: null,
          dnsCheckAttempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expectedCname: verificationMethod === 'CNAME' ? 'verify.af.app' : null,
          expectedARecord: verificationMethod === 'A' ? '170.75.255.101' : null,
        },
      },
    });
  }),
  // Custom domain verification
  localhost.mutation('VerifyCustomDomain', async () => {
    return HttpResponse.json({
      data: {
        verifyDomain: {
          __typename: 'Domain',
          id: 'domain-123',
          hostname: 'example.com',
          verified: true,
          domainType: 'WEB2',
          txtVerificationToken: 'af-verify-abc123xyz',
          txtVerificationStatus: 'VERIFIED',
          dnsVerifiedAt: new Date().toISOString(),
          sslStatus: 'NONE',
          sslIssuedAt: null,
          sslExpiresAt: null,
          sslAutoRenew: true,
          dnsCheckAttempts: 1,
          createdAt: '2023-11-06T00:00:00.000Z',
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }),
  localhost.mutation('DeleteDomain', async () => {
    return HttpResponse.json({
      data: {
        deleteDomain: {
          __typename: 'Domain',
          id: 'domain-123',
          createdAt: '2023-03-24T10:05:13.641Z',
          dnsConfigs: [],
          hostname: 'eshop-electronic.co',
          verified: false,
          domainType: 'WEB2',
          txtVerificationStatus: 'VERIFIED',
          sslStatus: 'NONE',
          isVerified: false,
          status: 'DELETING',
          updatedAt: new Date().toISOString(),
          zone: {
            __typename: 'Zone',
            id: 'clgmfj874000208lc2e9ccglf',
          },
        },
      },
    });
  }),
  localhost.mutation('VerifyDomain', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        verifyDomain: {
          __typename: 'Domain',
          createdAt: '2023-03-24T10:05:13.641Z',
          dnsConfigs: [],
          hostname: 'eshop-electronic.co',
          id: 'clgmfj874000208lc2e9ccglf',
          isVerified: false,
          status: 'VERIFYING',
          updatedAt: '2023-03-23T12:05:13.641Z',
          zone: {
            __typename: 'Zone',
            id: 'clgmfj874000208lc2e9ccglf',
          },
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.mutation('CreateZoneForSite', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        createZoneForSite: {
          __typename: 'Zone',
          createdAt: '2023-03-23T12:05:13.641Z',
          id: 'clgmg76ch000208mid5o30du0',
          originUrl:
            'https://bafybeibtme5hmkjxsryerf6pihhfbhifwnsz7gmhnfqglg2r326m4glzva.ipfs.gateway-ipfs.afsandbox.xyz',
          originUrlChangedAt: null,
          status: 'CREATING',
          type: 'SITE',
          updatedAt: '2023-03-23T12:05:13.641Z',
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.mutation(
    'CreateZoneForPrivateGateway',
    async ({ query, variables }) => {
      const res = await executeGraphql({
        schema,
        source: query,
        variableValues: variables,
        rootValue: {
          createZoneForPrivateGateway: {
            __typename: 'Zone',
            createdAt: '2023-03-23T12:05:13.641Z',

            id: 'clgmg76ch000208mid5o30du0',
            originUrl: 'https://storage.dev.on-af-test.app',
            status: 'CREATING',
            type: 'PRIVATE_GATEWAY',
            updatedAt: '2023-03-23T12:05:13.641Z',
          },
        },
      });

      return HttpResponse.json({
        data: res.data,
        errors: res.errors,
      });
    },
  ),
  localhost.mutation('DeleteZone', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        deleteZone: {
          __typename: 'Zone',
          createdAt: '2022-12-30T11:04:13.641Z',
          id: 'clje357cc000108jse08c2t6m',
          originUrl:
            'https://ipfs.io/ipfs/QmdG8HaQAYccz22zLgJ33trzu8g6wjF6e48YbBEZhbz342',
          status: 'DELETING',
          type: 'SITE',
          updatedAt: '2023-03-23T12:05:13.641Z',
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.mutation('ProvisionSsl', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        provisionSsl: {
          __typename: 'Domain',
          id: variables.domainId || 'domain-ssl-123',
          hostname: 'example.com',
          verified: true,
          domainType: 'WEB2',
          txtVerificationStatus: 'VERIFIED',
          sslStatus: 'PENDING',
          sslAutoRenew: true,
          sslIssuedAt: null,
          sslExpiresAt: null,
          dnsCheckAttempts: 1,
          createdAt: '2023-11-06T00:00:00.000Z',
          updatedAt: new Date().toISOString(),
          isVerified: true,
          status: 'CREATED',
          zone: {
            __typename: 'Zone',
            id: 'zone-1',
          },
        },
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
  localhost.mutation('SetPrimaryDomain', async ({ query, variables }) => {
    const res = await executeGraphql({
      schema,
      source: query,
      variableValues: variables,
      rootValue: {
        setPrimaryDomain: true,
      },
    });

    return HttpResponse.json({
      data: res.data,
      errors: res.errors,
    });
  }),
];

export const handlers = [...queries, ...mutations];
