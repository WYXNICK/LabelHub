import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  Progress,
  Radio,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { AttachmentValue, isAttachmentValue } from "../features/files/AttachmentValue";
import { decideReview, getReviewDetail } from "../features/reviews/api";
import type { HumanReviewDecision, ReviewDetailVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  formatAiScoreTotal,
  formatReviewConfigVersion,
  formatReviewScorePercent,
  formatReviewTimelineAction,
  formatReviewTimelineActor,
  formatReviewValue,
  formatSubmissionVersion,
  getReviewerReviewDetailReturnTarget,
  getReviewTimelineDotColor,
  normalizeReviewScoreToPercent,
  reviewJobStatusMeta,
  reviewerAssignmentStatusMeta,
  reviewerSubmissionStatusMeta,
  reviewStateStepMeta,
  reviewStatusMeta,
  submissionDiffChangeMeta,
} from "../features/reviews/view";
import { TemplateRenderer } from "../features/templates/TemplateRenderer";
import type { TemplateLayoutNodeDTO, TemplateSchemaVO, TemplateSubmissionValue } from "../features/templates/types";
import { formatTaskTime } from "../features/tasks/view";

interface ReviewerReviewDetailPageProps {
  reviewId: string;
}

export function ReviewerReviewDetailPage({ reviewId }: ReviewerReviewDetailPageProps) {
  const [detail, setDetail] = useState<ReviewDetailVO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextDetail = await getReviewDetail(reviewId);
      setDetail(nextDetail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核详情暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (error) {
    return <Alert showIcon type="warning" message="审核详情加载失败" description={error} />;
  }

  if (!detail) {
    return <Empty description="未找到审核记录" />;
  }

  return <ReviewerReviewDetailContent detail={detail} onReload={load} />;
}

function ReviewerReviewDetailContent({ detail, onReload }: { detail: ReviewDetailVO; onReload: () => Promise<void> }) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<{ decision: HumanReviewDecision; reason?: string }>();
  const [submitting, setSubmitting] = useState(false);
  const {
    review,
    task,
    submission,
    datasetItemPayload,
    templateSchema,
    reviewConfigVersion,
    promptSnapshotSummary,
    stateLink,
    reviewHistory,
    submissionDiff,
  } = detail;
  const readonlyValue = useMemo(() => submission.values as TemplateSubmissionValue, [submission.values]);
  const reviewSchema = useMemo(() => removeLlmActionComponents(templateSchema), [templateSchema]);
  const conclusion = review.aiConclusion ? aiConclusionMeta[review.aiConclusion] : null;
  const selectedDecision = Form.useWatch("decision", form) ?? "APPROVE";
  const returnTarget = getReviewerReviewDetailReturnTarget(window.location.search, task.id);

  async function handleDecisionSubmit(values: { decision: HumanReviewDecision; reason?: string }) {
    setSubmitting(true);
    try {
      await decideReview(review.id, {
        decision: values.decision,
        reason: values.reason?.trim() || undefined,
        expectedVersion: review.version,
      });
      message.success(values.decision === "APPROVE" ? "已通过该提交" : "已打回并同步给标注员");
      await onReload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "人工审核决策提交失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Card className="labelhub-review-detail-head">
        <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
          <Space direction="vertical" size={8}>
            <Space wrap>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(returnTarget.path)}>
                {returnTarget.label}
              </Button>
              <Tag color={reviewStatusMeta[review.status].color}>{reviewStatusMeta[review.status].label}</Tag>
              <Tag color="blue">{formatSubmissionVersion(review.submissionVersion)}</Tag>
              <Tag>{formatReviewConfigVersion(review.reviewConfigVersionNo)}</Tag>
            </Space>
            <div>
              <Typography.Title level={2} style={{ margin: 0 }}>
                {task.title}
              </Typography.Title>
              <Typography.Text type="secondary">
                {stateLink.nextActionLabel}；请结合 AI 建议、提交快照和多轮历史给出最终人工结论。
              </Typography.Text>
            </div>
          </Space>
          <Space direction="vertical" size={6} className="labelhub-review-detail-head-meta">
            <Typography.Text type="secondary">提交版本</Typography.Text>
            <Typography.Text strong>{formatSubmissionVersion(submission.submissionVersion)}</Typography.Text>
            <Typography.Text type="secondary">更新时间 {formatTaskTime(review.updatedAt)}</Typography.Text>
          </Space>
        </Flex>
      </Card>

      <div className="labelhub-review-detail-grid">
        <Space direction="vertical" size={16} className="labelhub-review-detail-main">
          <Card title="原题与提交快照" extra={<Tag color="blue">不可变版本</Tag>}>
            <div className="labelhub-review-detail-renderer">
              <TemplateRenderer
                schema={reviewSchema}
                itemPayload={datasetItemPayload}
                value={readonlyValue}
                readonly
                onChange={() => undefined}
              />
            </div>
          </Card>

          <Card
            className="labelhub-review-ai-card"
            title={
              <Space>
                <ThunderboltOutlined />
                <span>AI 预审建议</span>
              </Space>
            }
            extra={conclusion ? <Tag color={conclusion.color}>{conclusion.label}</Tag> : <Tag>暂无结论</Tag>}
          >
            <div className="labelhub-review-ai-summary">
              <StatisticBlock label="加权总分" value={formatAiScoreTotal(review.aiScoreTotal)} />
              <StatisticBlock label="问题数" value={`${review.aiIssueCount}`} />
              <StatisticBlock label="审核轮次" value={`第 ${review.reviewRound} 轮`} />
            </div>
            <Typography.Paragraph style={{ marginTop: 14, marginBottom: 0 }}>{review.aiComment}</Typography.Paragraph>
            {review.aiSuggestions && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 12 }}
                message="AI 修订建议"
                description={review.aiSuggestions}
              />
            )}
          </Card>

          <Card title="维度评分">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {reviewConfigVersion.dimensions.map((dimension) => {
                const score = review.aiScores[dimension.key] ?? 0;
                const percent = normalizeReviewScoreToPercent(score, dimension.maxScore);
                return (
                  <div key={dimension.key} className="labelhub-review-score-row">
                    <div>
                      <Typography.Text strong>{dimension.name}</Typography.Text>
                      {dimension.description && (
                        <>
                          <br />
                          <Typography.Text type="secondary">{dimension.description}</Typography.Text>
                        </>
                      )}
                    </div>
                    <Progress
                      percent={percent}
                      size="small"
                      strokeColor={percent >= 80 ? "#13a867" : percent >= 60 ? "#ff8800" : "#ff4d4f"}
                      format={() => formatReviewScorePercent(score, dimension.maxScore)}
                    />
                  </div>
                );
              })}
            </Space>
          </Card>

          <Card title="本轮提交差异" extra={<Tag>{submissionDiff.length > 0 ? `${submissionDiff.length} 项变化` : "首轮或无变化"}</Tag>}>
            {submissionDiff.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前提交暂无可对比变化。" />
            ) : (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                {submissionDiff.map((item) => (
                  <div key={item.fieldKey} className="labelhub-review-diff-item">
                    <Flex align="center" justify="space-between" gap={8} wrap="wrap">
                      <Typography.Text strong>{item.label}</Typography.Text>
                      <Tag color={submissionDiffChangeMeta[item.changeType]?.color ?? "blue"}>
                        {submissionDiffChangeMeta[item.changeType]?.label ?? item.changeType}
                      </Tag>
                    </Flex>
                    <div className="labelhub-review-diff-grid">
                      <div>
                        <Typography.Text type="secondary">上一版</Typography.Text>
                        <ReviewDiffValue value={item.previousValue} />
                      </div>
                      <div>
                        <Typography.Text type="secondary">当前版</Typography.Text>
                        <ReviewDiffValue value={item.currentValue} />
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          <Card title="AI 问题列表">
            {review.aiIssues.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 未返回明确问题" />
            ) : (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                {review.aiIssues.map((issue, index) => (
                  <Alert
                    key={`${issue.code}-${index}`}
                    type={review.aiConclusion === "RETURN" ? "warning" : "info"}
                    showIcon
                    message={`${issue.field ?? "全局"} · ${issue.code}`}
                    description={issue.message}
                  />
                ))}
              </Space>
            )}
          </Card>
        </Space>

        <Space direction="vertical" size={16} className="labelhub-review-detail-side">
          <Card title="当前状态">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="当前节点">
                <Tag color={reviewStateStepMeta[stateLink.currentStep]?.color ?? "blue"}>
                  {reviewStateStepMeta[stateLink.currentStep]?.label ?? stateLink.currentStep}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="审核状态">{reviewStatusMeta[stateLink.reviewStatus].label}</Descriptions.Item>
              <Descriptions.Item label="AI 队列">
                {stateLink.reviewJobStatus ? reviewJobStatusMeta[stateLink.reviewJobStatus].label : "未关联"}
              </Descriptions.Item>
              <Descriptions.Item label="提交状态">
                <Tag color={reviewerSubmissionStatusMeta[stateLink.submissionStatus]?.color ?? "default"}>
                  {reviewerSubmissionStatusMeta[stateLink.submissionStatus]?.label ?? stateLink.submissionStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="作答状态">
                <Tag color={reviewerAssignmentStatusMeta[stateLink.assignmentStatus]?.color ?? "default"}>
                  {reviewerAssignmentStatusMeta[stateLink.assignmentStatus]?.label ?? stateLink.assignmentStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="AI 结论">{conclusion?.label ?? "暂无结论"}</Descriptions.Item>
              <Descriptions.Item label="任务">{task.title}</Descriptions.Item>
              <Descriptions.Item label="提交">{formatSubmissionVersion(submission.submissionVersion)}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="审核配置快照">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="版本">{formatReviewConfigVersion(reviewConfigVersion.versionNo)}</Descriptions.Item>
              <Descriptions.Item label="通过阈值">≥ {reviewConfigVersion.thresholds.passMinScore}</Descriptions.Item>
              <Descriptions.Item label="打回阈值">&lt; {reviewConfigVersion.thresholds.returnBelowScore}</Descriptions.Item>
              <Descriptions.Item label="维度数">{reviewConfigVersion.dimensions.length}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Prompt 摘要">
            {promptSnapshotSummary ? (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Tag color="purple">Prompt snapshot 已保存</Tag>
                <SummaryTagList title="可见题目字段" values={promptSnapshotSummary.templateFieldLabels} />
                <SummaryTagList title="提交字段" values={promptSnapshotSummary.submissionFieldKeys} />
                <SummaryTagList title="评分维度" values={promptSnapshotSummary.reviewDimensionNames} />
                <Typography.Text type="secondary">
                  完整 Prompt 快照已由后端保存用于审计追溯，页面默认只展示摘要，避免内部 ID 干扰审核判断。
                </Typography.Text>
              </Space>
            ) : (
              <Typography.Text type="secondary">失败兜底或历史记录暂无 Prompt 快照。</Typography.Text>
            )}
          </Card>

          <Card
            title={
              <Space>
                <HistoryOutlined />
                <span>多轮历史意见</span>
              </Space>
            }
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              {reviewHistory.map((item) => (
                <div key={item.submissionId} className="labelhub-review-history-item">
                  <Flex align="center" justify="space-between" gap={8} wrap="wrap">
                    <Typography.Text strong>{formatSubmissionVersion(item.submissionVersion)}</Typography.Text>
                    <Space size={4} wrap>
                      {item.aiConclusion && <Tag color={aiConclusionMeta[item.aiConclusion].color}>{aiConclusionMeta[item.aiConclusion].label}</Tag>}
                      <Tag>{item.reviewRound ? `第 ${item.reviewRound} 轮` : "未预审"}</Tag>
                    </Space>
                  </Flex>
                  <Typography.Text type="secondary">
                    提交于 {formatTaskTime(item.submittedAt)} · 总分 {formatAiScoreTotal(item.aiScoreTotal)} · 问题 {item.aiIssueCount}
                  </Typography.Text>
                  {item.aiComment && (
                    <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: "6px 0 0" }}>
                      {item.aiComment}
                    </Typography.Paragraph>
                  )}
                  {item.humanComment && (
                    <Alert type="warning" showIcon style={{ marginTop: 6 }} message="人工意见" description={item.humanComment} />
                  )}
                </div>
              ))}
            </Space>
          </Card>

          <Card title="关键流转时间线" extra={<Tag>过滤草稿</Tag>}>
            <Timeline
              items={detail.timeline.slice(-12).map((item) => ({
                dot: <ClockCircleOutlined style={{ color: getReviewTimelineDotColor(item) }} />,
                children: (
                  <div className="labelhub-reviewer-timeline-item">
                    <Flex justify="space-between" align="baseline" gap={8} wrap="nowrap">
                      <Typography.Text strong className="labelhub-reviewer-timeline-actor">
                        {formatReviewTimelineActor(item)}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="labelhub-reviewer-timeline-time">
                        {formatTaskTime(item.createdAt)}
                      </Typography.Text>
                    </Flex>
                    <Typography.Text className="labelhub-reviewer-timeline-action">
                      {formatReviewTimelineAction(item)}
                    </Typography.Text>
                    {item.reason && (
                      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "4px 0 0" }}>
                        {item.reason}
                      </Typography.Paragraph>
                    )}
                  </div>
                ),
              }))}
            />
          </Card>

          <Card title="人工决策">
            {review.status === "PENDING_HUMAN_REVIEW" ? (
              <Form
                form={form}
                layout="vertical"
                initialValues={{ decision: "APPROVE" }}
                onFinish={(values) => void handleDecisionSubmit(values)}
              >
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="人工结论是最终状态入口"
                  description="AI 结论只作为建议；通过会进入可验收数据，打回会同步给标注员返修。"
                />
                <Form.Item name="decision" label="审核结论" rules={[{ required: true, message: "请选择审核结论" }]}>
                  <Radio.Group optionType="button" buttonStyle="solid">
                    <Radio.Button value="APPROVE">通过</Radio.Button>
                    <Radio.Button value="RETURN">打回</Radio.Button>
                  </Radio.Group>
                </Form.Item>
                <Form.Item
                  name="reason"
                  label={selectedDecision === "RETURN" ? "打回理由" : "审核说明"}
                  rules={
                    selectedDecision === "RETURN"
                      ? [{ required: true, whitespace: true, message: "打回必须填写明确理由" }]
                      : []
                  }
                >
                  <Input.TextArea
                    rows={4}
                    maxLength={800}
                    showCount
                    placeholder={
                      selectedDecision === "RETURN"
                        ? "说明需要标注员返修的具体问题，例如缺少依据、字段选择错误或格式不符合要求。"
                        : "可选：记录通过原因或抽样备注。"
                    }
                  />
                </Form.Item>
                <Button block type="primary" htmlType="submit" loading={submitting}>
                  提交人工结论
                </Button>
              </Form>
            ) : (
              <Alert
                type={review.status === "APPROVED" ? "success" : "warning"}
                showIcon
                message={review.status === "APPROVED" ? "该记录已通过" : "该记录已打回"}
                description={review.humanComment || "人工审核已完成，不能重复提交决策。"}
              />
            )}
          </Card>
        </Space>
      </div>
    </Space>
  );
}

function StatisticBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="labelhub-review-stat-block">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {value}
      </Typography.Title>
    </div>
  );
}

function SummaryTagList({ title, values }: { title: string; values: string[] }) {
  const visibleValues = values.slice(0, 8);
  return (
    <div>
      <Typography.Text type="secondary">{title}</Typography.Text>
      <div className="labelhub-review-summary-tags">
        {visibleValues.length > 0 ? visibleValues.map((value) => <Tag key={value}>{value}</Tag>) : <Tag>未识别</Tag>}
        {values.length > visibleValues.length && <Tag>+{values.length - visibleValues.length}</Tag>}
      </div>
    </div>
  );
}

function ReviewDiffValue({ value }: { value: unknown }) {
  if (isAttachmentValue(value)) {
    return <AttachmentValue value={value} compact />;
  }
  return <pre>{formatReviewValue(value)}</pre>;
}

function removeLlmActionComponents(schema: TemplateSchemaVO): TemplateSchemaVO {
  const hiddenIds = new Set(schema.components.filter((component) => component.type === "LLM_ACTION").map((component) => component.id));
  if (hiddenIds.size === 0) {
    return schema;
  }
  return {
    ...schema,
    components: schema.components.filter((component) => !hiddenIds.has(component.id)),
    layout: { root: pruneLayoutNodes(schema.layout.root, hiddenIds) },
    llmActions: [],
  };
}

function pruneLayoutNodes(nodes: TemplateLayoutNodeDTO[], hiddenIds: Set<string>): TemplateLayoutNodeDTO[] {
  return nodes.flatMap((node): TemplateLayoutNodeDTO[] => {
    if (typeof node === "string") {
      return hiddenIds.has(node) ? [] : [node];
    }
    if (hiddenIds.has(node.componentId)) {
      return [];
    }
    return [
      {
        ...node,
        children: node.children ? pruneLayoutNodes(node.children, hiddenIds) : undefined,
        tabs: node.tabs?.map((tab) => ({ ...tab, children: pruneLayoutNodes(tab.children, hiddenIds) })),
      },
    ];
  });
}
