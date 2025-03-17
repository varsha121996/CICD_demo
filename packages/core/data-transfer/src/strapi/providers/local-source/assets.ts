import { join } from 'path';
import { Duplex, PassThrough, Readable } from 'stream';
import * as webStream from 'stream/web';
import { stat, createReadStream, ReadStream } from 'fs-extra';
import type { Core } from '@strapi/types';

import type { IAsset, IFile } from '../../../../types';

function getFileStream(
  filepath: string,
  strapi: Core.Strapi,
  isLocal = false
): PassThrough | ReadStream {
  if (isLocal) {
    console.log('local fetch ==>', isLocal);
    // Todo: handle errors
    return createReadStream(filepath);
  }

  const readableStream = new PassThrough();

  // fetch the image from remote url and stream it
  strapi
    .fetch(filepath)
    .then((res: Response) => {
      if (res.status !== 200) {
        readableStream.emit('error', new Error(`Request failed with status code ${res.status}`));
        return;
      }

      if (res.body) {
        console.log('we fetched file successfully');
        // pipe the image data
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        Readable.fromWeb(res.body).pipe(readableStream);
      } else {
        console.log('we recieved error Empty data found for file');
        readableStream.emit('error', new Error('Empty data found for file'));
      }
    })
    .catch((error: unknown) => {
      console.log('we recieved ==>', error);
      readableStream.emit('error', error);
    });

  return readableStream;
}

function getFileStats(
  filepath: string,
  strapi: Core.Strapi,
  isLocal = false
): Promise<{ size: number }> {
  console.log('getFileStats is called', filepath, isLocal);
  if (isLocal) {
    return stat(filepath);
  }
  return new Promise((resolve, reject) => {
    strapi
      .fetch(filepath)
      .then((res: Response) => {
        if (res.status !== 200) {
          console.log('failed to get stats');
          reject(new Error(`Request failed with status code ${res.status}`));
          return;
        }

        const contentLength = res.headers.get('content-length');
        const stats = {
          size: contentLength ? parseInt(contentLength, 10) : 0,
        };
        console.log('recieved file stats');
        resolve(stats);
      })
      .catch((error: unknown) => {
        console.log('file stats unknown error');
        reject(error);
      });
  });
}

async function signFile(file: IFile) {
  console.log('we call signFile');
  const { provider } = strapi.plugins.upload;
  const { provider: providerName } = strapi.config.get('plugin.upload') as { provider: string };
  const isPrivate = await provider.isPrivate();
  console.log('is it private ==>', isPrivate);
  if (file?.provider === providerName && isPrivate) {
    const signUrl = async (file: IFile) => {
      const signedUrl = await provider.getSignedUrl(file);
      file.url = signedUrl.url;
    };

    // Sign the original file
    console.log('signing url');
    await signUrl(file);
    console.log('signed url');
    // Sign each file format
    if (file.formats) {
      for (const format of Object.keys(file.formats)) {
        await signUrl(file.formats[format]);
      }
    }
  }
}

/**
 * Generate and consume assets streams in order to stream each file individually
 */
export const createAssetsStream = (strapi: Core.Strapi): Duplex => {
  const generator: () => AsyncGenerator<IAsset, void> = async function* () {
    const stream: Readable = strapi.db
      .queryBuilder('plugin::upload.file')
      // Create a query builder instance (default type is 'select')
      // Fetch all columns
      .select('*')
      // Get a readable stream
      .stream();

    for await (const file of stream) {
      const isLocalProvider = file.provider === 'local';
      if (!isLocalProvider) {
        await signFile(file);
      }
      const filepath = isLocalProvider ? join(strapi.dirs.static.public, file.url) : file.url;
      const stats = await getFileStats(filepath, strapi, isLocalProvider);
      const stream = getFileStream(filepath, strapi, isLocalProvider);

      yield {
        metadata: file,
        filepath,
        filename: file.hash + file.ext,
        stream,
        stats: { size: stats.size },
      };

      if (file.formats) {
        for (const format of Object.keys(file.formats)) {
          const fileFormat = file.formats[format];
          const fileFormatFilepath = isLocalProvider
            ? join(strapi.dirs.static.public, fileFormat.url)
            : fileFormat.url;
          const fileFormatStats = await getFileStats(fileFormatFilepath, strapi, isLocalProvider);
          const fileFormatStream = getFileStream(fileFormatFilepath, strapi, isLocalProvider);
          const metadata = { ...fileFormat, type: format, id: file.id, mainHash: file.hash };
          yield {
            metadata,
            filepath: fileFormatFilepath,
            filename: fileFormat.hash + fileFormat.ext,
            stream: fileFormatStream,
            stats: { size: fileFormatStats.size },
          };
        }
      }
    }
  };

  return Duplex.from(generator());
};
