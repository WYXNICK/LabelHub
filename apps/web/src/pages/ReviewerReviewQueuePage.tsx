import {
  ApiOutlined,
  AuditOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Input, Pagination, Select, Space, Statistic, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { navigate } from "../app/routes";
import { listReviewJobs, listReviews } from "../features/reviews/api";
import type { AiReviewConclusion, ReviewJobStatus, ReviewJobVO, ReviewStatus, ReviewVO } from "../features/reviews/types";
import {
  aiConclusionMeta,
  buildReviewerReviewDetailPath,
  formatAiScoreTotal,
  formatReviewConfigVersion,
  formatReviewTraceCode,
  formatSubmissionVersion,
  reviewJobStatusMeta,
  reviewStatusMeta,
  truncateMiddle,
} from "../features/reviews/view";
import { formatTaskTime } from "../features/tasks/view";

const jobStatusOptions: Array<{ label: string; value: ReviewJobStatus | "ALL" }> = [
  { label: "全部队列状态", value: "ALL" },
  { label: "等待 AI 预审", value: "QUEUED" },
  { label: "AI 处理中", value: "RUNNING" },
  { label: "等待重试", value: "FAILED" },
  { label: "人工兜底", value: "NEEDS_HUMAN_REVIEW" },
  { label: "预审完成", value: "SUCCEEDED" },
];

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

interface QueueState {
  jobs: ReviewJobVO[];
  reviews: ReviewVO[];
  totalJobs: number;
  totalReviews: number;
}

const reviewPageSize = 20;

export function ReviewerReviewQueuePage() {
  const [jobStatus, setJobStatus] = useState<ReviewJobStatus | "ALL">("ALL");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | "ALL">("PENDING_HUMAN_REVIEW");
  const [aiConclusion, setAiConclusion] = useState<AiReviewConclusion | "ALL">("ALL");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [state, setState] = useState<QueueState>({ jobs: [], reviews: [], totalJobs: 0, totalReviews: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const keywordValue = keyword.trim() || undefined;
      const [jobPage, reviewResultPage] = await Promise.all([
        listReviewJobs({
          page: 1,
          pageSize: 8,
          status: jobStatus === "ALL" ? undefined : jobStatus,
          keyword: keywordValue,
        }),
        listReviews({
          page: reviewPage,
          pageSize: reviewPageSize,
          status: reviewStatus === "ALL" ? undefined : reviewStatus,
          aiConclusion: aiConclusion === "ALL" ? undefined : aiConclusion,
          keyword: keywordValue,
        }),
      ]);
      setState({
        jobs: jobPage.data,
        reviews: reviewResultPage.data,
        totalJobs: jobPage.pagination.totalItems,
        totalReviews: reviewResultPage.pagination.totalItems,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核队列暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [aiConclusion, jobStatus, keyword, reviewPage, reviewStatus]);

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
            审核工作台
          </Typography.Title>
          <Typography.Text type="secondary">
            阶段 4.4 聚焦待人工复核：按任务、AI 结论和状态筛选，进入详情查看多轮历史与提交差异。
          </Typography.Text>
        </div>
        <Space>
          <Tag color="blue">Phase 4.4</Tag>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Flex>

      <div className="labelhub-reviewer-summary-grid">
        <Card className="labelhub-stat-card">
          <Statistic title="待审记录" value={state.totalReviews} prefix={<AuditOutlined />} />
          <Typography.Text type="secondary">当前筛选下待人工处理</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="当前页建议通过" value={stats.pass} valueStyle={{ color: "#13a867" }} />
          <Typography.Text type="secondary">仍需 Reviewer 终审</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="当前页建议打回" value={stats.return} valueStyle={{ color: "#d46b08" }} />
          <Typography.Text type="secondary">重点查看问题与 diff</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="AI 运行队列" value={state.totalJobs} prefix={<ThunderboltOutlined />} />
          <Typography.Text type="secondary">Agent job 运行态</Typography.Text>
        </Card>
      </div>

      <Card className="labelhub-reviewer-filter-card">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              allowClear
              id="review-keyword-filter"
              name="keyword"
              aria-label="搜索任务标题或 ID"
              prefix={<SearchOutlined />}
              placeholder="搜索任务标题或 ID"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onPressEnter={triggerSearch}
              style={{ width: 260 }}
            />
            <Select
              value={reviewStatus}
              options={reviewStatusOptions}
              onChange={(value) => {
                setReviewPage(1);
                setReviewStatus(value);
              }}
              style={{ width: 172 }}
            />
            <Select
              value={aiConclusion}
              options={aiConclusionOptions}
              onChange={(value) => {
                setReviewPage(1);
                setAiConclusion(value);
              }}
              style={{ width: 172 }}
            />
            <Select
              value={jobStatus}
              options={jobStatusOptions}
              onChange={(value) => {
                setReviewPage(1);
                setJobStatus(value);
              }}
              style={{ width: 172 }}
            />
            <Button type="primary" ghost onClick={triggerSearch}>
              查询
            </Button>
          </Space>
          <Typography.Text type="secondary">AI 建议只负责排序和提示，最终通过/打回仍由人工确认。</Typography.Text>
        </Flex>
      </Card>

      {error && <Alert showIcon type="warning" message="审核队列加载失败" description={error} />}

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
                    showTotal={(total) => `共 ${total} 条待审记录`}
                    onChange={setReviewPage}
                  />
                </Flex>
              )}
            </div>
          )}
        </Card>

        <Space direction="vertical" size={16} className="labelhub-reviewer-side">
          <Card title="AI 预审运行队列" loading={loading}>
            {state.jobs.length === 0 ? (
              <Typography.Text type="secondary">暂无匹配的 AI job。</Typography.Text>
            ) : (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                {state.jobs.map((job) => (
                  <ReviewJobCompact key={job.id} job={job} />
                ))}
              </Space>
            )}
          </Card>

          <Card title="运行说明">
            <Space direction="vertical" size={12}>
              <StepLine icon={<DatabaseOutlined />} title="提交入队" description="每个提交版本只创建一个有效 review job。" />
              <StepLine icon={<ApiOutlined />} title="Agent 领取" description="OpenAI 兼容调用完成后写回 AI 建议和评分。" />
              <StepLine icon={<AuditOutlined />} title="人工终审" description="详情页展示历史与 diff，人工决策在阶段 4.5 启用。" />
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
    <div className="labelhub-reviewer-job-row" data-tone={conclusion?.color === "orange" ? "orange" : conclusion?.color === "green" ? "green" : "blue"}>
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
        <span>
          <ClockCircleOutlined /> 更新 {formatTaskTime(review.updatedAt)}
        </span>
        <Typography.Text type="secondary" copyable={{ text: review.id, tooltips: ["复制审核记录 ID", "已复制"] }}>
          审核流水 {formatReviewTraceCode(review.id)}
        </Typography.Text>
        <Button size="small" type="primary" onClick={() => navigate(buildReviewerReviewDetailPath(review.id))}>
          查看详情
        </Button>
      </div>
    </div>
  );
}

function ReviewJobCompact({ job }: { job: ReviewJobVO }) {
  const meta = reviewJobStatusMeta[job.status];
  return (
    <div className="labelhub-reviewer-review-mini">
      <Flex align="center" justify="space-between" gap={8} wrap="wrap">
        <Typography.Text strong className="labelhub-reviewer-review-title">
          {job.taskTitle || "未命名任务"}
        </Typography.Text>
        <Tag color={meta.color}>{meta.label}</Tag>
      </Flex>
      <Space size={[4, 4]} wrap style={{ marginTop: 6 }}>
        <Tag color="blue">{formatSubmissionVersion(job.submissionVersion)}</Tag>
        <Tag>尝试 {job.attemptCount}/{job.maxAttempts}</Tag>
        <Tag>{formatReviewTraceCode(job.id)}</Tag>
      </Space>
      {job.lockedBy && (
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 1 }} style={{ margin: "6px 0 0" }}>
          Agent {truncateMiddle(job.lockedBy, 12, 8)}
        </Typography.Paragraph>
      )}
      {job.lastError && (
        <Typography.Paragraph type="danger" ellipsis={{ rows: 2 }} style={{ margin: "6px 0 0" }}>
          {job.lastError}
        </Typography.Paragraph>
      )}
    </div>
  );
}

function StepLine({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="labelhub-reviewer-step">
      <span>{icon}</span>
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
