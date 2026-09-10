import {
  Client,
  Project as ProjectWithRelations,
  ProjectGenqlSelection,
} from '@alternatefutures/utils-genql-client';
import { File } from '@web-std/file';

export type ProjectsClientOptions = {
  graphqlClient: Client;
};

export type CreateProjectArgs = { name: string };

export type UpdateProjectArgs = {
  where: { id: string };
  data: {
    name?: string;
    avatar?: (typeof File)['prototype'];
    backupStorageOnArweave?: boolean;
    backupStorageOnFilecoin?: boolean;
  };
};

export type GetProjectArgs = { id: string };

export type Project = Omit<
  ProjectWithRelations,
  'currentUserMembership' | 'memberships' | 'membershipsPaginated'
>;

export class ProjectsClient {
  private graphqlClient: Client;

  private static PROJECT_MAPPED_PROPERTIES: ProjectGenqlSelection = {
    id: true,
    name: true,
    avatar: true,
    backupStorageOnArweave: true,
    backupStorageOnFilecoin: true,
    createdAt: true,
  };

  constructor(options: ProjectsClientOptions) {
    this.graphqlClient = options.graphqlClient;
  }

  public create = async ({ name }: CreateProjectArgs): Promise<Project> => {
    const response = await this.graphqlClient.mutation({
      __name: 'CreateProject',
      createProject: {
        __args: {
          data: {
            name,
          },
        },
        ...ProjectsClient.PROJECT_MAPPED_PROPERTIES,
      },
    });

    return response.createProject;
  };

  public update = async ({
    where,
    data,
  }: UpdateProjectArgs): Promise<Project> => {
    const response = await this.graphqlClient.mutation({
      updateProject: {
        __args: {
          where,
          data,
        },
        ...ProjectsClient.PROJECT_MAPPED_PROPERTIES,
      },
    });

    return response.updateProject;
  };

  public get = async ({ id }: GetProjectArgs): Promise<Project> => {
    const response = await this.graphqlClient.query({
      __name: 'GetProject',
      project: {
        __args: {
          where: {
            id,
          },
        },
        ...ProjectsClient.PROJECT_MAPPED_PROPERTIES,
      },
    });

    return response.project;
  };

  public list = async (): Promise<Project[]> => {
    const response = await this.graphqlClient.query({
      __name: 'GetProjects',
      projects: { data: ProjectsClient.PROJECT_MAPPED_PROPERTIES },
    });

    return response.projects.data;
  };
}
