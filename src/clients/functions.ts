import {
  Client,
  AFFunction as OriginalAFFunction,
  AFFunctionDeployment,
  AFFunctionDeploymentGenqlSelection,
  AFFunctionGenqlSelection,
  AFFunctionStatus,
} from '@alternatefutures/utils-genql-client';

type FunctionsClientOptions = {
  graphqlClient: Client;
};

export type AFFunction = Omit<OriginalAFFunction, 'projectId' | 'site'>;

export type GetAFFunctionArgs = {
  name: string;
};
export type CreateAFFunctionArgs = {
  name: string;
  siteId?: string;
  routes?: Record<string, string> | null;
};
export type DeleteAFFunctionArgs = {
  id: string;
};
export type UpdateAFFunctionArgs = {
  id: string;
  name?: string;
  slug?: string;
  routes?: Record<string, string> | null;
  status?: AFFunctionStatus;
};
export type DeployAFFunctionArgs = {
  functionId: string;
  cid: string;
  sgx?: boolean;
  blake3Hash?: string;
  assetsCid?: string;
};
export type ListAFFunctionArgs = {
  functionId: string;
};

export class FunctionsClient {
  private graphqlClient: Client;

  private static Deployment_MAPPED_PROPERTIES: AFFunctionDeploymentGenqlSelection = {
    id: true,
    afFunctionId: true,
    cid: true,
    updatedAt: true,
    createdAt: true,
  };

  private static AFFunction_MAPPED_PROPERTIES: AFFunctionGenqlSelection = {
    id: true,
    name: true,
    slug: true,
    invokeUrl: true,
    projectId: true,
    // TODO: Re-enable when @alternatefutures/utils-genql-client v0.5.0 is published
    // routes: true,
    currentDeploymentId: true,
    currentDeployment: {
      cid: true,
    },
    siteId: true,
    status: true,
  };

  constructor(options: FunctionsClientOptions) {
    this.graphqlClient = options.graphqlClient;
  }

  public get = async ({ name }: GetAFFunctionArgs): Promise<AFFunction> => {
    const response = await this.graphqlClient.query({
      __name: 'GetAFFunctionByName',
      afFunctionByName: {
        __args: {
          where: {
            name,
          },
        },
        ...FunctionsClient.AFFunction_MAPPED_PROPERTIES,
      },
    });

    return response.afFunctionByName;
  };

  public list = async (): Promise<AFFunction[]> => {
    const response = await this.graphqlClient.query({
      __name: 'GetAFFunctions',
      afFunctions: {
        __args: {},
        data: {
          ...FunctionsClient.AFFunction_MAPPED_PROPERTIES,
        },
      },
    });

    return response.afFunctions.data;
  };

  public listDeployments = async ({ functionId }: ListAFFunctionArgs): Promise<AFFunctionDeployment[]> => {
    const response = await this.graphqlClient.query({
      afFunctionDeployments: {
        __args: {
          where: {
            afFunctionId: functionId,
          },
        },
        data: {
          ...FunctionsClient.Deployment_MAPPED_PROPERTIES,
        },
      },
    });

    return response.afFunctionDeployments.data;
  };

  public create = async ({ name, siteId, routes }: CreateAFFunctionArgs) => {
    const response = await this.graphqlClient.mutation({
      __name: 'CreateAFFunction',
      createAFFunction: {
        __args: {
          data: {
            name,
            siteId: siteId ?? null,
            routes: routes ?? null,
          },
        },
        ...FunctionsClient.AFFunction_MAPPED_PROPERTIES,
      },
    });

    return response.createAFFunction;
  };

  public deploy = async ({ functionId, cid, sgx, blake3Hash, assetsCid }: DeployAFFunctionArgs): Promise<AFFunctionDeployment> => {
    const response = await this.graphqlClient.mutation({
      triggerAFFunctionDeployment: {
        __args: {
          where: {
            functionId,
            cid,
          },
          data: {
            sgx: sgx ?? null,
            blake3Hash: blake3Hash ?? null,
            assetsCid: assetsCid ?? null,
          },
        },
        ...FunctionsClient.Deployment_MAPPED_PROPERTIES,
      },
    });

    return response.triggerAFFunctionDeployment;
  };

  public delete = async ({ id }: DeleteAFFunctionArgs) => {
    const response = await this.graphqlClient.mutation({
      __name: 'DeleteAFFunction',
      deleteAFFunction: {
        __args: {
          where: {
            id,
          },
        },
        ...FunctionsClient.AFFunction_MAPPED_PROPERTIES,
      },
    });

    return response.deleteAFFunction;
  };

  public update = async ({ id, slug, name, routes, status }: UpdateAFFunctionArgs) => {
    const response = await this.graphqlClient.mutation({
      updateAFFunction: {
        __args: {
          where: {
            id,
          },
          data: {
            slug: slug ?? null,
            name: name ?? null,
            routes: routes !== undefined ? routes : null,
            status: status ?? null,
          },
        },
        ...FunctionsClient.AFFunction_MAPPED_PROPERTIES,
      },
    });

    return response.updateAFFunction;
  };
}
