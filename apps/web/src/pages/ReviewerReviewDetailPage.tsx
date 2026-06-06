import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Empty, Flex, Progress, Skeleton, Space, Tag, Timeline, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { getReviewDetail } from "../features/reviews/api";
import type { ReviewDetailVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  formatAiScoreTotal,
  formatReviewConfigVersion,
  formatSubmissionVersion,
  reviewStatusMeta,
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getReviewDetail(reviewId)
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "审核详情暂时不可用。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (error) {
    return <Alert showIcon type="warning" message="审核详情加载失败" description={error} />;
  }

  if (!detail) {
    return <Empty description="未找到审核记录" />;
  }

  return <ReviewerReviewDetailContent detail={detail} />;
}

function ReviewerReviewDetailContent({ detail }: { detail: ReviewDetailVO }) {
  const { review, task, submission, datasetItemPayload, templateSchema, reviewConfigVersion, promptSnapshotSummary } = detail;
  const readonlyValue = useMemo(() => submission.values as TemplateSubmissionValue, [submission.values]);
  const reviewSchema = useMemo(() => removeLlmActionComponents(templateSchema), [templateSchema]);
  const conclusion = review.aiConclusion ? aiConclusionMeta[review.aiConclusion] : null;

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Card className="labelhub-review-detail-head">
        <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
          <Space direction="vertical" size={8}>
            <Space wrap>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/reviewer/reviews")}>
                返回审核工作台
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
                AI 建议已生成，当前仍等待 Reviewer 人工复核；阶段 4.5 会开放通过与打回决策。
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
                const percent = Math.min(100, Math.round((score / dimension.maxScore) * 100));
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
                      format={() => `${score}/${dimension.maxScore}`}
                    />
                  </div>
                );
              })}
            </Space>
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
              <Descriptions.Item label="审核状态">{reviewStatusMeta[review.status].label}</Descriptions.Item>
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

          <Card title="审计时间线">
            <Timeline
              items={detail.timeline.map((item) => ({
                dot: timelineIcon(item.action),
                children: (
                  <div>
                    <Typography.Text strong>{formatAuditAction(item.action)}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">
                      {item.actorRole} · {formatTaskTime(item.createdAt)}
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
            <Alert
              type="info"
              showIcon
              message="阶段 4.5 启用"
              description="当前阶段只展示 AI 建议与审核上下文，不提前写入人工通过或打回状态。"
            />
            <Flex gap={10} style={{ marginTop: 12 }}>
              <Button block disabled>
                打回
              </Button>
              <Button block type="primary" disabled>
                通过
              </Button>
            </Flex>
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

function timelineIcon(action: string) {
  if (action === "REVIEW_AI_SUGGESTION") {
    return <ThunderboltOutlined style={{ color: "#7c3aed" }} />;
  }
  if (action === "SUBMISSION_CREATE") {
    return <FileTextOutlined style={{ color: "#3370ff" }} />;
  }
  if (action === "REVIEW_JOB_RESULT") {
    return <CheckCircleOutlined style={{ color: "#13a867" }} />;
  }
  return <ClockCircleOutlined style={{ color: "#646a73" }} />;
}

function formatAuditAction(action: string): string {
  const labels: Record<string, string> = {
    ASSIGNMENT_CLAIM: "领取题目",
    ASSIGNMENT_DRAFT_SAVE: "草稿保存",
    SUBMISSION_CREATE: "标注员提交",
    REVIEW_JOB_CREATE: "进入 AI 预审队列",
    REVIEW_JOB_CLAIM: "Agent 领取任务",
    REVIEW_JOB_RESULT: "Agent 写回结果",
    REVIEW_AI_SUGGESTION: "AI 建议生成",
  };
  return labels[action] ?? action;
}
