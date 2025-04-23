import { zipExtractFile, getZipFileHeaders, ZipFileHeader } from "./zip";

export async function fetchDiscImage(fileName: string) {
  const res = await fetch(fileName, { referrerPolicy: "no-referrer" });

  const responseBuffer = await res.arrayBuffer();

  if (res.headers.get("content-type") === "application/zip") {
    const zipFileHeaders = getZipFileHeaders(responseBuffer);

    const ssdFileHeader = findFileHeaderByExtension(zipFileHeaders, ".ssd");

    if (!ssdFileHeader) throw "no ssd found in zip";

    return zipExtractFile(responseBuffer, ssdFileHeader);
  } else {
    return responseBuffer;
  }
}

export async function fetchTape(fileName: string) {
  const res = await fetch(fileName, { referrerPolicy: "no-referrer" });

  const responseBuffer = await res.arrayBuffer();

  if (res.headers.get("content-type") === "application/zip") {
    const zipFileHeaders = getZipFileHeaders(responseBuffer);

    const cswFileHeader = findFileHeaderByExtension(zipFileHeaders, ".csw");

    if (!cswFileHeader) throw "no csw found in zip";

    return await zipExtractFile(responseBuffer, cswFileHeader);
  } else {
    return responseBuffer;
  }
}

function findFileHeaderByExtension(
  zipFileHeaders: ZipFileHeader[],
  extension: string,
) {
  return zipFileHeaders.find(
    header =>
      header.uncompressedSize > 0 && header.filename.endsWith(extension),
  );
}
