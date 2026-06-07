import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Input, Pagination, Select, Space, Statistic, Tag, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { listReviews } from "../features/reviews/api";
import type { AiReviewConclusion, ReviewStatus, ReviewVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  buildReviewerReviewDetailPath,
  formatAiScoreTotal,
  formatReviewConfigVersion,
  formatReviewTraceCode,
  formatSubmissionVersion,
  reviewStatusMeta,
} from "../features/reviews/view";
import { formatTaskTime } from "../features/tasks/view";

const reviewPageSize = 20;
const reviewStatusOptions: Array<{ label: string; value: ReviewStatus | "ALL" }> = [
  { label: "全部审核状态", value: "ALL" },
  { label: "待人工审核", value: "PENDING_HUMAN_REVIEW" },
  { label: "已通过", value: "APPROVED" },
  { label: "已打回", value: "RETURNED" },
];
const aiConclusionOptions: Array<{ label: string; value: AiReviewConclusion | "ALL" }> = [
  { label: "全部 AI 结论", value: "ALL" },
  { label: aiConclusionMeta.PASS.label, value: "PASS" },
  { label: aiConclusionMeta.RETURN.label, value: "RETURN" },
  { label: aiConclusionMeta.NEEDS_HUMAN_REVIEW.label, value: "NEEDS_HUMAN_REVIEW" },
];

interface ReviewQueueState {
  reviews: ReviewVO[];
  totalReviews: number;
}

export function ReviewerReviewQueuePage() {
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | "ALL">("PENDING_HUMAN_REVIEW");
  const [aiConclusion, setAiConclusion] = useState<AiReviewConclusion | "ALL">("ALL");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [state, setState] = useState<ReviewQueueState>({ reviews: [], totalReviews: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reviewResultPage = await listReviews({
        page: reviewPage,
        pageSize: reviewPageSize,
        status: reviewStatus === "ALL" ? undefined : reviewStatus,
        aiConclusion: aiConclusion === "ALL" ? undefined : aiConclusion,
        keyword: keyword.trim() || undefined,
      });
      setState({ reviews: reviewResultPage.data, totalReviews: reviewResultPage.pagination.totalItems });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "人工审核队列暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [aiConclusion, keyword, reviewPage, reviewStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => buildReviewStats(state.reviews), [state.reviews]);
  const triggerSearch = () => {
    const nextKeyword = keywordInput.trim();
    setReviewPage(1);
    setKeyword(nextKeyword);
    if (reviewPage === 1 && keyword === nextKeyword) {
      void load();
    }
  };

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 6 }}>
            人工审核
          </Typography.Title>
          <Typography.Text type="secondary">
            按 AI 预审建议进入人工终审，查看提交快照、评分维度、多轮历史与差异后再决定通过或打回。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<ThunderboltOutlined />} onClick={() => navigate("/reviewer/ai-review-queue")}>
            AI 预审队列
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-reviewer-summary-grid">
        <Card className="labelhub-stat-card">
          <Statistic title="待审记录" value={state.totalReviews} prefix={<AuditOutlined />} />
          <Typography.Text type="secondary">当前筛选下待处理记录</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="建议通过" value={stats.pass} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#13a867" }} />
          <Typography.Text type="secondary">仍需 Reviewer 终审确认</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="建议打回" value={stats.return} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#d46b08" }} />
          <Typography.Text type="secondary">优先核对问题字段与差异</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="建议人工复核" value={stats.manual} valueStyle={{ color: "#7c3aed" }} />
          <Typography.Text type="secondary">模型不确定或需要人工兜底</Typography.Text>
        </Card>
      </div>

      <Card className="labelhub-reviewer-filter-card">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              allowClear
              id="manual-review-keyword"
              name="keyword"
              aria-label="搜索任务标题或 ID"
              prefix={<SearchOutlined />}
              placeholder="搜索任务标题或 ID"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onPressEnter={triggerSearch}
              style={{ width: 280 }}
            />
            <Select
              id="manual-review-status"
              value={reviewStatus}
              options={reviewStatusOptions}
              onChange={(value) => {
                setReviewPage(1);
                setReviewStatus(value);
              }}
              style={{ width: 172 }}
            />
            <Select
              id="manual-review-ai-conclusion"
              value={aiConclusion}
              options={aiConclusionOptions}
              onChange={(value) => {
                setReviewPage(1);
                setAiConclusion(value);
              }}
              style={{ width: 172 }}
            />
            <Button type="primary" ghost onClick={triggerSearch}>
              查询
            </Button>
          </Space>
          <Typography.Text type="secondary">AI 建议用于提效和提示风险，最终结论由人工审核员确认。</Typography.Text>
        </Flex>
      </Card>

      {error && <Alert showIcon type="warning" message="人工审核队列加载失败" description={error} />}

      <div className="labelhub-reviewer-workbench-grid">
        <Card className="labelhub-reviewer-queue-card" title="待人工复核记录" loading={loading}>
          {state.reviews.length === 0 ? (
            <Empty description="当前筛选下暂无待审记录。" />
          ) : (
            <div className="labelhub-reviewer-job-list">
              {state.reviews.map((review) => (
                <ReviewRecordRow key={review.id} review={review} />
              ))}
              {state.totalReviews > reviewPageSize && (
                <Flex justify="flex-end" className="labelhub-reviewer-pagination">
                  <Pagination
                    current={reviewPage}
                    pageSize={reviewPageSize}
                    total={state.totalReviews}
                    showSizeChanger={false}
                    showTotal={(total) => `共 ${total} 条审核记录`}
                    onChange={setReviewPage}
                  />
                </Flex>
              )}
            </div>
          )}
        </Card>

        <Space direction="vertical" size={16} className="labelhub-reviewer-side">
          <Card title="审核动作说明">
            <Space direction="vertical" size={12}>
              <GuidanceLine title="先看 AI 建议" description="总分、问题字段和摘要用于定位风险，不能代替人工判断。" />
              <GuidanceLine title="再看提交差异" description="返修后的二次提交需要重点核对修改点是否回应上一轮意见。" />
              <GuidanceLine title="最后写结论" description="通过或打回会在后续粒度写入状态机，并同步给标注员工作台。" />
            </Space>
          </Card>
          <Card title="快捷入口">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Button block onClick={() => navigate("/reviewer/ai-review-queue")}>
                AI 预审队列
              </Button>
              <Button block onClick={() => navigate("/reviewer/results")}>
                审核结果
              </Button>
            </Space>
          </Card>
        </Space>
      </div>
    </Space>
  );
}

function ReviewRecordRow({ review }: { review: ReviewVO }) {
  const status = reviewStatusMeta[review.status];
  const conclusion = review.aiConclusion ? aiConclusionMeta[review.aiConclusion] : null;
  return (
    <div
      className="labelhub-reviewer-job-row"
      data-tone={conclusion?.color === "orange" ? "orange" : conclusion?.color === "green" ? "green" : "blue"}
    >
      <div className="labelhub-reviewer-job-main">
        <Flex align="center" gap={10} wrap="wrap">
          <Typography.Text strong className="labelhub-reviewer-job-title">
            {review.taskTitle || "未命名任务"}
          </Typography.Text>
          <Tag color={status.color}>{status.label}</Tag>
          {conclusion && <Tag color={conclusion.color}>{conclusion.label}</Tag>}
        </Flex>
        <Space size={[6, 6]} wrap style={{ marginTop: 8 }}>
          <Tag color="blue">{formatSubmissionVersion(review.submissionVersion)}</Tag>
          <Tag>{formatReviewConfigVersion(review.reviewConfigVersionNo)}</Tag>
          <Tag>第 {review.reviewRound} 轮</Tag>
          <Tag>总分 {formatAiScoreTotal(review.aiScoreTotal)}</Tag>
          <Tag color={review.aiIssueCount > 0 ? "orange" : "green"}>问题 {review.aiIssueCount}</Tag>
        </Space>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "8px 0 0" }}>
          {review.aiComment || "AI 暂无评语，建议进入详情查看上下文。"}
        </Typography.Paragraph>
      </div>
      <div className="labelhub-reviewer-job-meta">
        <span>更新 {formatTaskTime(review.updatedAt)}</span>
        <Typography.Text type="secondary" copyable={{ text: review.id, tooltips: ["复制审核记录 ID", "已复制"] }}>
          审核流水 {formatReviewTraceCode(review.id)}
        </Typography.Text>
        <Button size="small" type="primary" onClick={() => navigate(buildReviewerReviewDetailPath(review.id))}>
          进入复核
        </Button>
      </div>
    </div>
  );
}

function GuidanceLine({ title, description }: { title: string; description: string }) {
  return (
    <div className="labelhub-reviewer-step">
      <span>
        <AuditOutlined />
      </span>
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <br />
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
    </div>
  );
}

function buildReviewStats(reviews: ReviewVO[]) {
  return reviews.reduce(
    (acc, review) => {
      if (review.aiConclusion === "PASS") acc.pass += 1;
      if (review.aiConclusion === "RETURN") acc.return += 1;
      if (review.aiConclusion === "NEEDS_HUMAN_REVIEW") acc.manual += 1;
      return acc;
    },
    { pass: 0, return: 0, manual: 0 },
  );
}
