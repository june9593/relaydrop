import { classifyFile } from "../domain/files";
import type { RelayDropFile, RelayDropFileKind } from "../domain/types";
import { FileIcon } from "./Icons";

interface FileArtworkProps {
  file: RelayDropFile;
  kind?: RelayDropFileKind;
}

const kindLabels: Record<RelayDropFileKind, string> = {
  image: "IMG",
  video: "VID",
  audio: "AUD",
  pdf: "PDF",
  document: "DOC",
  spreadsheet: "XLS",
  presentation: "PPT",
  archive: "ZIP",
  code: "CODE",
  text: "TXT",
  file: "FILE"
};

export function FileArtwork({ file, kind }: FileArtworkProps) {
  const resolvedKind = kind ?? classifyFile(file.mediaType, file.name);
  const extension = fileExtension(file.name);

  return (
    <span className={"file-artwork kind-" + resolvedKind} aria-hidden="true">
      <span className="file-artwork-fold" />
      <FileIcon />
      <span className="file-artwork-label">
        {extension === "FILE" ? kindLabels[resolvedKind] : extension}
      </span>
    </span>
  );
}

function fileExtension(fileName: string): string {
  const extension = fileName.split(".").pop();
  return extension && extension !== fileName
    ? extension.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "FILE"
    : "FILE";
}
