import {
  ArrowLeftOutlined,
  DownloadOutlined,
  PlusOutlined,
  RedoOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Flex,
  Input,
  Progress,
  Select,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { ApiClientError } from "../shared/api/client";
import type { PaginationVO } from "../shared/types/api";
import {
  createExportJob,
  downloadExportJobFile,
  getExportFieldOptions,
  listExportJobs,
  retryExportJob,
} from "../features/exports/api";
import type {
  ExportFieldMappingDTO,
  ExportFieldOptionVO,
  ExportFormat,
  ExportJobStatus,
  ExportJobVO,
} from "../features/exports/types";
import {
  exportFieldSourceMeta,
  exportFormatMeta,
  exportJobStatusMeta,
  formatSampleValue,
  toOutputKey,
} from "../features/exports/view";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { formatTaskTime } from "../features/tasks/view";

interface OwnerTaskExportsPageProps {
  taskId: string;
}

const exportFormatOptions = (Object.keys(exportFormatMeta) as ExportFormat[]).map((format) => ({
  label: exportFormatMeta[format].label,
  value: format,
}));

const exportStatusOptions: Array<{ label: string; value: ExportJobStatus | "ALL" }> = [
  { label: "全部状态", value: "ALL" },
  { label: "已完成", value: "SUCCEEDED" },
  { label: "失败", value: "FAILED" },
  { label: "生成中", value: "RUNNING" },
  { label: "等待生成", value: "QUEUED" },
];

const emptyPagination: PaginationVO = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 0,
};

export function OwnerTaskExportsPage({ taskId }: OwnerTaskExportsPageProps) {
  const { message } = AntdApp.useApp();
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [fieldOptions, setFieldOptions] = useState<ExportFieldOptionVO[]>([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [latestApprovedAt, setLatestApprovedAt] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ExportJobVO[]>([]);
  const [pagination, setPagination] = useState<PaginationVO>(emptyPagination);
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("JSONL");
  const [mappings, setMappings] = useState<ExportFieldMappingDTO[]>([]);
  const [includeReviewRecords, setIncludeReviewRecords] = useState(true);
  const [includeAuditTimeline, setIncludeAuditTimeline] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ExportJobStatus | "ALL">("ALL");
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTask, nextFields, nextJobs] = await Promise.all([
        getTask(taskId),
        getExportFieldOptions(taskId),
        listExportJobs(taskId, {
          page: 1,
          pageSize: pagination.pageSize,
          status: statusFilter === "ALL" ? null : statusFilter,
        }),
      ]);
      setTask(nextTask);
      setFieldOptions(nextFields.options);
      setApprovedCount(nextFields.approvedCount);
      setLatestApprovedAt(nextFields.latestApprovedAt);
      setJobs(nextJobs.data);
      setPagination(nextJobs.pagination);
      setMappings(buildMappingRows(nextFields.options));
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, statusFilter, taskId]);

  const loadJobs = useCallback(
    async (page: number, pageSize: number, nextStatus: ExportJobStatus | "ALL" = statusFilter) => {
      setJobsLoading(true);
      try {
        const response = await listExportJobs(taskId, {
          page,
          pageSize,
          status: nextStatus === "ALL" ? null : nextStatus,
        });
        setJobs(response.data);
        setPagination(response.pagination);
      } catch (requestError) {
        message.error(getErrorMessage(requestError));
      } finally {
        setJobsLoading(false);
      }
    },
    [message, statusFilter, taskId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selectedMappings = useMemo(
    () => mappings.filter((mapping) => mapping.selected).sort((left, right) => left.order - right.order),
    [mappings],
  );
  const latestJob = jobs[0] ?? null;
  const creationDisabled = approvedCount === 0 || fieldOptions.length === 0;

  function openCreateDrawer() {
    setMappings(buildMappingRows(fieldOptions));
    setDrawerOpen(true);
  }

  async function handleCreateExportJob() {
    if (selectedMappings.length === 0) {
      message.warning("请至少选择一个导出字段。");
      return;
    }
    setCreating(true);
    try {
      const createdJob = await createExportJob(taskId, {
        format,
        fieldMappings: mappings,
        includeReviewRecords,
        includeAuditTimeline,
        idempotencyKey: `export:${taskId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      });
      if (createdJob.status === "SUCCEEDED") {
        message.success("导出文件已生成，可在历史中下载。");
      } else if (createdJob.status === "FAILED") {
        message.warning(createdJob.errorMessage ?? "导出任务创建成功，但文件生成失败。");
      } else {
        message.info("导出任务已创建，文件正在生成。");
      }
      setDrawerOpen(false);
      await loadJobs(1, pagination.pageSize);
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function handleDownloadJob(job: ExportJobVO) {
    setDownloadingJobId(job.id);
    try {
      const result = await downloadExportJobFile(job.id);
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      message.success("导出文件下载已开始。");
      await loadJobs(pagination.page, pagination.pageSize);
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
      await loadJobs(pagination.page, pagination.pageSize);
    } finally {
      setDownloadingJobId(null);
    }
  }

  async function handleRetryJob(job: ExportJobVO) {
    setRetryingJobId(job.id);
    try {
      const retriedJob = await retryExportJob(job.id);
      if (retriedJob.status === "SUCCEEDED") {
        message.success("导出文件已重新生成。");
      } else if (retriedJob.status === "FAILED") {
        message.warning(retriedJob.errorMessage ?? "重新生成失败，请查看历史详情。");
      } else {
        message.info("已重新进入生成队列。");
      }
      await loadJobs(1, pagination.pageSize);
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setRetryingJobId(null);
    }
  }

  function handleStatusFilterChange(value: ExportJobStatus | "ALL") {
    setStatusFilter(value);
    void loadJobs(1, pagination.pageSize, value);
  }

  function updateMapping(index: number, patch: Partial<ExportFieldMappingDTO>) {
    setMappings((current) =>
      current.map((mapping, mappingIndex) => (mappingIndex === index ? { ...mapping, ...patch } : mapping)),
    );
  }

  const mappingColumns: TableColumnsType<ExportFieldMappingDTO> = [
    {
      title: "导出",
      dataIndex: "selected",
      width: 70,
      render: (value: boolean, _record, index) => (
        <Checkbox checked={value} onChange={(event) => updateMapping(index, { selected: event.target.checked })} />
      ),
    },
    {
      title: "字段",
      key: "field",
      render: (_, mapping) => {
        const sourceMeta = exportFieldSourceMeta[mapping.source];
        return (
          <Space direction="vertical" size={4}>
            <Space size={6} wrap>
              <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
              <Typography.Text strong>{mapping.label ?? mapping.path}</Typography.Text>
            </Space>
            <Typography.Text type="secondary" className="labelhub-export-field-path">
              {mapping.path}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: "输出字段名",
      dataIndex: "outputKey",
      width: 220,
      render: (value: string, _record, index) => (
        <Input
          value={value}
          status={value.trim() ? undefined : "error"}
          onChange={(event) => updateMapping(index, { outputKey: event.target.value.trim() })}
        />
      ),
    },
  ];

  const jobColumns: TableColumnsType<ExportJobVO> = [
    {
      title: "导出任务",
      key: "job",
      render: (_, job) => (
        <Space direction="vertical" size={4}>
          <Space size={6} wrap>
            <Typography.Text strong>{exportFormatMeta[job.format].label} 导出</Typography.Text>
            <Tag color={exportJobStatusMeta[job.status].color}>{exportJobStatusMeta[job.status].label}</Tag>
            {job.isStale && <Tag color="orange">异常等待</Tag>}
          </Space>
          <Typography.Text type="secondary" className="labelhub-mono-id">
            {shortId(job.id)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "状态",
      width: 150,
      render: (_, job) => {
        if (job.isStale) {
          return (
            <Space direction="vertical" size={2}>
              <Typography.Text type="warning">可重新生成</Typography.Text>
              <Typography.Text type="secondary">超过 10 分钟未产出文件</Typography.Text>
            </Space>
          );
        }
        if (job.status === "FAILED") {
          return <Typography.Text type="danger">生成失败</Typography.Text>;
        }
        if (job.status === "SUCCEEDED") {
          return <Typography.Text type="success">文件就绪</Typography.Text>;
        }
        return <Typography.Text type="secondary">等待系统处理</Typography.Text>;
      },
    },
    {
      title: "进度",
      width: 190,
      render: (_, job) => {
        const percent = job.totalRows > 0 ? Math.round((job.exportedRows / job.totalRows) * 100) : 0;
        const progressStatus = job.status === "FAILED" || job.isStale ? "exception" : job.status === "SUCCEEDED" ? "success" : "active";
        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <Progress percent={percent} size="small" status={progressStatus} />
            <Typography.Text type="secondary">{job.exportedRows} / {job.totalRows} 行 · {formatDuration(job.durationSeconds)}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: "字段",
      width: 110,
      render: (_, job) => `${job.fieldMappings.length} 个字段`,
    },
    {
      title: "最近更新",
      dataIndex: "updatedAt",
      width: 170,
      render: (value: string) => formatTaskTime(value),
    },
    {
      title: "文件 / 失败原因",
      key: "file",
      width: 240,
      render: (_, job) =>
        job.fileName ? (
          <Space direction="vertical" size={2}>
            <Typography.Text>{job.fileName}</Typography.Text>
            <Typography.Text type="secondary">{formatFileSize(job.fileSizeBytes ?? 0)}</Typography.Text>
          </Space>
        ) : job.isStale ? (
          <Typography.Paragraph type="warning" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
            导出任务异常等待，建议重新生成。
          </Typography.Paragraph>
        ) : job.status === "FAILED" ? (
          <Typography.Paragraph type="danger" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
            {job.errorMessage ?? "文件生成失败"}
          </Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary">正在生成</Typography.Text>
        ),
    },
    {
      title: "操作",
      width: 190,
      render: (_, job) => (
        <Space wrap size={6}>
          <Tooltip title={job.canDownload ? "下载导出文件" : "文件生成完成后可下载"}>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              disabled={!job.canDownload}
              loading={downloadingJobId === job.id}
              onClick={() => void handleDownloadJob(job)}
            >
              下载
            </Button>
          </Tooltip>
          <Tooltip title={job.canRetry ? "按原导出参数重新生成文件" : "仅失败或异常等待任务可重新生成"}>
            <Button
              size="small"
              icon={<RedoOutlined />}
              disabled={!job.canRetry}
              loading={retryingJobId === job.id}
              onClick={() => void handleRetryJob(job)}
            >
              重新生成
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (error) {
    return <Alert showIcon type="warning" message="导出中心加载失败" description={error} />;
  }

  if (!task) {
    return <Empty description="未找到任务导出上下文" />;
  }

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Card className="labelhub-export-hero">
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <div>
            <Space wrap style={{ marginBottom: 12 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/tasks")}>
                返回任务管理
              </Button>
              <Button onClick={() => navigate(`/owner/tasks/${task.id}/acceptance`)}>数据验收</Button>
              <Tag color="blue">阶段 5 导出</Tag>
            </Space>
            <Typography.Title level={2} style={{ margin: 0 }}>
              导出中心
            </Typography.Title>
            <Typography.Text type="secondary">
              只导出人工审核通过的数据；字段映射会随导出任务冻结，后续文件生成按该快照执行。
            </Typography.Text>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={creationDisabled} onClick={openCreateDrawer}>
              创建导出任务
            </Button>
          </Space>
        </Flex>
      </Card>

      <div className="labelhub-export-summary-grid">
        <Card>
          <Statistic title="可导出数据" value={approvedCount} suffix="行" />
          <Typography.Text type="secondary">
            {latestApprovedAt ? `最近通过 ${formatTaskTime(latestApprovedAt)}` : "暂无审核通过数据"}
          </Typography.Text>
        </Card>
        <Card>
          <Statistic title="可选字段" value={fieldOptions.length} suffix="个" />
          <Typography.Text type="secondary">原始数据、标注结果、审核元数据</Typography.Text>
        </Card>
        <Card>
          <Statistic title="导出任务" value={pagination.totalItems} suffix="个" />
          <Typography.Text type="secondary">
            {latestJob ? `最近创建 ${formatTaskTime(latestJob.createdAt)}` : "尚未创建导出任务"}
          </Typography.Text>
        </Card>
        <Card>
          <Statistic title="默认格式" value={exportFormatMeta[format].label} />
          <Typography.Text type="secondary">{exportFormatMeta[format].description}</Typography.Text>
        </Card>
      </div>

      {creationDisabled && (
        <Alert
          showIcon
          type={approvedCount === 0 ? "warning" : "info"}
          message={approvedCount === 0 ? "当前任务暂无可导出的通过数据" : "当前任务暂无可选导出字段"}
          description="请先完成标注提交、AI 预审与人工审核通过，再创建导出任务。"
        />
      )}

      <div className="labelhub-export-grid">
        <Card
          title="字段选项"
          extra={<Tag>{fieldOptions.length} 个字段</Tag>}
          className="labelhub-export-card"
        >
          {fieldOptions.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可导出字段" />
          ) : (
            <div className="labelhub-export-field-list">
              {fieldOptions.map((option) => {
                const sourceMeta = exportFieldSourceMeta[option.source];
                return (
                  <div key={`${option.source}:${option.path}`} className="labelhub-export-field-item">
                    <Flex justify="space-between" align="flex-start" gap={12}>
                      <Space direction="vertical" size={4}>
                        <Space size={6} wrap>
                          <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag>
                          <Typography.Text strong>{option.label}</Typography.Text>
                          {option.defaultSelected && <Tag color="green">默认选中</Tag>}
                        </Space>
                        <Typography.Text type="secondary" className="labelhub-export-field-path">
                          {option.path}
                        </Typography.Text>
                        <Typography.Text type="secondary" className="labelhub-export-sample">
                          样例：{formatSampleValue(option.sampleValue)}
                        </Typography.Text>
                      </Space>
                    </Flex>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="创建导出" className="labelhub-export-card">
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Alert
              showIcon
              type="info"
              message="当前阶段会立即生成真实导出文件，完成后可在历史中下载。"
              description="CSV/Excel 中的数组和对象会以紧凑 JSON 字符串输出，字段顺序和字段名来自导出映射快照。"
            />
            <div>
              <Typography.Text type="secondary">导出格式</Typography.Text>
              <Select
                value={format}
                options={exportFormatOptions}
                onChange={(value: ExportFormat) => setFormat(value)}
                style={{ width: "100%", marginTop: 8 }}
              />
            </div>
            <div className="labelhub-export-create-stats">
              <Statistic title="将导出" value={approvedCount} suffix="行" />
              <Statistic title="默认字段" value={fieldOptions.filter((item) => item.defaultSelected).length} suffix="个" />
            </div>
            <Button type="primary" icon={<PlusOutlined />} block disabled={creationDisabled} onClick={openCreateDrawer}>
              配置并创建导出任务
            </Button>
          </Space>
        </Card>
      </div>

      <Card
        title="导出任务历史"
        className="labelhub-table-card"
        extra={
          <Space wrap>
            <Select
              value={statusFilter}
              options={exportStatusOptions}
              onChange={handleStatusFilterChange}
              style={{ width: 140 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadJobs(pagination.page, pagination.pageSize)}>
              刷新历史
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={jobsLoading}
          columns={jobColumns}
          dataSource={jobs}
          expandable={{
            rowExpandable: (job) => Boolean(job.errorMessage || job.isStale || job.fieldMappings.length),
            expandedRowRender: renderJobDetail,
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无导出任务" />,
          }}
          scroll={{ x: 1080 }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.totalItems,
            showSizeChanger: true,
            onChange: (page, pageSize) => void loadJobs(page, pageSize),
          }}
        />
      </Card>

      <Drawer
        title="配置导出字段"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        extra={
          <Button type="primary" loading={creating} onClick={() => void handleCreateExportJob()}>
            创建导出任务
          </Button>
        }
      >
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <Alert
            showIcon
            type="info"
            message={`将基于 ${approvedCount} 行人工审核通过数据创建导出任务。`}
            description="字段名用于生成导出文件表头或 JSON key；CSV/Excel 会将数组和对象字段序列化为 JSON 字符串。"
          />
          <Card size="small">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Flex gap={12} wrap="wrap">
                <div className="labelhub-export-control">
                  <Typography.Text type="secondary">格式</Typography.Text>
                  <Select value={format} options={exportFormatOptions} onChange={(value: ExportFormat) => setFormat(value)} style={{ width: 180 }} />
                </div>
                <div className="labelhub-export-control">
                  <Typography.Text type="secondary">附带审核记录</Typography.Text>
                  <Switch checked={includeReviewRecords} onChange={setIncludeReviewRecords} />
                </div>
                <div className="labelhub-export-control">
                  <Typography.Text type="secondary">附带审计时间线</Typography.Text>
                  <Switch checked={includeAuditTimeline} onChange={setIncludeAuditTimeline} />
                </div>
              </Flex>
              <Typography.Text type="secondary">
                已选择 {selectedMappings.length} 个字段，预计生成 {approvedCount} 行。
              </Typography.Text>
            </Space>
          </Card>
          <Table
            rowKey={(record) => `${record.source}:${record.path}`}
            size="small"
            columns={mappingColumns}
            dataSource={mappings}
            pagination={false}
          />
        </Space>
      </Drawer>
    </Space>
  );
}

function buildMappingRows(options: ExportFieldOptionVO[]): ExportFieldMappingDTO[] {
  const usedKeys = new Set<string>();
  return options.map((option, index) => {
    const baseKey = toOutputKey(option);
    const outputKey = uniqueOutputKey(baseKey, usedKeys);
    return {
      source: option.source,
      path: option.path,
      outputKey,
      label: option.label,
      order: index,
      selected: option.defaultSelected,
    };
  });
}

function renderJobDetail(job: ExportJobVO) {
  const selectedFields = job.fieldMappings
    .filter((mapping) => mapping.selected)
    .sort((left, right) => left.order - right.order);
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {(job.errorMessage || job.isStale) && (
        <Alert
          showIcon
          type={job.status === "FAILED" ? "error" : "warning"}
          message={job.status === "FAILED" ? "导出失败" : "导出任务异常等待"}
          description={
            job.errorMessage ??
            "该任务长时间停留在等待或生成中，可能由服务重启或旧版本异常导致，可按原导出参数重新生成。"
          }
        />
      )}
      <div className="labelhub-export-job-detail-grid">
        <div>
          <Typography.Text type="secondary">导出参数快照</Typography.Text>
          <div className="labelhub-export-job-tags">
            <Tag>{exportFormatMeta[job.format].label}</Tag>
            {job.includeReviewRecords && <Tag color="purple">包含审核记录</Tag>}
            {job.includeAuditTimeline && <Tag color="orange">包含审计时间线</Tag>}
            <Tag>{selectedFields.length} 个字段</Tag>
          </div>
        </div>
        <div>
          <Typography.Text type="secondary">字段映射</Typography.Text>
          <div className="labelhub-export-job-fields">
            {selectedFields.slice(0, 8).map((mapping) => (
              <Tag key={`${mapping.source}:${mapping.path}:${mapping.outputKey}`}>
                {mapping.outputKey}
              </Tag>
            ))}
            {selectedFields.length > 8 && <Tag>+{selectedFields.length - 8}</Tag>}
          </div>
        </div>
      </div>
    </Space>
  );
}

function uniqueOutputKey(rawKey: string, usedKeys: Set<string>): string {
  let candidate = rawKey;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${rawKey}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
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

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds === null || Number.isNaN(durationSeconds)) return "耗时待定";
  if (durationSeconds < 1) return "< 1 秒";
  if (durationSeconds < 60) return `${durationSeconds.toFixed(durationSeconds < 10 ? 1 : 0)} 秒`;
  return `${Math.floor(durationSeconds / 60)} 分 ${Math.round(durationSeconds % 60)} 秒`;
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}
