import {
  ArrowLeftOutlined,
  AuditOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import {
  getReviewConfigDraft,
  listReviewConfigVersions,
  publishReviewConfigVersion,
  saveReviewConfigDraft,
} from "../features/review-config/api";
import type {
  ReviewConfigDraftVO,
  ReviewConfigVersionVO,
  ReviewDimensionDTO,
  ReviewThresholdDTO,
} from "../features/review-config/types";
import {
  buildDefaultReviewOutputSchema,
  calculateReviewMaxScore,
  formatJsonObject,
  normalizeReviewDimensions,
  parseJsonObject,
  reviewConfigVersionStatusMeta,
  validateReviewThresholds,
} from "../features/review-config/view";
import { getTask } from "../features/tasks/api";
import type { TaskDetailVO } from "../features/tasks/types";
import { formatTaskTime, taskStatusMeta } from "../features/tasks/view";
import { ApiClientError } from "../shared/api/client";
import type { JsonObject, PaginationVO } from "../shared/types/api";
import { OwnerPublishCheckDrawer } from "./OwnerPublishCheckDrawer";

interface OwnerTaskReviewConfigPageProps {
  taskId: string;
}

interface ReviewConfigFormValues {
  promptTemplate: string;
  dimensions: ReviewDimensionDTO[];
  passMinScore: number;
  humanReviewMinScore?: number | null;
  returnBelowScore: number;
  outputSchemaText: string;
  versionNote?: string;
}

const newDimension: ReviewDimensionDTO = {
  key: "new_dimension",
  name: "新评分维度",
  description: null,
  maxScore: 100,
  weight: 1,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.payload?.error.message ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function toFormValues(draft: ReviewConfigDraftVO): ReviewConfigFormValues {
  return {
    promptTemplate: draft.promptTemplate,
    dimensions: draft.dimensions,
    passMinScore: draft.thresholds.passMinScore,
    humanReviewMinScore: draft.thresholds.humanReviewMinScore ?? null,
    returnBelowScore: draft.thresholds.returnBelowScore,
    outputSchemaText: formatJsonObject(draft.outputSchema),
    versionNote: "",
  };
}

function buildDraftPayload(values: ReviewConfigFormValues): {
  promptTemplate: string;
  dimensions: ReviewDimensionDTO[];
  thresholds: ReviewThresholdDTO;
  outputSchema: JsonObject;
} {
  const dimensions = normalizeReviewDimensions(values.dimensions ?? []);
  const duplicateKey = dimensions.find(
    (dimension, index) => dimensions.findIndex((item) => item.key === dimension.key) !== index,
  );
  if (duplicateKey) {
    throw new Error(`评分维度 key「${duplicateKey.key}」重复，请保持唯一。`);
  }
  const thresholds = {
    passMinScore: values.passMinScore,
    humanReviewMinScore: values.humanReviewMinScore ?? null,
    returnBelowScore: values.returnBelowScore,
  };
  const thresholdError = validateReviewThresholds({ thresholds, dimensions });
  if (thresholdError) {
    throw new Error(thresholdError);
  }

  let outputSchema: JsonObject;
  try {
    outputSchema = parseJsonObject(values.outputSchemaText);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "输出 Schema 不是合法 JSON。");
  }

  return {
    promptTemplate: values.promptTemplate.trim(),
    dimensions,
    thresholds,
    outputSchema,
  };
}

export function OwnerTaskReviewConfigPage({ taskId }: OwnerTaskReviewConfigPageProps) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<ReviewConfigFormValues>();
  const watchedDimensions = Form.useWatch("dimensions", form);
  const dimensions = useMemo(() => watchedDimensions ?? [], [watchedDimensions]);
  const [task, setTask] = useState<TaskDetailVO | null>(null);
  const [draft, setDraft] = useState<ReviewConfigDraftVO | null>(null);
  const [versions, setVersions] = useState<ReviewConfigVersionVO[]>([]);
  const [versionPagination, setVersionPagination] = useState<PaginationVO>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishCheckOpen, setPublishCheckOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const canEdit = task?.status === "DRAFT";
  const maxScore = useMemo(
    () => Number(calculateReviewMaxScore(normalizeReviewDimensions(dimensions)).toFixed(2)),
    [dimensions],
  );

  const loadVersions = useCallback(
    async (page = 1, pageSize = 10) => {
      const response = await listReviewConfigVersions(taskId, { page, pageSize });
      setVersions(response.data);
      setVersionPagination(response.pagination);
    },
    [taskId],
  );

  useEffect(() => {
    let ignore = false;
    const loadInitialPage = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextTask, nextDraft, versionResponse] = await Promise.all([
          getTask(taskId),
          getReviewConfigDraft(taskId),
          listReviewConfigVersions(taskId, { page: 1, pageSize: versionPagination.pageSize }),
        ]);
        if (ignore) {
          return;
        }
        setTask(nextTask);
        setDraft(nextDraft);
        setVersions(versionResponse.data);
        setVersionPagination(versionResponse.pagination);
        form.setFieldsValue(toFormValues(nextDraft));
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
    void loadInitialPage();
    return () => {
      ignore = true;
    };
  }, [form, reloadToken, taskId, versionPagination.pageSize]);

  async function saveCurrentDraft(): Promise<ReviewConfigDraftVO> {
    const values = await form.validateFields();
    const payload = buildDraftPayload(values);
    const nextDraft = await saveReviewConfigDraft(taskId, payload);
    setDraft(nextDraft);
    form.setFieldsValue(toFormValues(nextDraft));
    return nextDraft;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveCurrentDraft();
      message.success("审核配置草稿已保存");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      message.error(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const versionNote = form.getFieldValue("versionNote")?.trim() || null;
      const savedDraft = await saveCurrentDraft();
      const version = await publishReviewConfigVersion(taskId, {
        draftId: savedDraft.id,
        versionNote,
      });
      message.success(`审核配置 v${version.versionNo} 已发布`);
      form.setFieldValue("versionNote", "");
      const nextTask = await getTask(taskId);
      setTask(nextTask);
      await loadVersions(1, versionPagination.pageSize);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      message.error(getErrorMessage(requestError));
    } finally {
      setPublishing(false);
    }
  }

  function handleGenerateSchema() {
    const normalizedDimensions = normalizeReviewDimensions(form.getFieldValue("dimensions") ?? []);
    if (normalizedDimensions.length === 0) {
      message.warning("请至少保留一个评分维度。");
      return;
    }
    form.setFieldValue("outputSchemaText", formatJsonObject(buildDefaultReviewOutputSchema(normalizedDimensions)));
    message.success("已按当前维度生成默认输出 Schema");
  }

  const versionColumns: TableColumnsType<ReviewConfigVersionVO> = [
    {
      title: "版本",
      dataIndex: "versionNo",
      width: 90,
      render: (value: number) => <Typography.Text strong>v{value}</Typography.Text>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: ReviewConfigVersionVO["status"]) => (
        <Tag color={reviewConfigVersionStatusMeta[value].color}>
          {reviewConfigVersionStatusMeta[value].label}
        </Tag>
      ),
    },
    {
      title: "维度",
      dataIndex: "dimensions",
      render: (value: ReviewDimensionDTO[]) => (
        <Space size={4} wrap>
          {value.map((dimension) => (
            <Tag key={dimension.key}>{dimension.name}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "阈值",
      dataIndex: "thresholds",
      width: 190,
      render: (value: ReviewThresholdDTO) => (
        <Typography.Text type="secondary">
          通过 {value.passMinScore} / 复核 {value.humanReviewMinScore ?? "-"} / 打回{" "}
          {value.returnBelowScore}
        </Typography.Text>
      ),
    },
    {
      title: "发布时间",
      dataIndex: "publishedAt",
      width: 170,
      render: (value: string) => formatTaskTime(value),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <Space wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/owner/tasks")}>
          返回列表
        </Button>
        <Button onClick={() => navigate(`/owner/tasks/${taskId}/settings`)}>任务设置</Button>
        <Button icon={<DatabaseOutlined />} onClick={() => navigate(`/owner/tasks/${taskId}/datasets`)}>
          数据集
        </Button>
        <Button icon={<FileProtectOutlined />} onClick={() => setPublishCheckOpen(true)}>
          发布检查
        </Button>
        {task && <Tag color={taskStatusMeta[task.status].color}>{taskStatusMeta[task.status].label}</Tag>}
      </Space>

      <Card>
        <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap">
          <Space direction="vertical" size={6}>
            <Typography.Title level={2} style={{ margin: 0 }}>
              审核配置
            </Typography.Title>
            <Typography.Text type="secondary">
              配置 AI 预审的 Prompt、评分维度、阈值和结构化输出版本，发布后供预审任务使用。
            </Typography.Text>
          </Space>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => setReloadToken((current) => current + 1)}>
              刷新
            </Button>
            <Button
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!canEdit}
              onClick={() => void handleSave()}
            >
              保存草稿
            </Button>
            <Button
              type="primary"
              icon={<AuditOutlined />}
              loading={publishing}
              disabled={!canEdit}
              onClick={() => void handlePublish()}
            >
              保存并发布版本
            </Button>
          </Space>
        </Flex>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}
      {task && !canEdit && (
        <Alert
          type="info"
          showIcon
          message="当前任务审核配置只读"
          description="只有草稿任务可编辑和发布审核配置版本。已发布任务会继续使用绑定版本。"
        />
      )}

      <Spin spinning={loading}>
        <div className="labelhub-review-grid">
          <Card className="labelhub-review-main-card">
            <Form<ReviewConfigFormValues>
              form={form}
              layout="vertical"
              disabled={!canEdit || saving || publishing}
              initialValues={{
                promptTemplate: "",
                dimensions: [newDimension],
                passMinScore: 0,
                humanReviewMinScore: null,
                returnBelowScore: 0,
                outputSchemaText: "{}",
                versionNote: "",
              }}
            >
              <Form.Item
                label="审核 Prompt 模板"
                name="promptTemplate"
                rules={[{ required: true, message: "请输入审核 Prompt 模板" }]}
              >
                <Input.TextArea
                  rows={7}
                  maxLength={8000}
                  showCount
                  placeholder="描述 AI 预审员应如何读取题目、提交内容和评分维度，并要求仅返回结构化 JSON"
                />
              </Form.Item>

              <Divider orientation="left">评分维度</Divider>
              <Form.List name="dimensions">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {fields.map(({ key, name }) => (
                      <div className="labelhub-review-dimension-row" key={key}>
                        <Form.Item
                          label="Key"
                          name={[name, "key"]}
                          rules={[{ required: true, message: "请输入 key" }]}
                        >
                          <Input placeholder="accuracy" />
                        </Form.Item>
                        <Form.Item
                          label="名称"
                          name={[name, "name"]}
                          rules={[{ required: true, message: "请输入名称" }]}
                        >
                          <Input placeholder="准确性" />
                        </Form.Item>
                        <Form.Item
                          label="满分"
                          name={[name, "maxScore"]}
                          rules={[{ required: true, message: "请输入满分" }]}
                        >
                          <InputNumber min={1} max={100} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                          label="权重"
                          name={[name, "weight"]}
                          rules={[{ required: true, message: "请输入权重" }]}
                        >
                          <InputNumber
                            min={0.1}
                            max={10}
                            step={0.1}
                            precision={2}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Button
                          aria-label="删除评分维度"
                          icon={<DeleteOutlined />}
                          disabled={fields.length <= 1}
                          onClick={() => remove(name)}
                        />
                        <Form.Item label="维度说明" name={[name, "description"]} className="labelhub-review-dimension-desc">
                          <Input placeholder="说明该维度关注的质量标准" />
                        </Form.Item>
                      </div>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={() => add({ ...newDimension, key: `dimension_${fields.length + 1}` })}>
                      新增维度
                    </Button>
                  </Space>
                )}
              </Form.List>

              <Divider orientation="left">阈值与结构化输出</Divider>
              <div className="labelhub-review-threshold-grid">
                <Form.Item
                  label="通过阈值"
                  name="passMinScore"
                  rules={[{ required: true, message: "请输入通过阈值" }]}
                >
                  <InputNumber min={0} max={Math.max(maxScore, 1)} step={0.5} precision={2} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="人工复核阈值" name="humanReviewMinScore">
                  <InputNumber min={0} max={Math.max(maxScore, 1)} step={0.5} precision={2} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item
                  label="打回阈值"
                  name="returnBelowScore"
                  rules={[{ required: true, message: "请输入打回阈值" }]}
                >
                  <InputNumber min={0} max={Math.max(maxScore, 1)} step={0.5} precision={2} style={{ width: "100%" }} />
                </Form.Item>
                <Card className="labelhub-review-score-card">
                  <Statistic title="当前加权最高分" value={maxScore} precision={maxScore % 1 === 0 ? 0 : 2} />
                </Card>
              </div>

              <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                <Typography.Text strong>
                  输出 Schema
                </Typography.Text>
                <Button icon={<CodeOutlined />} onClick={handleGenerateSchema}>
                  按当前维度生成
                </Button>
              </Flex>
              <Form.Item
                name="outputSchemaText"
                rules={[{ required: true, message: "请输入输出 Schema" }]}
                style={{ marginTop: 12 }}
              >
                <Input.TextArea
                  id="owner-review-output-schema"
                  className="labelhub-schema-editor"
                  rows={13}
                  spellCheck={false}
                />
              </Form.Item>

              <Divider orientation="left">版本说明</Divider>
              <Form.Item name="versionNote">
                <Input
                  id="owner-review-version-note"
                  maxLength={500}
                  placeholder="可选：说明本次发布调整了哪些审核标准"
                />
              </Form.Item>
            </Form>
          </Card>

          <Space direction="vertical" size={16} className="labelhub-review-side">
            <Card>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Typography.Text strong>配置状态</Typography.Text>
                <Statistic
                  title="当前审核配置版本"
                  value={task?.currentReviewConfigVersionId ? "已绑定" : "未发布"}
                />
                <Statistic title="评分维度" value={dimensions.length} suffix="个" />
                <Typography.Text type="secondary">
                  最近保存：{draft ? formatTaskTime(draft.updatedAt) : "暂无"}
                </Typography.Text>
              </Space>
            </Card>
            <Card className="labelhub-system-note">
              <Typography.Text>
                发布后的审核配置会作为 AI 预审和人工复核的稳定依据，历史版本不会被草稿修改影响。
              </Typography.Text>
            </Card>
          </Space>
        </div>
      </Spin>

      <Card className="labelhub-table-card">
        <Table
          rowKey="id"
          columns={versionColumns}
          dataSource={versions}
          scroll={{ x: 980 }}
          pagination={{
            current: versionPagination.page,
            pageSize: versionPagination.pageSize,
            total: versionPagination.totalItems,
            showTotal: (total) => `共 ${total} 个版本`,
            onChange: (page, pageSize) => void loadVersions(page, pageSize),
          }}
        />
      </Card>

      <OwnerPublishCheckDrawer
        taskId={taskId}
        open={publishCheckOpen}
        onClose={() => setPublishCheckOpen(false)}
        onPublished={setTask}
      />
    </Space>
  );
}
