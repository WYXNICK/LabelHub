import { FileImageOutlined, FileOutlined } from "@ant-design/icons";
import { Empty, Image, Tag, Typography } from "antd";

import { buildFileDownloadUrl } from "./api";
import type { FileObjectVO, FileReferenceVO } from "./types";

export type AttachmentReference = FileReferenceVO;

export function toFileReference(fileObject: FileObjectVO): FileReferenceVO {
  return {
    id: fileObject.id,
    fileName: fileObject.fileName,
    mimeType: fileObject.mimeType,
    sizeBytes: fileObject.sizeBytes,
    downloadUrl: fileObject.downloadUrl,
    previewUrl: fileObject.previewUrl,
    isImage: fileObject.isImage,
  };
}

export function isAttachmentValue(value: unknown): boolean {
  return normalizeAttachmentValue(value).length > 0;
}

export function normalizeAttachmentValue(value: unknown): AttachmentReference[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): AttachmentReference[] => {
    if (typeof item === "string" && item.trim()) {
      const id = item.trim();
      if (!id.startsWith("file_")) {
        return [];
      }
      return [
        {
          id,
          fileName: id,
          mimeType: null,
          sizeBytes: 0,
          downloadUrl: id.startsWith("file_") ? buildFileDownloadUrl(id) : "",
          previewUrl: null,
          isImage: false,
        },
      ];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!id.startsWith("file_")) {
      return [];
    }
    const mimeType = typeof record.mimeType === "string" ? record.mimeType : null;
    const isImage = typeof record.isImage === "boolean" ? record.isImage : Boolean(mimeType?.startsWith("image/"));
    const downloadUrl =
      typeof record.downloadUrl === "string" && record.downloadUrl ? record.downloadUrl : buildFileDownloadUrl(id);
    return [
      {
        id,
        fileName: typeof record.fileName === "string" && record.fileName ? record.fileName : id,
        mimeType,
        sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : 0,
        downloadUrl,
        previewUrl:
          typeof record.previewUrl === "string" && record.previewUrl
            ? record.previewUrl
            : isImage
              ? buildFileDownloadUrl(id, true)
              : null,
        isImage,
      },
    ];
  });
}

export function serializeAttachmentReference(reference: AttachmentReference): FileReferenceVO {
  return {
    id: reference.id,
    fileName: reference.fileName,
    mimeType: reference.mimeType,
    sizeBytes: reference.sizeBytes,
    downloadUrl: reference.downloadUrl,
    previewUrl: reference.previewUrl,
    isImage: reference.isImage,
  };
}

export function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "大小未知";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentValue({ value, compact = false }: { value: unknown; compact?: boolean }) {
  const references = normalizeAttachmentValue(value);
  if (references.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无附件" />;
  }
  return (
    <div className={compact ? "labelhub-attachment-value compact" : "labelhub-attachment-value"}>
      {references.map((reference) =>
        reference.isImage && reference.previewUrl ? (
          <div className="labelhub-attachment-image-card" key={reference.id}>
            <Image
              src={reference.previewUrl}
              width={compact ? 72 : 112}
              height={compact ? 72 : 88}
              alt={reference.fileName}
              className="labelhub-attachment-image"
            />
            <AttachmentMeta reference={reference} compact={compact} />
          </div>
        ) : (
          <a
            className="labelhub-attachment-file-card"
            href={reference.downloadUrl || undefined}
            target="_blank"
            rel="noreferrer"
            key={reference.id}
            title={reference.downloadUrl ? `下载 ${getDisplayFileName(reference)}` : getDisplayFileName(reference)}
          >
            <span className="labelhub-attachment-file-icon">
              {reference.isImage ? <FileImageOutlined /> : <FileOutlined />}
            </span>
            <AttachmentMeta reference={reference} compact={compact} />
          </a>
        ),
      )}
    </div>
  );
}

function AttachmentMeta({ reference, compact }: { reference: AttachmentReference; compact: boolean }) {
  const displayName = getDisplayFileName(reference);
  const fileType = getDisplayFileType(reference);
  return (
    <div className="labelhub-attachment-meta">
      <Typography.Text strong ellipsis={{ tooltip: displayName }}>
        {displayName}
      </Typography.Text>
      <div className="labelhub-attachment-meta-row">
        <Tag>{fileType}</Tag>
        <Typography.Text type="secondary" ellipsis={{ tooltip: formatFileSize(reference.sizeBytes) }}>
          {formatFileSize(reference.sizeBytes)}
        </Typography.Text>
      </div>
    </div>
  );
}

function getDisplayFileName(reference: AttachmentReference): string {
  const name = reference.fileName.trim();
  if (!name || name === reference.id || /^file_[a-f0-9]{16,}$/i.test(name)) {
    return reference.isImage ? "证据图片" : "证据附件";
  }
  return name;
}

function getDisplayFileType(reference: AttachmentReference): string {
  if (reference.mimeType) {
    const subtype = reference.mimeType.split("/").at(1)?.split(";")[0]?.trim();
    if (subtype) {
      return subtype.toUpperCase();
    }
    return reference.mimeType;
  }
  const suffix = getDisplayFileName(reference).split(".").pop();
  if (suffix && suffix !== getDisplayFileName(reference)) {
    return suffix.toUpperCase();
  }
  return reference.isImage ? "IMAGE" : "FILE";
}
