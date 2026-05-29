import {
  ArrowLeftOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { createImportJob, listImportErrors, listTaskDatasets } from "../features/datasets/api";
import type {
  DatasetSourceFormat,
  DatasetType,
  DatasetVO,
  ImportErrorRowVO,
  ImportJobVO,
} from "../features/datasets/types";
import {
  buildImportIdempotencyKey,
  datasetStatusMeta,
  datasetTypeOptions,
  defaultDatasetName,
  formatFileSize,
  importStatusMeta,
  inferDatasetSourceFormat,
  inferDatasetType,
  sourceFormatOptions,
} from "../features/datasets/view";
import { createFileObject } from "../features/files/api";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { formatTaskTime } from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";
import type { PaginationVO } from "../shared/types/api";

interface OwnerTaskDatasetsPageProps {
  taskId: string;
}

interface FilePayload {
  contentText?: string;
  contentBase64?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function sanitizeObjectKeyPart(value: string): string {
  return value.replace(/[^\w.-]+/g, "_");
}

function getMimeType(file: File, sourceFormat: DatasetSourceFormat): string {
  if (file.type) {
    return file.type;
  }
  if (sourceFormat === "EXCEL") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return sourceFormat === "JSONL" ? "application/jsonl" : "application/json";
}

async function readFilePayload(file: File, sourceFormat: DatasetSourceFormat): Promise<FilePayload> {
  if (sourceFormat === "EXCEL") {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return { contentBase64: window.btoa(binary) };
  }
  return { contentText: await file.text() };
}

export function OwnerTaskDatasetsPage({ taskId }: OwnerTaskDatasetsPageProps) {
  const { message } = AntdApp.useApp();
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [datasets, setDatasets] = useState<DatasetVO[]>([]);
  const [pagination, setPagination] = useState<PaginationVO>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [datasetType, setDatasetType] = useState<DatasetType>("QA_QUALITY");
  const [sourceFormat, setSourceFormat] = useState<DatasetSourceFormat>("JSON");
  const [lastJob, setLastJob] = useState<ImportJobVO | null>(null);
  const [importErrors, setImportErrors] = useState<ImportErrorRowVO[]>([]);
  const [loading, setLoading] = useState(true);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryState, setQueryState] = useState({ page: 1, pageSize: 10, requestId: 0 });

  const loadDatasets = useCallback(
    async (page: number, pageSize: number) => {
      setDatasetLoading(true);
      try {
        const response = await listTaskDatasets(taskId, { page, pageSize });
        setDatasets(response.data);
        setPagination(response.pagination);
      } finally {
        setDatasetLoading(false);
      }
    },
    [taskId],
  );

  useEffect(() => {
    let ignore = false;
    const loadPage = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextTask] = await Promise.all([
          getTask(taskId),
          loadDatasets(queryState.page, queryState.pageSize),
        ]);
        if (!ignore) {
          setTask(nextTask);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    void loadPage();
    return () => {
      ignore = true;
    };
  }, [loadDatasets, queryState, taskId]);

  const canSubmit = useMemo(
    () => Boolean(selectedFile && datasetName.trim() && !submitting),
    [datasetName, selectedFile, submitting],
  );

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setLastJob(null);
    setImportErrors([]);
    if (!file) {
      return;
    }
    const nextSourceFormat = inferDatasetSourceFormat(file.name);
    const nextDatasetType = inferDatasetType(file.name);
    setSourceFormat(nextSourceFormat);
    setDatasetType(nextDatasetType);
    setDatasetName(defaultDatasetName(file.name));
  }

  function refreshDatasets() {
    setQueryState((current) => ({ ...current, requestId: current.requestId + 1 }));
  }

  async function handleImport() {
    if (!selectedFile || !canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setImportErrors([]);
    try {
      const filePayload = await readFilePayload(selectedFile, sourceFormat);
      const fileObject = await createFileObject({
        bucket: "stage1-owner-imports",
        objectKey: `tasks/${taskId}/${Date.now()}-${sanitizeObjectKeyPart(selectedFile.name)}`,
        fileName: selectedFile.name,
        mimeType: getMimeType(selectedFile, sourceFormat),
        sizeBytes: selectedFile.size,
        checksum: null,
        purpose: "IMPORT",
        ...filePayload,
      });
      const job = await createImportJob(taskId, {
        datasetName: datasetName.trim(),
        datasetType,
        sourceFormat,
        fileObjectId: fileObject.id,
        idempotencyKey: buildImportIdempotencyKey({
          taskId,
          fileName: selectedFile.name,
          sizeBytes: selectedFile.size,
          datasetName: datasetName.trim(),
          datasetType,
          sourceFormat,
        }),
      });
      setLastJob(job);
      if (job.failedCount > 0) {
        const errors = await listImportErrors(job.id, { page: 1, pageSize: 20 });
        setImportErrors(errors.data);
      }
      message.success(job.failedCount > 0 ? "导入完成，存在部分错误行" : "数据导入完成");
      refreshDatasets();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const datasetColumns: TableColumnsType<DatasetVO> = [
    {
      title: "数据集",
      dataIndex: "name",
      minWidth: 240,
      render: (_, dataset) => (
        <Space direction="vertical" size={4}>
          <Typography.Text strong>{dataset.name}</Typography.Text>
          <Space size={4} wrap>
            <Tag>{dataset.datasetType}</Tag>
            <Tag>{dataset.sourceFormat}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: DatasetVO["status"]) => (
        <Tag color={datasetStatusMeta[value].color}>{datasetStatusMeta[value].label}</Tag>
      ),
    },
    {
      title: "题目数",
      width: 190,
      render: (_, dataset) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{dataset.itemCount} 条</Typography.Text>
          <Typography.Text type="secondary">
            可用 {dataset.enabledItemCount} / 禁用 {dataset.disabledItemCount}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      width: 180,
      render: (value: string) => formatTaskTime(value),
    },
  ];

  const errorColumns: TableColumnsType<ImportErrorRowVO> = [
    { title: "行号", dataIndex: "sourceRowNumber", width: 90, render: (value) => value ?? "-" },
    { title: "字段", dataIndex: "fieldPath", width: 160, render: (value) => value ?? "-" },
    { title: "错误码", dataIndex: "errorCode", width: 190 },
    { title: "说明", dataIndex: "errorMessage", minWidth: 260 },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/tasks")}>
          返回任务列表
        </Button>
        <Button onClick={() => navigate(`/owner/tasks/${taskId}/settings`)}>任务设置</Button>
      </Space>

      <Card loading={loading}>
        <Flex justify="space-between" gap={16} wrap="wrap">
          <Space direction="vertical" size={6}>
            <Typography.Title level={2} style={{ margin: 0 }}>
              数据集管理
            </Typography.Title>
            <Typography.Text type="secondary">
              {task ? `为「${task.title}」导入 JSON、JSONL 或 Excel 数据。` : "导入任务数据并追踪错误行。"}
            </Typography.Text>
          </Space>
          {task && (
            <Space size={16} wrap>
              <Statistic title="数据集" value={task.stats.datasetCount} />
              <Statistic title="题目" value={task.stats.itemCount} />
              <Statistic title="可用题目" value={task.stats.enabledItemCount} />
            </Space>
          )}
        </Flex>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}

      <div className="labelhub-dataset-grid">
        <Card className="labelhub-import-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Space direction="vertical" size={4}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                导入数据
              </Typography.Title>
              <Typography.Text type="secondary">
                阶段 1.2 会完成导入、统计和错误追踪；题目预览与批量编辑在下一粒度接入。
              </Typography.Text>
            </Space>

            <label className="labelhub-file-picker" htmlFor="owner-dataset-file">
              <UploadOutlined />
              <span>{selectedFile ? selectedFile.name : "选择 JSON / JSONL / Excel 文件"}</span>
              {selectedFile && <Tag>{formatFileSize(selectedFile.size)}</Tag>}
            </label>
            <input
              id="owner-dataset-file"
              type="file"
              accept=".json,.jsonl,.xlsx,application/json,application/jsonl,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="labelhub-hidden-file-input"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />

            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Input
                id="owner-dataset-name"
                name="ownerDatasetName"
                value={datasetName}
                onChange={(event) => setDatasetName(event.target.value)}
                placeholder="数据集名称，例如 qa_quality"
                aria-label="数据集名称"
              />
              <Flex gap={12} wrap="wrap">
                <Select
                  value={datasetType}
                  options={datasetTypeOptions}
                  onChange={setDatasetType}
                  style={{ flex: 1, minWidth: 180 }}
                />
                <Select
                  value={sourceFormat}
                  options={sourceFormatOptions}
                  onChange={setSourceFormat}
                  style={{ flex: 1, minWidth: 160 }}
                />
              </Flex>
            </Space>

            <Button
              type="primary"
              icon={<DatabaseOutlined />}
              block
              loading={submitting}
              disabled={!canSubmit}
              onClick={() => void handleImport()}
            >
              开始导入
            </Button>
          </Space>
        </Card>

        <Card className="labelhub-import-result-card">
          {lastJob ? (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                <Space>
                  <Tag color={importStatusMeta[lastJob.status].color}>
                    {importStatusMeta[lastJob.status].label}
                  </Tag>
                  <Typography.Text type="secondary">{formatTaskTime(lastJob.updatedAt)}</Typography.Text>
                </Space>
                <Typography.Text code>{lastJob.id}</Typography.Text>
              </Flex>
              <div className="labelhub-import-stats">
                <Statistic title="成功导入" value={lastJob.successCount} suffix="条" />
                <Statistic title="错误行" value={lastJob.failedCount} suffix="条" />
              </div>
              {lastJob.errorSummary && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  message="存在可追踪错误行"
                  description="下方会展示前 20 条错误，完整错误可通过导入错误接口分页查询。"
                />
              )}
            </Space>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择文件并导入后，这里会展示最近一次导入结果"
            />
          )}
        </Card>
      </div>

      {importErrors.length > 0 && (
        <Card title="导入错误行" className="labelhub-table-card">
          <Table
            rowKey="id"
            columns={errorColumns}
            dataSource={importErrors}
            pagination={false}
            scroll={{ x: 760 }}
          />
        </Card>
      )}

      <Card
        title="已导入数据集"
        extra={
          <Button icon={<ReloadOutlined />} onClick={refreshDatasets}>
            刷新
          </Button>
        }
        className="labelhub-table-card"
      >
        <Table
          rowKey="id"
          loading={datasetLoading}
          columns={datasetColumns}
          dataSource={datasets}
          scroll={{ x: 820 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据集，先导入一个文件" />,
          }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.totalItems,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个数据集`,
            onChange: (page, pageSize) =>
              setQueryState((current) => ({
                page,
                pageSize,
                requestId: current.requestId + 1,
              })),
          }}
        />
      </Card>
    </Space>
  );
}
