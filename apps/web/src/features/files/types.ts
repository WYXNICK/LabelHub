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
  downloadUrl: string;
  previewUrl: string | null;
  isImage: boolean;
  createdBy: string;
  createdAt: string;
}

export interface FileReferenceVO extends Record<string, string | number | boolean | null> {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  downloadUrl: string;
  previewUrl: string | null;
  isImage: boolean;
}
