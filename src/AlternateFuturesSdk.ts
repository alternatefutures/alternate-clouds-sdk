import {
  AuthorizationError,
  SdkRequiredNodeRuntimeError,
} from '@alternatefutures/errors';
import { Client, createClient } from '@alternatefutures/utils-genql-client';
import { EnvNotSetError } from '@alternatefutures/errors';

import { ApplicationsClient } from './clients/applications';
import { BillingClient } from './clients/billing';
import { DomainsClient } from './clients/domains';
import { EnsClient } from './clients/ens';
import { FunctionsClient } from './clients/functions';
import { IpfsClient } from './clients/ipfs';
import { IpnsClient } from './clients/ipns';
import { ObservabilityClient } from './clients/observability';
import { PrivateGatewayClient } from './clients/privateGateway';
import { ProjectsClient } from './clients/projects';
import { SitesClient } from './clients/sites';
import { StorageClient } from './clients/storage';
import { UploadProxyClient } from './clients/uploadProxy';
import { UserClient } from './clients/user';
import { getDefined, type Defined } from './defined';
import { AccessTokenService } from './libs/AccessTokenService/AccessTokenService';
import { graphqlFetcher } from './libs/graphqlFetcher';
import { isNode } from './utils/node';

type Headers = Record<string, string>;

type AlternateFuturesSdkOptions = {
  graphqlServiceApiUrl?: string;
  ipfsStorageApiUrl?: string;
  uploadProxyApiUrl?: string;
  authServiceUrl?: string;
  accessTokenService: AccessTokenService;
};

const getOptionalDefined = (key: keyof Defined): string | undefined => {
  try {
    return getDefined(key);
  } catch {
    return undefined;
  }
};

export class AlternateFuturesSdk {
  private accessTokenService: AccessTokenService;
  private graphqlClient: Client;
  private uploadProxyClient: UploadProxyClient;

  private userClient?: UserClient;
  private projectsClient?: ProjectsClient;
  private ipnsClient?: IpnsClient;
  private sitesClient?: SitesClient;
  private domainsClient?: DomainsClient;
  private applicationsClient?: ApplicationsClient;
  private privateGatewayClient?: PrivateGatewayClient;
  private ensClient?: EnsClient;
  private billingClient?: BillingClient;

  private storageClient?: StorageClient;
  private uploadProxyApiUrl: string;

  private graphqlServiceApiUrl: string;
  private authServiceUrl?: string;

  private ipfsClient?: IpfsClient;
  private ipfsStorageApiUrl: string;
  private functionsClient?: FunctionsClient;
  private observabilityClient?: ObservabilityClient;

  constructor({
    graphqlServiceApiUrl = getDefined('SDK__GRAPHQL_API_URL'),
    ipfsStorageApiUrl = getDefined('SDK__IPFS__STORAGE_API_URL'),
    uploadProxyApiUrl = getDefined('SDK__UPLOAD_PROXY_API_URL'),
    authServiceUrl = getOptionalDefined('SDK__AUTH_SERVICE_URL'),
    accessTokenService,
  }: AlternateFuturesSdkOptions) {
    if (!ipfsStorageApiUrl) {
      throw new EnvNotSetError('SDK__IPFS__STORAGE_API_URL');
    }

    if (!uploadProxyApiUrl) {
      throw new EnvNotSetError('SDK__UPLOAD_PROXY_API_URL');
    }

    if (!accessTokenService) {
      throw new AuthorizationError();
    }

    this.accessTokenService = accessTokenService;

    this.graphqlClient = createClient({
      fetcher: async (operation) =>
        graphqlFetcher({
          operation,
          headers: {
            ...(await this.getAuthenticationHeaders()),
            ...this.getCustomHeaders(),
          },
          endpoint: this.graphqlServiceApiUrl,
        }),
    });

    this.graphqlServiceApiUrl = graphqlServiceApiUrl;
    this.ipfsStorageApiUrl = ipfsStorageApiUrl;
    this.uploadProxyApiUrl = uploadProxyApiUrl;
    if (authServiceUrl) {
      this.authServiceUrl = authServiceUrl;
    }

    this.uploadProxyClient = new UploadProxyClient({
      uploadProxyApiUrl: this.uploadProxyApiUrl,
      accessTokenService: this.accessTokenService,
    });
  }

  public getVersion = async () => {
    const response = await this.graphqlClient.query({
      __name: 'GetVersion',
      version: { __scalar: true },
    });

    return response;
  };

  public user = (): UserClient => {
    if (!this.userClient) {
      this.userClient = new UserClient({ graphqlClient: this.graphqlClient });
    }

    return this.userClient;
  };

  public ipns = (): IpnsClient => {
    if (!this.ipnsClient) {
      this.ipnsClient = new IpnsClient({ graphqlClient: this.graphqlClient });
    }

    return this.ipnsClient;
  };

  public ipfs = (): IpfsClient => {
    if (!isNode) {
      throw new SdkRequiredNodeRuntimeError();
    }

    if (!this.ipfsClient) {
      this.ipfsClient = new IpfsClient({
        uploadProxyClient: this.uploadProxyClient,
      });
    }

    return this.ipfsClient;
  };

  public sites = (): SitesClient => {
    if (!this.sitesClient) {
      this.sitesClient = new SitesClient({ graphqlClient: this.graphqlClient });
    }

    return this.sitesClient;
  };

  public projects = (): ProjectsClient => {
    if (!this.projectsClient) {
      this.projectsClient = new ProjectsClient({
        graphqlClient: this.graphqlClient,
      });
    }

    return this.projectsClient;
  };

  public domains = (): DomainsClient => {
    if (!this.domainsClient) {
      this.domainsClient = new DomainsClient({
        graphqlClient: this.graphqlClient,
      });
    }

    return this.domainsClient;
  };

  public applications = (): ApplicationsClient => {
    if (!this.applicationsClient) {
      this.applicationsClient = new ApplicationsClient({
        graphqlClient: this.graphqlClient,
      });
    }

    return this.applicationsClient;
  };

  public ens = (): EnsClient => {
    if (!this.ensClient) {
      this.ensClient = new EnsClient({ graphqlClient: this.graphqlClient });
    }

    return this.ensClient;
  };

  public privateGateways = (): PrivateGatewayClient => {
    if (!this.privateGatewayClient) {
      this.privateGatewayClient = new PrivateGatewayClient({
        graphqlClient: this.graphqlClient,
      });
    }

    return this.privateGatewayClient;
  };

  public storage = (): StorageClient => {
    if (!this.storageClient) {
      this.storageClient = new StorageClient({
        graphqlClient: this.graphqlClient,
        uploadProxyClient: this.uploadProxyClient,
      });
    }

    return this.storageClient;
  };

  public functions = (): FunctionsClient => {
    if (!this.functionsClient) {
      this.functionsClient = new FunctionsClient({
        graphqlClient: this.graphqlClient,
      });
    }

    return this.functionsClient;
  };

  public billing = (): BillingClient => {
    if (!this.billingClient) {
      if (!this.authServiceUrl) {
        throw new EnvNotSetError('SDK__AUTH_SERVICE_URL');
      }
      this.billingClient = new BillingClient({
        authServiceUrl: this.authServiceUrl,
        accessTokenService: this.accessTokenService,
      });
    }

    return this.billingClient;
  };

  public observability = (): ObservabilityClient => {
    if (!this.observabilityClient) {
      this.observabilityClient = new ObservabilityClient({
        graphqlClient: this.graphqlClient,
      });
    }

    return this.observabilityClient;
  };

  private getAuthenticationHeaders = async () => {
    try {
      const accessToken = await this.accessTokenService.getAccessToken();

      if (!accessToken) {
        return {};
      }

      const headers: Headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      return headers;
    } catch (error) {
      // Log authentication errors in debug mode to help troubleshoot issues
      // Return empty headers to allow unauthenticated requests where supported
      if (process.env.DEBUG || process.env.SDK_DEBUG) {
        console.error('Failed to get authentication headers:', error);
      }
      return {};
    }
  };

  private getCustomHeaders = () => {
    const headers: Headers = {
      'X-Client-Type': 'sdk',
    };

    return headers;
  };
}
