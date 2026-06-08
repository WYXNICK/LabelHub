import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
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

const resultPageSize = 20;
const resultStatusOptions: Array<{ label: string; value: ReviewStatus | "ALL" }> = [
  { label: "全部结果", value: "ALL" },
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

export function ReviewerReviewResultsPage() {
  const [status, setStatus] = useState<ReviewStatus | "ALL">("ALL");
  const [aiConclusion, setAiConclusion] = useState<AiReviewConclusion | "ALL">("ALL");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [reviews, setReviews] = useState<ReviewVO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listReviews({
        page,
        pageSize: resultPageSize,
        status: status === "ALL" ? undefined : status,
        aiConclusion: aiConclusion === "ALL" ? undefined : aiConclusion,
        keyword: keyword.trim() || undefined,
      });
      setReviews(result.data);
      setTotal(result.pagination.totalItems);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审核结果暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [aiConclusion, keyword, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => buildResultStats(reviews), [reviews]);
  const triggerSearch = () => {
    const nextKeyword = keywordInput.trim();
    setPage(1);
    setKeyword(nextKeyword);
    if (page === 1 && keyword === nextKeyword) {
      void load();
    }
  };

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 6 }}>
            审核结果
          </Typography.Title>
          <Typography.Text type="secondary">
            汇总 AI 预审建议与人工处理记录，为后续数据验收、导出和质量复盘提供可追溯依据。
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </Flex>

      <div className="labelhub-reviewer-summary-grid">
        <Card className="labelhub-stat-card">
          <Statistic title="当前结果" value={total} />
          <Typography.Text type="secondary">当前筛选范围</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="已通过" value={stats.approved} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#13a867" }} />
          <Typography.Text type="secondary">可进入后续验收导出</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="已打回" value={stats.returned} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#f54a45" }} />
          <Typography.Text type="secondary">等待标注员返修后再审</Typography.Text>
        </Card>
        <Card className="labelhub-stat-card">
          <Statistic title="平均 AI 分" value={stats.averageScore} suffix="分" precision={1} />
          <Typography.Text type="secondary">当前页已评分记录</Typography.Text>
        </Card>
      </div>

      <Card className="labelhub-reviewer-filter-card">
        <Flex align="center" justify="space-between" gap={12} wrap="wrap">
          <Space wrap>
            <Input
              allowClear
              id="review-results-keyword"
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
              id="review-results-status"
              value={status}
              options={resultStatusOptions}
              onChange={(value) => {
                setPage(1);
                setStatus(value);
              }}
              style={{ width: 172 }}
            />
            <Select
              id="review-results-ai-conclusion"
              value={aiConclusion}
              options={aiConclusionOptions}
              onChange={(value) => {
                setPage(1);
                setAiConclusion(value);
              }}
              style={{ width: 172 }}
            />
            <Button type="primary" ghost onClick={triggerSearch}>
              查询
            </Button>
          </Space>
          <Typography.Text type="secondary">结果页只做追溯与复盘，不直接改变审核状态。</Typography.Text>
        </Flex>
      </Card>

      {error && <Alert showIcon type="warning" message="审核结果加载失败" description={error} />}

      <Card className="labelhub-reviewer-queue-card" title="审核记录" loading={loading}>
        {reviews.length === 0 ? (
          <Empty description="当前筛选下暂无审核记录。" />
        ) : (
          <div className="labelhub-review-results-list">
            {reviews.map((review) => (
              <ReviewResultRow key={review.id} review={review} />
            ))}
            {total > resultPageSize && (
              <Flex justify="flex-end" className="labelhub-reviewer-pagination">
                <Pagination
                  current={page}
                  pageSize={resultPageSize}
                  total={total}
                  showSizeChanger={false}
                  showTotal={(nextTotal) => `共 ${nextTotal} 条审核记录`}
                  onChange={setPage}
                />
              </Flex>
            )}
          </div>
        )}
      </Card>
    </Space>
  );
}

function ReviewResultRow({ review }: { review: ReviewVO }) {
  const status = reviewStatusMeta[review.status];
  const conclusion = review.aiConclusion ? aiConclusionMeta[review.aiConclusion] : null;
  return (
    <div className="labelhub-review-result-row">
      <div>
        <Flex align="center" gap={10} wrap="wrap">
          <Typography.Text strong>{review.taskTitle || "未命名任务"}</Typography.Text>
          <Tag color={status.color}>{status.label}</Tag>
          {conclusion && <Tag color={conclusion.color}>{conclusion.label}</Tag>}
        </Flex>
        <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: "8px 0 0" }}>
          {review.aiComment || "暂无 AI 评语。"}
        </Typography.Paragraph>
        <Space size={[6, 6]} wrap>
          <Tag>{formatReviewTraceCode(review.id)}</Tag>
          <Tag color="blue">{formatSubmissionVersion(review.submissionVersion)}</Tag>
          <Tag>{formatReviewConfigVersion(review.reviewConfigVersionNo)}</Tag>
          <Tag>总分 {formatAiScoreTotal(review.aiScoreTotal)}</Tag>
          <Tag>问题 {review.aiIssueCount}</Tag>
        </Space>
      </div>
      <Space direction="vertical" size={8} align="end">
        <Typography.Text type="secondary">更新 {formatTaskTime(review.updatedAt)}</Typography.Text>
        <Button size="small" onClick={() => navigate(buildReviewerReviewDetailPath(review.id, { from: "results" }))}>
          查看详情
        </Button>
      </Space>
    </div>
  );
}

function buildResultStats(reviews: ReviewVO[]) {
  const scored = reviews
    .map((review) => review.aiScoreTotal)
    .filter((score): score is number => typeof score === "number");
  return {
    approved: reviews.filter((review) => review.status === "APPROVED").length,
    returned: reviews.filter((review) => review.status === "RETURNED").length,
    averageScore: scored.length ? scored.reduce((sum, score) => sum + score, 0) / scored.length : 0,
  };
}
