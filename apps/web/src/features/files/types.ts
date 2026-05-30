export type FilePurpose = "IMPORT" | "EVIDENCE" | "EXPORT";

export interface CreateFileObjectRequest {
  bucket: string;
  objectKey: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  checksum?: string | null;
  purpose: FilePurpose;
  contentText?: string | null;
  contentBase64?: string | null;
}

export interface FileObjectVO {
  id: string;
  bucket: string;
  objectKey: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  checksum: string | null;
  purpose: FilePurpose;
  createdBy: string;
  createdAt: string;
}
