import {
  SdkRequiredNodeRuntimeError,
  StorageIpfsUploadFailedError,
} from '@alternatefutures/errors';
import { filesFromPaths } from 'files-from-path';
import type { ReadStream } from 'fs';
import type { CID, globSource } from 'ipfs-http-client';

import { requireNodeEnv } from '../libs/requireNodeEnv';
import {
  WriteFilesArgs,
  writeFilesFromStream,
} from '../libs/writeFilesFromStream';
import { isNode } from '../utils/node';
import { UploadPinResponse, UploadProxyClient } from './uploadProxy';

export type IpfsFile = {
  path?: string;
  content: ArrayBuffer | string;
};

export type IpfsClientOptions = {
  uploadProxyClient: UploadProxyClient;
};

export type AddAllOptions = {
  basename?: string;
  wrapWithDirectory?: boolean;
  searchParams?: URLSearchParams;
  siteId?: string;
};

export type AddFromPathOptions = {
  wrapWithDirectory?: boolean;
  searchParams?: URLSearchParams;
  siteId?: string;
};

export type UploadResult = {
  cid: CID;
  size: number;
  path: string;
};
export class IpfsClient {
  private uploadProxyClient: UploadProxyClient;

  constructor(options: IpfsClientOptions) {
    if (!isNode) {
      throw new SdkRequiredNodeRuntimeError();
    }

    this.uploadProxyClient = options.uploadProxyClient;
  }

  private pinToUploadResult = async (
    pin: UploadPinResponse['pin'],
    path: string,
  ) => {
    const { CID } = await import('ipfs-http-client');

    return {
      cid: CID.parse(pin.cid),
      size: pin.size,
      path,
    };
  };

  public add = async (file: IpfsFile): Promise<UploadResult> => {
    const nodePath = await import('path');
    const path = file.path ? nodePath.basename(file.path) : '';

    const blob = new Blob([file.content]);
    const { UnixFS } = await import('@web3-storage/upload-client');
    const getStream = () =>
      UnixFS.createFileEncoderStream({ stream: () => blob.stream() });

    try {
      const { pin } = await this.uploadProxyClient.uploadContent({
        getStream,
        basename: path,
      });

      return this.pinToUploadResult(pin, path);
    } catch {
      throw new StorageIpfsUploadFailedError();
    }
  };

  public addAll = async (
    files: Array<IpfsFile> | ReturnType<typeof globSource>,
    options: AddAllOptions = {},
  ): Promise<UploadResult[]> => {
    const added: UploadResult[] = [];
    try {
      if (Array.isArray(files)) {
        const pins = await Promise.all(
          files.map(async (file) => await this.add(file)),
        );
        added.push(...pins);
      } else {
        requireNodeEnv();

        const fileStreams: WriteFilesArgs[] = [];
        const basename = options.basename ?? 'wrapped';
        const { randomBytes } = await import('crypto');
        const wrappedRandomDir = `wrapped_${randomBytes(10).toString('hex')}`;
        const wrapped = `${wrappedRandomDir}/${basename}`;
        const path = await import('path');

        for await (const file of files) {
          if (file.content === undefined) {
            continue;
          }

          fileStreams.push({
            readStream: file.content as ReadStream,
            outputPath: path.join(wrapped, file.path.slice(1)),
          });
        }

        await writeFilesFromStream(fileStreams);
        const filesFromPath = await filesFromPaths([wrapped]);
        const { UnixFS } = await import('@web3-storage/upload-client');

        if (options.wrapWithDirectory) {
          const getStream = () =>
            UnixFS.createDirectoryEncoderStream(filesFromPath);
          const { pin } = await this.uploadProxyClient.uploadContent({
            getStream,
            basename,
          });
          const uploadResult = await this.pinToUploadResult(pin, basename);
          added.push(uploadResult);
        } else {
          const pins = await Promise.all(
            filesFromPath.map(async (path) => {
              const getStream = () =>
                UnixFS.createDirectoryEncoderStream([path]);
              const { pin } = await this.uploadProxyClient.uploadContent({
                getStream,
                basename: path.name,
              });

              return this.pinToUploadResult(pin, path.name);
            }),
          );
          added.push(...pins);
        }

        const { promises: fs } = await import('fs');
        await fs.rm(wrappedRandomDir, { recursive: true, force: true });
      }

      return added;
    } catch (err) {
      console.log(err);
      throw new StorageIpfsUploadFailedError();
    }
  };

  public addFromPath = async (
    path: string,
    options: AddFromPathOptions = {},
  ) => {
    requireNodeEnv();

    const nodePath = await import('path');
    const basename = nodePath.basename(path);

    const { promises: fs } = await import('fs');
    const stat = await fs.stat(path);
    const { UnixFS } = await import('@web3-storage/upload-client');

    if (!stat.isDirectory()) {
      const fileFromPath = await filesFromPaths([path]);
      const file = fileFromPath[0];
      if (!file) {
        throw new Error(`Failed to read file: ${path}`);
      }
      const getStream = () => UnixFS.createFileEncoderStream(file);

      const { pin } = await this.uploadProxyClient.uploadContent({
        getStream,
        basename,
        options: { siteId: options.siteId },
      });

      return [await this.pinToUploadResult(pin, basename)];
    }

    const filesfromPath = await filesFromPaths([path]);
    const getStream = () => UnixFS.createDirectoryEncoderStream(filesfromPath);
    const { pin } = await this.uploadProxyClient.uploadContent({
      getStream,
      basename,
    });

    return [await this.pinToUploadResult(pin, basename)];
  };

  public addSitesToIpfs = async (
    path: string,
    options: AddFromPathOptions = {},
  ) => {
    return this.addFromPath(path, options);
  };
}
