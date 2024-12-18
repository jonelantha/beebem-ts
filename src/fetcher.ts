import { zipExtractFile, getZipFileHeaders, ZipFileHeader } from "./zip";

export async function fetchDiscImage(fileName: string) {
  const res = await fetch(fileName, { referrerPolicy: "no-referrer" });

  const responseBuffer = await res.arrayBuffer();

  if (res.headers.get("content-type") === "application/zip") {
    const zipFileHeaders = getZipFileHeaders(responseBuffer);

    const ssdFileHeader = findSsdFileHeader(zipFileHeaders);

    if (!ssdFileHeader) throw "no ssd found in zip";

    return zipExtractFile(responseBuffer, ssdFileHeader);
  } else {
    return responseBuffer;
  }
}

function findSsdFileHeader(zipFileHeaders: ZipFileHeader[]) {
  return zipFileHeaders.find(
    header => header.uncompressedSize > 0 && header.filename.endsWith(".ssd"),
  );
}
